"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/rbac";
import { getDb } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/actionState";

const STOCK_REASONS = {
  restock: "Restock (delivery)",
  spoilage: "Spoilage / damage",
  correction: "Count correction",
} as const;

// Owner-only. `change` is signed: positive adds stock, negative removes.
export async function adjustStockAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const session = await getSession();
  if (session?.role !== "owner") return { error: "Only the owner can adjust stock." };

  const productId = Number(fd.get("product_id"));
  const change = Number(fd.get("change"));
  const reason = String(fd.get("reason") ?? "") as keyof typeof STOCK_REASONS;
  const note = String(fd.get("note") ?? "").trim() || null;
  if (!Number.isFinite(change) || change === 0) return { error: "Enter a non-zero quantity." };
  if (!(reason in STOCK_REASONS)) return { error: "Pick a reason." };

  const sql = getDb();
  const rows = await sql<{ name: string; stock_qty: number }[]>`SELECT name, stock_qty FROM products WHERE id = ${productId}`;
  if (!rows[0]) return { error: "Product not found." };
  if (rows[0].stock_qty + change < 0) return { error: "That would take stock below zero." };

  await sql.begin(async (tx) => {
    await tx`UPDATE products SET stock_qty = stock_qty + ${change},
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ${productId}`;
    await tx`INSERT INTO stock_movements (product_id, change_qty, reason, note, actor_name)
             VALUES (${productId}, ${change}, ${reason}, ${note}, ${session.name})`;
  });
  await logAudit({
    actorName: session.name,
    actorRole: session.role,
    action: "stock.adjust",
    summary: `${rows[0].name}: ${change > 0 ? "+" : ""}${change} (${STOCK_REASONS[reason]})`,
    details: { productId, change, reason, note },
  });

  revalidatePath("/", "layout");
  return { ok: "Stock updated." };
}
