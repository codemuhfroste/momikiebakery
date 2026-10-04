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
  isUniqueFailure,
  readBatch,
  runBatch,
  stmt,
  type Statement,
} from "./db";
import { auditStmt, type AuditInput } from "./audit";
import { formatCurrency, round2 } from "./format";
import {
  PAYMENT_METHODS,
  hasWholesale,
  type Customer,
  type PaymentMethod,
  type PriceType,
  type Product,
  type Sale,
  type SaleItem,
} from "./types";

export interface Actor {
  name: string;
  role: string;
}

export interface CheckoutInput {
  // A line sold by the piece: qty pieces at unitPrice each. A line sold by the
  // product's wholesale pack: `packs` packs at unitPrice per pack (qty is
  // then worked out here from the pack size).
  items: { productId: number; qty: number; unitPrice: number; packs?: number | null; barcode?: string | null }[];
  // Retail or wholesale, as chosen at the register (default: wholesale if
  // any line is sold by the pack).
  priceType?: PriceType;
  discount: number;
  paymentMethod: PaymentMethod;
  // Cash: the amount handed over. Credit: the down payment (0 = all on credit).
  amountTendered: number;
  customerId?: number | null; // required for Credit
  // Set for sales made on the mobile app (possibly while offline) and sent
  // later. See the "offline" notes in tryCheckout.
  offline?: OfflineSaleInfo;
}

export interface OfflineSaleInfo {
  clientUuid: string; // unique per sale, made on the phone; re-sending the same sale is harmless
  recordedAt: string; // ISO time the sale was rung up on the phone
  deviceSrp?: Record<string, number>; // the SRP the phone showed, per product id
  deviceWholesale?: Record<string, number>; // the wholesale (per pack) price the phone showed
}

export type CheckoutResult =
  | { error: string }
  | { saleId: number; receiptNo: string; note?: string | null; duplicate?: boolean };

const MAX_OFFLINE_AGE_MS = 45 * 86400_000;

// A phone's clock may be wrong after a blackout. Never in the future, never
// absurdly old; otherwise trust it so the sale lands on the right day.
export function clampRecordedAt(iso: string): string {
  const t = Date.parse(iso);
  const now = Date.now();
  if (!Number.isFinite(t) || t > now + 5 * 60_000 || t < now - MAX_OFFLINE_AGE_MS) return new Date(now).toISOString();
  return new Date(t).toISOString();
}

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
    const qty = Number(item.packs ?? item.qty);
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
  // Offline sales made on the phone: the sale already happened, so it is
  // recorded even if stock ran out or the credit limit was passed meanwhile
  // (those are flagged in sync_note for the owner instead of refused), it is
  // dated when it happened, and re-sending the same clientUuid returns the
  // sale already recorded rather than recording it twice.
  const offline = input.offline;
  const recordedAt = offline ? clampRecordedAt(offline.recordedAt) : null;
  const saleTime = recordedAt ? new Date(recordedAt).getTime() : Date.now();
  const day = new Date(saleTime + 8 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `MOM-${day}-`;

  // ---- Read everything in one round trip ----
  const reads: Statement[] = [
    { sql: `SELECT * FROM products WHERE id IN (${inList(productIds)})`, args: productIds },
  ];
  // An offline credit sale still counts if the customer was deactivated
  // after the phone last synced.
  if (isCredit) {
    reads.push(stmt`
      SELECT c.*, COALESCE((SELECT SUM(amount) FROM credit_ledger l WHERE l.customer_id = c.id), 0) AS balance
      FROM customers c WHERE c.id = ${input.customerId} AND (c.is_active = 1 OR ${offline ? 1 : 0} = 1)`);
  }
  reads.push(stmt`SELECT id, receipt_no, sync_note FROM sales WHERE client_uuid = ${offline?.clientUuid ?? null}`);
  const results = await readBatch<Record<string, unknown>[][]>(reads);
  const productRows = results[0] as unknown as Product[];
  const customerRows = isCredit ? (results[1] as unknown as Customer[]) : undefined;
  const [already] = results[results.length - 1] as unknown as { id: number; receipt_no: string; sync_note: string | null }[];
  if (offline && already) return { saleId: already.id, receiptNo: already.receipt_no, note: already.sync_note, duplicate: true };
  const products = new Map(productRows.map((p) => [p.id, p]));
  const notes: string[] = [];

  // ---- Work out the sale ----
  // Every line is kept in pieces (qty, price per piece, list price per piece)
  // so stock, cost and profit work the same for both; a line sold by the
  // pack also keeps its packs and pack price for the receipt.
  let subtotal = 0;
  const lines: {
    product: Product;
    qty: number;
    unitPrice: number; // per piece
    srp: number; // list price per piece: SRP, or wholesale price ÷ pack size
    lineTotal: number;
    pack: { packs: number; name: string; size: number; price: number; listPrice: number } | null;
    barcode: string | null;
  }[] = [];
  const qtyByProduct = new Map<number, number>();
  for (const item of input.items) {
    const product = products.get(Number(item.productId));
    if (!product || (!product.is_active && !offline)) return { error: "A product in the cart is no longer available." };
    const byPack = item.packs != null;
    if (byPack && !hasWholesale(product)) return { error: `${product.name} has no wholesale pack set up.` };
    const barcode = item.barcode ?? product.barcode;
    if (byPack) {
      const packs = Number(item.packs);
      const size = product.pack_size!;
      const price = round2(Number(item.unitPrice));
      // Offline: compare against the wholesale price the phone showed.
      const listPrice = offline?.deviceWholesale?.[String(product.id)] ?? product.wholesale_price!;
      const qty = packs * size;
      const lineTotal = round2(packs * price);
      qtyByProduct.set(product.id, (qtyByProduct.get(product.id) ?? 0) + qty);
      subtotal += lineTotal;
      lines.push({
        product, qty, unitPrice: price / size, srp: listPrice / size, lineTotal, barcode,
        pack: { packs, name: product.pack_name!, size, price, listPrice },
      });
    } else {
      const qty = Number(item.qty);
      const unitPrice = round2(Number(item.unitPrice));
      const lineTotal = round2(unitPrice * qty);
      qtyByProduct.set(product.id, (qtyByProduct.get(product.id) ?? 0) + qty);
      subtotal += lineTotal;
      // Offline: compare against the SRP the phone showed, not today's.
      const srp = offline?.deviceSrp?.[String(product.id)] ?? product.srp;
      lines.push({ product, qty, unitPrice, srp, lineTotal, pack: null, barcode });
    }
  }
  const priceType: PriceType =
    input.priceType === "wholesale" || input.priceType === "retail"
      ? input.priceType
      : lines.some((l) => l.pack)
        ? "wholesale"
        : "retail";
  for (const [id, qty] of qtyByProduct) {
    const p = products.get(id)!;
    if (p.stock_qty < qty) {
      if (!offline) return { error: `Not enough stock for ${p.name} (${p.stock_qty} left).` };
      notes.push(`${p.name}: sold ${qty} with ${p.stock_qty} in stock`);
    }
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
      if (!offline) {
        return {
          error: `This exceeds ${customer.name}'s credit limit. Available credit: ${formatCurrency(available)}.`,
        };
      }
      notes.push(`${customer.name} went over their credit limit (${formatCurrency(available)} was available)`);
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
  let guardSql = offline ? "1" : `NOT EXISTS (SELECT 1 FROM products WHERE ${stockOk})`;
  const guardArgs: unknown[] = offline ? [] : [...stockArgs];
  if (customer && !offline) {
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
                               cashier_name, customer_id, credit_amount, created_at, client_uuid, source, sync_note, price_type)
            SELECT ${receiptNoSql}, ?, ?, ?, ?, ?, ?, ?, ?,
                   COALESCE(?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), ?, ?, ?, ? WHERE ${guardSql}`,
      args: [
        ...receiptNoArgs, subtotal, discount, total, input.paymentMethod, tendered,
        actor.name, customer?.id ?? null, creditAmount,
        recordedAt, offline?.clientUuid ?? null, offline ? "mobile" : "web", notes.length ? notes.join("; ") : null, priceType,
        ...guardArgs,
      ],
    },
    GUARD_CHANGED,
  ];

  const audits = [
    receiptAudit({
      actorName: actor.name,
      actorRole: actor.role,
      action: "sale.create",
      summary: `${priceType === "wholesale" ? "Wholesale sale" : "Sale"} ${receiptNo} — ${formatCurrency(total)}${offline ? " (mobile app)" : ""}`,
      details: { receiptNo, ...(offline ? { recordedAt, clientUuid: offline.clientUuid } : {}) },
    }),
  ];

  for (const l of lines) {
    batch.push(
      {
        sql: `INSERT INTO sale_items (sale_id, product_id, name, barcode, qty, srp, unit_price, unit_cost, line_total,
                                      packs, pack_name, pack_size, pack_price)
              VALUES (${saleId.sql}, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [...saleId.args, l.product.id, l.product.name, l.barcode, l.qty, l.srp,
               l.unitPrice, l.product.cost, l.lineTotal,
               l.pack?.packs ?? null, l.pack?.name ?? null, l.pack?.size ?? null, l.pack?.price ?? null],
      },
      stmt`UPDATE products SET stock_qty = stock_qty - ${l.qty},
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ${l.product.id}`,
      {
        sql: `INSERT INTO stock_movements (product_id, change_qty, reason, sale_id, actor_name, created_at)
              VALUES (?, ?, 'sale', ${saleId.sql}, ?, COALESCE(?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))`,
        args: [l.product.id, -l.qty, ...saleId.args, actor.name, recordedAt],
      }
    );
    if (l.pack ? Math.abs(l.pack.price - l.pack.listPrice) > 0.004 : Math.abs(l.unitPrice - l.srp) > 0.004) {
      const [charged, list, label] = l.pack
        ? [l.pack.price, l.pack.listPrice, `per ${l.pack.name} vs wholesale`]
        : [l.unitPrice, l.srp, "vs SRP"];
      const diff = round2(charged - list);
      audits.push(
        receiptAudit({
          actorName: actor.name,
          actorRole: actor.role,
          action: "price.override",
          summary: `${l.product.name} sold at ${formatCurrency(charged)} ${label} ${formatCurrency(list)} (${diff > 0 ? "+" : ""}${diff.toFixed(2)}) on ${receiptNo}`,
          details: {
            receiptNo, productId: l.product.id, name: l.product.name, srp: l.srp, unitPrice: l.unitPrice, qty: l.qty,
            ...(l.pack ? { packs: l.pack.packs, pack: l.pack.name, packPrice: l.pack.price, wholesalePrice: l.pack.listPrice } : {}),
          },
        })
      );
    }
  }

  if (customer) {
    batch.push({
      sql: `INSERT INTO credit_ledger (customer_id, entry_type, amount, sale_id, actor_name, created_at)
            VALUES (?, 'charge', ?, ${saleId.sql}, ?, COALESCE(?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))`,
      args: [customer.id, creditAmount, ...saleId.args, actor.name, recordedAt],
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

  if (offline && notes.length) {
    audits.push(
      receiptAudit({
        actorName: actor.name,
        actorRole: actor.role,
        action: "sale.offline_flag",
        summary: `Mobile sale ${receiptNo} needs a look: ${notes.join("; ")}`,
        details: { receiptNo, notes },
      })
    );
  }

  batch.push(...audits, { sql: `SELECT id, receipt_no FROM sales WHERE id = ${saleId.sql}`, args: [] });

  try {
    const done = await runBatch(batch);
    const [sale] = done[done.length - 1] as { id: number; receipt_no: string }[];
    return { saleId: sale.id, receiptNo: sale.receipt_no, note: notes.length ? notes.join("; ") : null };
  } catch (err) {
    if (isGuardFailure(err)) return "retry";
    // The same offline sale arriving twice at the same instant: the second
    // copy hits the unique client_uuid; the retry then finds and returns the
    // one that was recorded.
    if (offline && isUniqueFailure(err, "client_uuid")) return "retry";
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
