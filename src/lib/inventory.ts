// Stock adjustments (deliveries, spoilage, count corrections), kept free of
// Next.js request APIs like checkout.ts so the server action and the demo
// simulation share it.
import { GUARD_CHANGED, isGuardFailure, readBatch, runBatch, stmt } from "./db";
import { auditStmt } from "./audit";
import type { Actor } from "./checkout";

export const STOCK_REASONS = {
  restock: "Restock (delivery)",
  spoilage: "Spoilage / damage",
  correction: "Count correction",
} as const;

export type StockReason = keyof typeof STOCK_REASONS;

// Deliveries always add and spoilage always removes, whatever sign was
// typed; only a count correction uses the sign as entered.
export async function adjustStock(
  actor: Actor,
  productId: number,
  reason: StockReason,
  quantity: number,
  note?: string | null
): Promise<{ error?: string; ok?: string }> {
  if (!(reason in STOCK_REASONS)) return { error: "Pick a reason." };
  const change =
    reason === "restock" ? Math.abs(quantity) : reason === "spoilage" ? -Math.abs(quantity) : quantity;
  if (!Number.isFinite(change) || change === 0) return { error: "Enter a non-zero quantity." };
  note = note?.trim() || null;

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
           VALUES (${productId}, ${change}, ${reason}, ${note}, ${actor.name})`,
      auditStmt({
        actorName: actor.name,
        actorRole: actor.role,
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
  return { ok: "Stock updated." };
}
