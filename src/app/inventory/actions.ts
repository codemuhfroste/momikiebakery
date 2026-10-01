"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/rbac";
import { GUARD_CHANGED, isGuardFailure, readBatch, runBatch, stmt } from "@/lib/db";
import { auditStmt } from "@/lib/audit";
import type { ActionState } from "@/lib/actionState";

const STOCK_REASONS = {
  restock: "Restock (delivery)",
  spoilage: "Spoilage / damage",
  correction: "Count correction",
} as const;

// Owner-only. Records a delivery, spoilage, or count correction.
export async function adjustStockAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const session = await getSession();
  if (session?.role !== "owner") return { error: "Only the owner can adjust stock." };

  const productId = Number(fd.get("product_id"));
  const reason = String(fd.get("reason") ?? "") as keyof typeof STOCK_REASONS;
  // Deliveries always add and spoilage always removes, whatever sign was
  // typed; only a count correction uses the sign as entered.
  const typed = Number(fd.get("change"));
  const change = reason === "restock" ? Math.abs(typed) : reason === "spoilage" ? -Math.abs(typed) : typed;
  const note = String(fd.get("note") ?? "").trim() || null;
  if (!Number.isFinite(change) || change === 0) return { error: "Enter a non-zero quantity." };
  if (!(reason in STOCK_REASONS)) return { error: "Pick a reason." };

  const [[product]] = await readBatch<[{ name: string; stock_qty: number }[]]>([
    stmt`SELECT name, stock_qty FROM products WHERE id = ${productId}`,
  ]);
  if (!product) return { error: "Product not found." };
  if (product.stock_qty + change < 0) return { error: "That would take stock below zero." };

  // One batch; the UPDATE re-checks "not below zero" at commit time in case a
  // sale happened in between.
  try {
    await runBatch([
      stmt`UPDATE products SET stock_qty = stock_qty + ${change},
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ${productId} AND stock_qty + ${change} >= 0`,
      GUARD_CHANGED,
      stmt`INSERT INTO stock_movements (product_id, change_qty, reason, note, actor_name)
           VALUES (${productId}, ${change}, ${reason}, ${note}, ${session.name})`,
      auditStmt({
        actorName: session.name,
        actorRole: session.role,
        action: "stock.adjust",
        summary: `${product.name}: ${change > 0 ? "+" : ""}${change} (${STOCK_REASONS[reason]})`,
        details: { productId, change, reason, note },
      }),
    ]);
  } catch (err) {
    if (isGuardFailure(err)) {
      return { error: "Stock changed just now and this would take it below zero. Refresh and try again." };
    }
    throw err;
  }

  revalidatePath("/", "layout");
  return { ok: "Stock updated." };
}
