"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/rbac";
import { getDb } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/actionState";
import type { Sale, SaleItem } from "@/lib/types";

// Owner-only. Keeps the sale (marked voided) and puts its stock back.
export async function voidSaleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const session = await getSession();
  if (session?.role !== "owner") return { error: "Only the owner can void sales." };

  const saleId = Number(fd.get("sale_id"));
  const reason = String(fd.get("reason") ?? "").trim();
  if (!reason) return { error: "Give a reason for the void." };

  const sql = getDb();
  const [sale] = await sql<Sale[]>`SELECT * FROM sales WHERE id = ${saleId}`;
  if (!sale) return { error: "Sale not found." };
  if (sale.voided_at) return { error: "Already voided." };
  const items = await sql<SaleItem[]>`SELECT * FROM sale_items WHERE sale_id = ${saleId}`;

  await sql.begin(async (tx) => {
    await tx`UPDATE sales SET voided_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
               voided_by = ${session.name}, void_reason = ${reason} WHERE id = ${saleId}`;
    for (const i of items) {
      if (i.product_id == null) continue;
      await tx`UPDATE products SET stock_qty = stock_qty + ${i.qty} WHERE id = ${i.product_id}`;
      await tx`INSERT INTO stock_movements (product_id, change_qty, reason, sale_id, note, actor_name)
               VALUES (${i.product_id}, ${i.qty}, 'void', ${saleId}, ${reason}, ${session.name})`;
    }
  });
  await logAudit({
    actorName: session.name,
    actorRole: session.role,
    action: "sale.void",
    summary: `Voided ${sale.receipt_no} (₱${sale.total.toFixed(2)}): ${reason}`,
    details: { saleId, receiptNo: sale.receipt_no, reason },
  });

  revalidatePath("/", "layout");
  return { ok: "Sale voided." };
}
