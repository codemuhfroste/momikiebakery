// Sale and void logic, kept free of Next.js request APIs so it can run from a
// server action or from a plain script/test. Server actions in
// src/app/pos/actions.ts and src/app/sales/actions.ts add the session check
// and cache revalidation around these.
import { getDb } from "./db";
import { logAudit } from "./audit";
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

interface Override {
  productId: number;
  name: string;
  srp: number;
  unitPrice: number;
  qty: number;
}

// Rings up a sale in one transaction: sale + lines + stock decrement + stock
// movements, plus a credit-ledger charge when the sale is on credit. Prices
// are re-read from the database; any line charged at something other than
// the product's SRP is recorded and written to the audit log.
export async function processCheckout(actor: Actor, input: CheckoutInput): Promise<CheckoutResult> {
  if (!input.items?.length) return { error: "The cart is empty." };
  if (!PAYMENT_METHODS.includes(input.paymentMethod)) return { error: "Invalid payment method." };
  const isCredit = input.paymentMethod === "Credit";
  if (isCredit && !input.customerId) return { error: "Choose the customer this sale is credited to." };

  const overrides: Override[] = [];
  let customerName: string | null = null;

  try {
    const result = await getDb().begin(async (tx) => {
      let subtotal = 0;
      const lines: { product: Product; qty: number; unitPrice: number; barcode: string | null }[] = [];

      for (const item of input.items) {
        const qty = Number(item.qty);
        const unitPrice = round2(Number(item.unitPrice));
        if (!(qty > 0) || !(unitPrice >= 0) || !Number.isFinite(unitPrice)) {
          throw new Error("A cart line has an invalid quantity or price.");
        }
        const rows = await tx<Product[]>`SELECT * FROM products WHERE id = ${item.productId} AND is_active = 1`;
        const product = rows[0];
        if (!product) throw new Error("A product in the cart is no longer available.");
        if (product.stock_qty < qty) {
          throw new Error(`Not enough stock for ${product.name} (${product.stock_qty} left).`);
        }
        subtotal += unitPrice * qty;
        lines.push({ product, qty, unitPrice, barcode: item.barcode ?? product.barcode });
      }

      subtotal = round2(subtotal);
      const discount = Math.min(Math.max(round2(Number(input.discount) || 0), 0), subtotal);
      const total = round2(subtotal - discount);

      let tendered: number;
      let creditAmount = 0;
      let customerId: number | null = null;

      if (isCredit) {
        const [customer] = await tx<Customer[]>`
          SELECT c.*, COALESCE((SELECT SUM(amount) FROM credit_ledger l WHERE l.customer_id = c.id), 0) AS balance
          FROM customers c WHERE c.id = ${input.customerId} AND c.is_active = 1`;
        if (!customer) throw new Error("That customer isn't available for credit.");
        tendered = round2(Number(input.amountTendered) || 0);
        if (tendered < 0) throw new Error("The down payment can't be negative.");
        if (tendered >= total) throw new Error("The down payment covers the full total — use Cash instead.");
        creditAmount = round2(total - tendered);
        if (customer.credit_limit != null && customer.balance + creditAmount > customer.credit_limit + 0.004) {
          const available = Math.max(customer.credit_limit - customer.balance, 0);
          throw new Error(
            `This exceeds ${customer.name}'s credit limit. Available credit: ${formatCurrency(available)}.`
          );
        }
        customerId = customer.id;
        customerName = customer.name;
      } else {
        tendered = input.paymentMethod === "Cash" ? round2(Number(input.amountTendered) || 0) : total;
        if (tendered < total) throw new Error("Amount tendered is less than the total.");
      }

      const day = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "");
      const prefix = `MOM-${day}-`;
      const [{ n }] = await tx<{ n: number }[]>`
        SELECT COUNT(*) AS n FROM sales WHERE receipt_no LIKE ${prefix + "%"}`;
      const receiptNo = `${prefix}${String(n + 1).padStart(4, "0")}`;

      const [{ id: saleId }] = await tx<{ id: number }[]>`
        INSERT INTO sales (receipt_no, subtotal, discount, total, payment_method, amount_tendered,
                           cashier_name, customer_id, credit_amount)
        VALUES (${receiptNo}, ${subtotal}, ${discount}, ${total}, ${input.paymentMethod}, ${tendered},
                ${actor.name}, ${customerId}, ${creditAmount})
        RETURNING id`;

      for (const l of lines) {
        await tx`
          INSERT INTO sale_items (sale_id, product_id, name, barcode, qty, srp, unit_price, unit_cost, line_total)
          VALUES (${saleId}, ${l.product.id}, ${l.product.name}, ${l.barcode}, ${l.qty}, ${l.product.srp},
                  ${l.unitPrice}, ${l.product.cost}, ${round2(l.unitPrice * l.qty)})`;
        await tx`UPDATE products SET stock_qty = stock_qty - ${l.qty},
                   updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ${l.product.id}`;
        await tx`INSERT INTO stock_movements (product_id, change_qty, reason, sale_id, actor_name)
                 VALUES (${l.product.id}, ${-l.qty}, 'sale', ${saleId}, ${actor.name})`;
        if (Math.abs(l.unitPrice - l.product.srp) > 0.004) {
          overrides.push({
            productId: l.product.id,
            name: l.product.name,
            srp: l.product.srp,
            unitPrice: l.unitPrice,
            qty: l.qty,
          });
        }
      }

      if (customerId != null) {
        await tx`INSERT INTO credit_ledger (customer_id, entry_type, amount, sale_id, actor_name)
                 VALUES (${customerId}, 'charge', ${creditAmount}, ${saleId}, ${actor.name})`;
      }
      return { saleId, receiptNo, total, creditAmount, customerId };
    });

    await logAudit({
      actorName: actor.name,
      actorRole: actor.role,
      action: "sale.create",
      summary: `Sale ${result.receiptNo} — ${formatCurrency(result.total)}`,
      details: { saleId: result.saleId },
    });
    if (result.customerId != null) {
      await logAudit({
        actorName: actor.name,
        actorRole: actor.role,
        action: "credit.charge",
        summary: `${formatCurrency(result.creditAmount)} charged to ${customerName}'s account (${result.receiptNo})`,
        details: { customerId: result.customerId, saleId: result.saleId, amount: result.creditAmount },
      });
    }
    for (const o of overrides) {
      const diff = round2(o.unitPrice - o.srp);
      await logAudit({
        actorName: actor.name,
        actorRole: actor.role,
        action: "price.override",
        summary: `${o.name} sold at ${formatCurrency(o.unitPrice)} vs SRP ${formatCurrency(o.srp)} (${diff > 0 ? "+" : ""}${diff.toFixed(2)}) on ${result.receiptNo}`,
        details: { receiptNo: result.receiptNo, saleId: result.saleId, ...o },
      });
    }

    return { saleId: result.saleId, receiptNo: result.receiptNo };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Checkout failed." };
  }
}

// Marks a sale voided (the row is kept), restores its stock, and reverses
// any credit charge on the customer's account.
export async function processVoid(
  actor: Actor,
  saleId: number,
  reason: string
): Promise<{ error?: string; ok?: string }> {
  reason = reason.trim();
  if (!reason) return { error: "Give a reason for the void." };

  const sql = getDb();
  const [sale] = await sql<Sale[]>`SELECT * FROM sales WHERE id = ${saleId}`;
  if (!sale) return { error: "Sale not found." };
  if (sale.voided_at) return { error: "This sale is already voided." };
  // Voiding would cancel the charge but leave the customer's payment
  // pointing at a cancelled receipt, so a credit sale that has been (partly)
  // paid has to be settled with the customer first.
  const [{ paid }] = await sql<{ paid: number }[]>`
    SELECT COALESCE(SUM(amount), 0) AS paid FROM credit_allocations WHERE sale_id = ${saleId}`;
  if (paid > 0.004) {
    return {
      error: `${formatCurrency(paid)} has already been paid on this receipt, so it can't be voided. Settle the refund with the customer first.`,
    };
  }
  const items = await sql<SaleItem[]>`SELECT * FROM sale_items WHERE sale_id = ${saleId}`;

  await sql.begin(async (tx) => {
    await tx`UPDATE sales SET voided_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
               voided_by = ${actor.name}, void_reason = ${reason} WHERE id = ${saleId}`;
    for (const i of items) {
      if (i.product_id == null) continue;
      await tx`UPDATE products SET stock_qty = stock_qty + ${i.qty} WHERE id = ${i.product_id}`;
      await tx`INSERT INTO stock_movements (product_id, change_qty, reason, sale_id, note, actor_name)
               VALUES (${i.product_id}, ${i.qty}, 'void', ${saleId}, ${reason}, ${actor.name})`;
    }
    if (sale.customer_id != null && sale.credit_amount > 0) {
      await tx`INSERT INTO credit_ledger (customer_id, entry_type, amount, sale_id, note, actor_name)
               VALUES (${sale.customer_id}, 'void', ${-sale.credit_amount}, ${saleId}, ${reason}, ${actor.name})`;
    }
  });

  await logAudit({
    actorName: actor.name,
    actorRole: actor.role,
    action: "sale.void",
    summary: `Voided ${sale.receipt_no} (${formatCurrency(sale.total)}): ${reason}`,
    details: { saleId, receiptNo: sale.receipt_no, reason },
  });
  if (sale.customer_id != null && sale.credit_amount > 0) {
    await logAudit({
      actorName: actor.name,
      actorRole: actor.role,
      action: "credit.void",
      summary: `${formatCurrency(sale.credit_amount)} credit reversed for voided ${sale.receipt_no}`,
      details: { customerId: sale.customer_id, saleId, amount: sale.credit_amount },
    });
  }
  return { ok: "Sale voided." };
}
