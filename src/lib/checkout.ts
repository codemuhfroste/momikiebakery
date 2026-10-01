// Sale and void logic, kept free of Next.js request APIs so it can run from a
// server action or from a plain script/test. Server actions in
// src/app/pos/actions.ts and src/app/sales/actions.ts add the session check
// and cache revalidation around these.
//
// Each operation does one round of reads, then commits everything with a
// single batch (see db.ts for why). Anything that must still be true at
// commit time — enough stock, credit limit not exceeded, sale not already
// voided — is checked inside the batch itself, so a change made by another
// register in between can never be overwritten.
import {
  GUARD_CHANGED,
  isGuardFailure,
  readBatch,
  runBatch,
  stmt,
  type Statement,
} from "./db";
import { auditStmt, type AuditInput } from "./audit";
import { formatCurrency, round2 } from "./format";
import { PAYMENT_METHODS, type Customer, type PaymentMethod, type Product, type Sale, type SaleItem } from "./types";

export interface Actor {
  name: string;
  role: string;
}

export interface CheckoutInput {
  items: { productId: number; qty: number; unitPrice: number; barcode?: string | null }[];
  discount: number;
  paymentMethod: PaymentMethod;
  // Cash: the amount handed over. Credit: the down payment (0 = all on credit).
  amountTendered: number;
  customerId?: number | null; // required for Credit
}

export type CheckoutResult = { error: string } | { saleId: number; receiptNo: string };

const RECEIPT_TOKEN = "#RECEIPT#";

// An audit entry for the sale being saved: its summary/details mention the
// receipt number, which only exists once the sale row is inserted, so the
// token is replaced from the newest sale row inside the same batch.
function receiptAudit(input: AuditInput): Statement {
  const { sql, args } = auditStmt(input);
  void sql;
  const [actorName, actorRole, action, summary, details] = args;
  return {
    sql: `INSERT INTO audit_log (actor_name, actor_role, action, summary, details)
          SELECT ?, ?, ?, replace(?, '${RECEIPT_TOKEN}', receipt_no), replace(?, '${RECEIPT_TOKEN}', receipt_no)
          FROM sales WHERE id = (SELECT MAX(id) FROM sales)`,
    args: [actorName, actorRole, action, summary, details],
  };
}

function inList(ids: number[]): string {
  return ids.map(() => "?").join(", ");
}

// Rings up a sale: sale + lines + stock decrement + stock movements, plus a
// credit-ledger charge when the sale is on credit, and the audit entries —
// all in one batch. Prices are re-read from the database; any line charged
// at something other than the product's SRP is recorded and audited.
export async function processCheckout(actor: Actor, input: CheckoutInput): Promise<CheckoutResult> {
  if (!input.items?.length) return { error: "The cart is empty." };
  if (!PAYMENT_METHODS.includes(input.paymentMethod)) return { error: "Invalid payment method." };
  const isCredit = input.paymentMethod === "Credit";
  if (isCredit && !input.customerId) return { error: "Choose the customer this sale is credited to." };

  for (const item of input.items) {
    const qty = Number(item.qty);
    const price = Number(item.unitPrice);
    if (!(qty > 0) || !(price >= 0) || !Number.isFinite(price)) {
      return { error: "A cart line has an invalid quantity or price." };
    }
  }

  // Two attempts: if the batch's guards trip (stock or credit changed since
  // we read it), the second pass re-reads and either succeeds or reports
  // exactly why not.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = await tryCheckout(actor, input, isCredit);
    if (result !== "retry") return result;
  }
  return { error: "Stock or credit changed while saving. Please check the cart and try again." };
}

async function tryCheckout(
  actor: Actor,
  input: CheckoutInput,
  isCredit: boolean
): Promise<CheckoutResult | "retry"> {
  const productIds = [...new Set(input.items.map((i) => Number(i.productId)))];
  const day = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `MOM-${day}-`;

  // ---- Read everything in one round trip ----
  const reads: Statement[] = [
    { sql: `SELECT * FROM products WHERE id IN (${inList(productIds)})`, args: productIds },
  ];
  if (isCredit) {
    reads.push(stmt`
      SELECT c.*, COALESCE((SELECT SUM(amount) FROM credit_ledger l WHERE l.customer_id = c.id), 0) AS balance
      FROM customers c WHERE c.id = ${input.customerId} AND c.is_active = 1`);
  }
  const [productRows, customerRows] = await readBatch<[Product[], Customer[]?]>(reads);
  const products = new Map(productRows.map((p) => [p.id, p]));

  // ---- Work out the sale ----
  let subtotal = 0;
  const lines: { product: Product; qty: number; unitPrice: number; barcode: string | null }[] = [];
  const qtyByProduct = new Map<number, number>();
  for (const item of input.items) {
    const product = products.get(Number(item.productId));
    if (!product || !product.is_active) return { error: "A product in the cart is no longer available." };
    const qty = Number(item.qty);
    const unitPrice = round2(Number(item.unitPrice));
    qtyByProduct.set(product.id, (qtyByProduct.get(product.id) ?? 0) + qty);
    subtotal += unitPrice * qty;
    lines.push({ product, qty, unitPrice, barcode: item.barcode ?? product.barcode });
  }
  for (const [id, qty] of qtyByProduct) {
    const p = products.get(id)!;
    if (p.stock_qty < qty) return { error: `Not enough stock for ${p.name} (${p.stock_qty} left).` };
  }

  subtotal = round2(subtotal);
  const discount = Math.min(Math.max(round2(Number(input.discount) || 0), 0), subtotal);
  const total = round2(subtotal - discount);

  let tendered: number;
  let creditAmount = 0;
  let customer: Customer | null = null;
  if (isCredit) {
    customer = customerRows?.[0] ?? null;
    if (!customer) return { error: "That customer isn't available for credit." };
    tendered = round2(Number(input.amountTendered) || 0);
    if (tendered < 0) return { error: "The down payment can't be negative." };
    if (tendered >= total) return { error: "The down payment covers the full total — use Cash instead." };
    creditAmount = round2(total - tendered);
    if (customer.credit_limit != null && customer.balance + creditAmount > customer.credit_limit + 0.004) {
      const available = Math.max(customer.credit_limit - customer.balance, 0);
      return {
        error: `This exceeds ${customer.name}'s credit limit. Available credit: ${formatCurrency(available)}.`,
      };
    }
  } else {
    tendered = input.paymentMethod === "Cash" ? round2(Number(input.amountTendered) || 0) : total;
    if (tendered < total) return { error: "Amount tendered is less than the total." };
  }

  // The receipt number is worked out inside the INSERT (today's highest + 1).
  // Batches run one at a time, so two registers can never get the same
  // number. Everything after the sale INSERT finds the new sale as the
  // newest row — nothing else can insert a sale mid-batch.
  const receiptNoSql = `? || printf('%04d', COALESCE((SELECT MAX(CAST(substr(receipt_no, ?) AS INTEGER))
                         FROM sales WHERE receipt_no LIKE ?), 0) + 1)`;
  const receiptNoArgs = [prefix, prefix.length + 1, prefix + "%"];
  const saleId = { sql: "(SELECT MAX(id) FROM sales)", args: [] as unknown[] };
  // Audit text is written with this token and filled in with the receipt
  // number inside the batch (see receiptAudit below).
  const receiptNo = RECEIPT_TOKEN;

  // ---- Commit in one batch ----
  // The sale row is only inserted if every product still has enough stock
  // (and, on credit, the customer is still within their limit); otherwise
  // GUARD_CHANGED aborts the whole batch.
  const stockOk = [...qtyByProduct].map(() => "(id = ? AND (is_active = 0 OR stock_qty < ?))").join(" OR ");
  const stockArgs = [...qtyByProduct].flatMap(([id, qty]) => [id, qty]);
  let guardSql = `NOT EXISTS (SELECT 1 FROM products WHERE ${stockOk})`;
  const guardArgs: unknown[] = [...stockArgs];
  if (customer) {
    guardSql += " AND EXISTS (SELECT 1 FROM customers WHERE id = ? AND is_active = 1)";
    guardArgs.push(customer.id);
    if (customer.credit_limit != null) {
      guardSql += " AND COALESCE((SELECT SUM(amount) FROM credit_ledger WHERE customer_id = ?), 0) + ? <= ? + 0.004";
      guardArgs.push(customer.id, creditAmount, customer.credit_limit);
    }
  }

  const batch: Statement[] = [
    {
      sql: `INSERT INTO sales (receipt_no, subtotal, discount, total, payment_method, amount_tendered,
                               cashier_name, customer_id, credit_amount)
            SELECT ${receiptNoSql}, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guardSql}`,
      args: [
        ...receiptNoArgs, subtotal, discount, total, input.paymentMethod, tendered,
        actor.name, customer?.id ?? null, creditAmount, ...guardArgs,
      ],
    },
    GUARD_CHANGED,
  ];

  const audits = [
    receiptAudit({
      actorName: actor.name,
      actorRole: actor.role,
      action: "sale.create",
      summary: `Sale ${receiptNo} — ${formatCurrency(total)}`,
      details: { receiptNo },
    }),
  ];

  for (const l of lines) {
    batch.push(
      {
        sql: `INSERT INTO sale_items (sale_id, product_id, name, barcode, qty, srp, unit_price, unit_cost, line_total)
              VALUES (${saleId.sql}, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [...saleId.args, l.product.id, l.product.name, l.barcode, l.qty, l.product.srp,
               l.unitPrice, l.product.cost, round2(l.unitPrice * l.qty)],
      },
      stmt`UPDATE products SET stock_qty = stock_qty - ${l.qty},
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ${l.product.id}`,
      {
        sql: `INSERT INTO stock_movements (product_id, change_qty, reason, sale_id, actor_name)
              VALUES (?, ?, 'sale', ${saleId.sql}, ?)`,
        args: [l.product.id, -l.qty, ...saleId.args, actor.name],
      }
    );
    if (Math.abs(l.unitPrice - l.product.srp) > 0.004) {
      const diff = round2(l.unitPrice - l.product.srp);
      audits.push(
        receiptAudit({
          actorName: actor.name,
          actorRole: actor.role,
          action: "price.override",
          summary: `${l.product.name} sold at ${formatCurrency(l.unitPrice)} vs SRP ${formatCurrency(l.product.srp)} (${diff > 0 ? "+" : ""}${diff.toFixed(2)}) on ${receiptNo}`,
          details: { receiptNo, productId: l.product.id, name: l.product.name, srp: l.product.srp, unitPrice: l.unitPrice, qty: l.qty },
        })
      );
    }
  }

  if (customer) {
    batch.push({
      sql: `INSERT INTO credit_ledger (customer_id, entry_type, amount, sale_id, actor_name)
            VALUES (?, 'charge', ?, ${saleId.sql}, ?)`,
      args: [customer.id, creditAmount, ...saleId.args, actor.name],
    });
    audits.push(
      receiptAudit({
        actorName: actor.name,
        actorRole: actor.role,
        action: "credit.charge",
        summary: `${formatCurrency(creditAmount)} charged to ${customer.name}'s account (${receiptNo})`,
        details: { customerId: customer.id, receiptNo, amount: creditAmount },
      })
    );
  }

  batch.push(...audits, { sql: `SELECT id, receipt_no FROM sales WHERE id = ${saleId.sql}`, args: [] });

  try {
    const results = await runBatch(batch);
    const [sale] = results[results.length - 1] as { id: number; receipt_no: string }[];
    return { saleId: sale.id, receiptNo: sale.receipt_no };
  } catch (err) {
    if (isGuardFailure(err)) return "retry";
    return { error: err instanceof Error ? err.message : "Checkout failed." };
  }
}

// Marks a sale voided (the row is kept), restores its stock, and reverses
// any credit charge on the customer's account — in one batch.
export async function processVoid(
  actor: Actor,
  saleId: number,
  reason: string
): Promise<{ error?: string; ok?: string }> {
  reason = reason.trim();
  if (!reason) return { error: "Give a reason for the void." };

  const [[sale], items, [{ paid }]] = await readBatch<[Sale[], SaleItem[], { paid: number }[]]>([
    stmt`SELECT * FROM sales WHERE id = ${saleId}`,
    stmt`SELECT * FROM sale_items WHERE sale_id = ${saleId}`,
    stmt`SELECT COALESCE(SUM(amount), 0) AS paid FROM credit_allocations WHERE sale_id = ${saleId}`,
  ]);
  if (!sale) return { error: "Sale not found." };
  if (sale.voided_at) return { error: "This sale is already voided." };
  // Voiding would cancel the charge but leave the customer's payment
  // pointing at a cancelled receipt, so a credit sale that has been (partly)
  // paid has to be settled with the customer first.
  if (paid > 0.004) {
    return {
      error: `${formatCurrency(paid)} has already been paid on this receipt, so it can't be voided. Settle the refund with the customer first.`,
    };
  }

  // The UPDATE only matches if the sale is still un-voided and still has no
  // payments; otherwise the guard aborts, so stock is never restored twice.
  const batch: Statement[] = [
    stmt`UPDATE sales SET voided_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
           voided_by = ${actor.name}, void_reason = ${reason}
         WHERE id = ${saleId} AND voided_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM credit_allocations WHERE sale_id = ${saleId})`,
    GUARD_CHANGED,
  ];
  for (const i of items) {
    if (i.product_id == null) continue;
    batch.push(
      stmt`UPDATE products SET stock_qty = stock_qty + ${i.qty} WHERE id = ${i.product_id}`,
      stmt`INSERT INTO stock_movements (product_id, change_qty, reason, sale_id, note, actor_name)
           VALUES (${i.product_id}, ${i.qty}, 'void', ${saleId}, ${reason}, ${actor.name})`
    );
  }
  batch.push(
    auditStmt({
      actorName: actor.name,
      actorRole: actor.role,
      action: "sale.void",
      summary: `Voided ${sale.receipt_no} (${formatCurrency(sale.total)}): ${reason}`,
      details: { saleId, receiptNo: sale.receipt_no, reason },
    })
  );
  if (sale.customer_id != null && sale.credit_amount > 0) {
    batch.push(
      stmt`INSERT INTO credit_ledger (customer_id, entry_type, amount, sale_id, note, actor_name)
           VALUES (${sale.customer_id}, 'void', ${-sale.credit_amount}, ${saleId}, ${reason}, ${actor.name})`,
      auditStmt({
        actorName: actor.name,
        actorRole: actor.role,
        action: "credit.void",
        summary: `${formatCurrency(sale.credit_amount)} credit reversed for voided ${sale.receipt_no}`,
        details: { customerId: sale.customer_id, saleId, amount: sale.credit_amount },
      })
    );
  }

  try {
    await runBatch(batch);
  } catch (err) {
    if (isGuardFailure(err)) {
      return { error: "This sale was just voided or paid from another screen. Refresh to see its current state." };
    }
    throw err;
  }
  return { ok: "Sale voided." };
}
