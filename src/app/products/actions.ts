"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManage, getSession } from "@/lib/rbac";
import { isUniqueFailure, readBatch, runBatch, stmt, type Statement } from "@/lib/db";
import { auditStmt } from "@/lib/audit";
import { round2 } from "@/lib/format";
import { normalizeBarcode } from "@/lib/barcode";
import type { ActionState } from "@/lib/actionState";
import type { Product } from "@/lib/types";

async function managerOnly() {
  const session = await getSession();
  return canManage(session) ? session : null;
}

function text(fd: FormData, key: string): string | null {
  const v = String(fd.get(key) ?? "").trim();
  return v === "" ? null : v;
}

function money(fd: FormData, key: string): number | null {
  const n = Number(fd.get(key));
  return Number.isFinite(n) && n >= 0 ? round2(n) : null;
}

export async function createProductAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const session = await managerOnly();
  if (!session) return { error: "Only the owner can add products." };

  const name = text(fd, "name");
  const srp = money(fd, "srp");
  const cost = money(fd, "cost") ?? 0;
  if (!name) return { error: "Name is required." };
  if (srp === null) return { error: "Enter a valid SRP." };
  const barcodeRaw = text(fd, "barcode");
  const barcode = barcodeRaw ? normalizeBarcode(barcodeRaw) : null;
  const categoryId = fd.get("category_id") ? Number(fd.get("category_id")) : null;

  // One batch: the price_history row and the SELECT find the new product
  // through last_insert_rowid().
  let id: number;
  try {
    const results = await runBatch([
      stmt`INSERT INTO products (sku, barcode, name, category_id, srp, cost, stock_qty, reorder_level)
           VALUES (${text(fd, "sku")}, ${barcode}, ${name}, ${categoryId}, ${srp}, ${cost},
                   ${Number(fd.get("stock_qty")) || 0}, ${Number(fd.get("reorder_level")) || 0})`,
      stmt`INSERT INTO price_history (product_id, old_srp, new_srp, actor_name)
           VALUES (last_insert_rowid(), ${null}, ${srp}, ${session.name})`,
      stmt`SELECT product_id AS id FROM price_history WHERE id = last_insert_rowid()`,
      auditStmt({
        actorName: session.name,
        actorRole: session.role,
        action: "product.create",
        summary: `Added product ${name} (SRP ₱${srp.toFixed(2)})`,
        details: { sku: text(fd, "sku"), barcode },
      }),
    ]);
    id = (results[2][0] as { id: number }).id;
  } catch (err) {
    return { error: isUniqueFailure(err) ? "That SKU or barcode is already used." : "Could not save product." };
  }

  revalidatePath("/", "layout");
  redirect(`/products/${id}`);
}

export async function updateProductAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const session = await managerOnly();
  if (!session) return { error: "Only the owner can edit products." };

  const id = Number(fd.get("id"));
  const name = text(fd, "name");
  const srp = money(fd, "srp");
  const cost = money(fd, "cost") ?? 0;
  if (!name) return { error: "Name is required." };
  if (srp === null) return { error: "Enter a valid SRP." };
  const barcodeRaw = text(fd, "barcode");
  const barcode = barcodeRaw ? normalizeBarcode(barcodeRaw) : null;
  const categoryId = fd.get("category_id") ? Number(fd.get("category_id")) : null;

  const [[before]] = await readBatch<[Product[]]>([stmt`SELECT * FROM products WHERE id = ${id}`]);
  if (!before) return { error: "Product not found." };

  // The update, the SRP history row and every audit entry go in one batch.
  const actor = { actorName: session.name, actorRole: session.role };
  const batch: Statement[] = [
    stmt`UPDATE products SET sku = ${text(fd, "sku")}, barcode = ${barcode}, name = ${name},
           category_id = ${categoryId}, srp = ${srp}, cost = ${cost},
           reorder_level = ${Number(fd.get("reorder_level")) || 0},
           is_active = ${fd.get("is_active") ? 1 : 0},
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ${id}`,
  ];
  if (Math.abs(before.srp - srp) > 0.004) {
    batch.push(
      stmt`INSERT INTO price_history (product_id, old_srp, new_srp, actor_name)
           VALUES (${id}, ${before.srp}, ${srp}, ${session.name})`,
      auditStmt({
        ...actor,
        action: "price.srp_change",
        summary: `SRP of ${name} changed ₱${before.srp.toFixed(2)} → ₱${srp.toFixed(2)}`,
        details: { productId: id, name, oldSrp: before.srp, newSrp: srp },
      })
    );
  }
  if (Math.abs(before.cost - cost) > 0.004) {
    batch.push(
      auditStmt({
        ...actor,
        action: "product.cost_change",
        summary: `Cost of ${name} changed ₱${before.cost.toFixed(2)} → ₱${cost.toFixed(2)}`,
        details: { productId: id, oldCost: before.cost, newCost: cost },
      })
    );
  }
  if (before.name !== name || before.barcode !== barcode) {
    batch.push(
      auditStmt({
        ...actor,
        action: "product.update",
        summary: `Updated product ${name}`,
        details: { productId: id, before: { name: before.name, barcode: before.barcode }, after: { name, barcode } },
      })
    );
  }

  try {
    await runBatch(batch);
  } catch (err) {
    return { error: isUniqueFailure(err) ? "That SKU or barcode is already used." : "Could not save product." };
  }

  revalidatePath("/", "layout");
  return { ok: "Saved." };
}

// Links a scanned barcode to an existing product (used by the register when a
// scan doesn't match anything).
export async function attachBarcodeAction(productId: number, rawCode: string): Promise<ActionState> {
  const session = await managerOnly();
  if (!session) return { error: "Only the owner can register barcodes." };
  const code = normalizeBarcode(rawCode);
  if (!code) return { error: "No barcode to attach." };

  const [[product], [taken]] = await readBatch<[Product[], { name: string }[]]>([
    stmt`SELECT * FROM products WHERE id = ${productId}`,
    stmt`SELECT name FROM products WHERE barcode = ${code} AND id != ${productId}`,
  ]);
  if (!product) return { error: "Product not found." };
  if (taken) return { error: `That barcode already belongs to ${taken.name}.` };

  try {
    await runBatch([
      stmt`UPDATE products SET barcode = ${code},
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ${productId}`,
      auditStmt({
        actorName: session.name,
        actorRole: session.role,
        action: "product.update",
        summary: `Registered barcode ${code} to ${product.name}`,
        details: { productId, before: { barcode: product.barcode }, after: { barcode: code } },
      }),
    ]);
  } catch (err) {
    if (isUniqueFailure(err)) return { error: "That barcode was just linked to another product." };
    throw err;
  }

  revalidatePath("/", "layout");
  return { ok: "Barcode registered." };
}
