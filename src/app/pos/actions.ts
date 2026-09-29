"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/rbac";
import { getDb } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { round2 } from "@/lib/format";
import { PAYMENT_METHODS, type PaymentMethod, type Product } from "@/lib/types";

export interface CheckoutInput {
  items: { productId: number; qty: number; unitPrice: number; barcode?: string | null }[];
  discount: number;
  paymentMethod: PaymentMethod;
  amountTendered: number;
}

export type CheckoutResult = { error: string } | { saleId: number; receiptNo: string };

interface Override {
  productId: number;
  name: string;
  srp: number;
  unitPrice: number;
  qty: number;
}

// Rings up a sale in one transaction: sale + lines + stock decrement +
// stock movements. Prices are re-read from the database — the client only
// says which product and what price it charged; any price that differs from
// the product's SRP is recorded on the line and written to the audit log.
export async function checkoutAction(input: CheckoutInput): Promise<CheckoutResult> {
  const session = await getSession();
  if (!session) return { error: "You are signed out. Sign in again." };
  if (!input.items?.length) return { error: "The cart is empty." };
  if (!PAYMENT_METHODS.includes(input.paymentMethod)) return { error: "Invalid payment method." };

  const overrides: Override[] = [];

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
      const tendered = input.paymentMethod === "Cash" ? round2(Number(input.amountTendered) || 0) : total;
      if (tendered < total) throw new Error("Amount tendered is less than the total.");

      const day = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "");
      const prefix = `MOM-${day}-`;
      const [{ n }] = await tx<{ n: number }[]>`
        SELECT COUNT(*) AS n FROM sales WHERE receipt_no LIKE ${prefix + "%"}`;
      const receiptNo = `${prefix}${String(n + 1).padStart(4, "0")}`;

      const [{ id: saleId }] = await tx<{ id: number }[]>`
        INSERT INTO sales (receipt_no, subtotal, discount, total, payment_method, amount_tendered, cashier_name)
        VALUES (${receiptNo}, ${subtotal}, ${discount}, ${total}, ${input.paymentMethod}, ${tendered}, ${session.name})
        RETURNING id`;

      for (const l of lines) {
        await tx`
          INSERT INTO sale_items (sale_id, product_id, name, barcode, qty, srp, unit_price, unit_cost, line_total)
          VALUES (${saleId}, ${l.product.id}, ${l.product.name}, ${l.barcode}, ${l.qty}, ${l.product.srp},
                  ${l.unitPrice}, ${l.product.cost}, ${round2(l.unitPrice * l.qty)})`;
        await tx`UPDATE products SET stock_qty = stock_qty - ${l.qty},
                   updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ${l.product.id}`;
        await tx`INSERT INTO stock_movements (product_id, change_qty, reason, sale_id, actor_name)
                 VALUES (${l.product.id}, ${-l.qty}, 'sale', ${saleId}, ${session.name})`;
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
      return { saleId, receiptNo, total };
    });

    await logAudit({
      actorName: session.name,
      actorRole: session.role,
      action: "sale.create",
      summary: `Sale ${result.receiptNo} — ₱${result.total.toFixed(2)}`,
      details: { saleId: result.saleId },
    });
    for (const o of overrides) {
      const diff = round2(o.unitPrice - o.srp);
      await logAudit({
        actorName: session.name,
        actorRole: session.role,
        action: "price.override",
        summary: `${o.name} sold at ₱${o.unitPrice.toFixed(2)} vs SRP ₱${o.srp.toFixed(2)} (${diff > 0 ? "+" : ""}${diff.toFixed(2)}) on ${result.receiptNo}`,
        details: { receiptNo: result.receiptNo, saleId: result.saleId, ...o },
      });
    }

    revalidatePath("/", "layout");
    return { saleId: result.saleId, receiptNo: result.receiptNo };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Checkout failed." };
  }
}
