// Product create/edit logic, kept free of Next.js request APIs like
// checkout.ts so it can be tested and reused. Takes the product form's
// FormData; src/app/products/actions.ts wraps these as server actions.
import { isUniqueFailure, readBatch, runBatch, stmt, type Statement } from "./db";
import { auditStmt } from "./audit";
import { round2 } from "./format";
import { normalizeBarcode } from "./barcode";
import { parsePhotoField, photoStatements } from "./photo";
import type { Actor } from "./checkout";
import type { Product } from "./types";

function text(fd: FormData, key: string): string | null {
  const v = String(fd.get(key) ?? "").trim();
  return v === "" ? null : v;
}

function money(fd: FormData, key: string): number | null {
  const n = Number(fd.get(key));
  return Number.isFinite(n) && n >= 0 ? round2(n) : null;
}

function readFields(fd: FormData) {
  const barcodeRaw = text(fd, "barcode");
  return {
    name: text(fd, "name"),
    sku: text(fd, "sku"),
    barcode: barcodeRaw ? normalizeBarcode(barcodeRaw) : null,
    categoryId: fd.get("category_id") ? Number(fd.get("category_id")) : null,
    srp: money(fd, "srp"),
    cost: money(fd, "cost") ?? 0,
    reorderLevel: Number(fd.get("reorder_level")) || 0,
  };
}

export async function createProduct(actor: Actor, fd: FormData): Promise<{ error: string } | { id: number }> {
  const f = readFields(fd);
  if (!f.name) return { error: "Name is required." };
  if (f.srp === null) return { error: "Enter a valid SRP." };
  const photo = parsePhotoField(fd.get("photo"));
  if ("error" in photo) return photo;

  // One batch: the price_history row, the SELECT and the photo find the new
  // product through last_insert_rowid() (the SELECT doesn't change it).
  const newProductId = "(SELECT product_id FROM price_history WHERE id = last_insert_rowid())";
  try {
    const results = await runBatch([
      stmt`INSERT INTO products (sku, barcode, name, category_id, srp, cost, stock_qty, reorder_level, photo_version)
           VALUES (${f.sku}, ${f.barcode}, ${f.name}, ${f.categoryId}, ${f.srp}, ${f.cost},
                   ${Number(fd.get("stock_qty")) || 0}, ${f.reorderLevel},
                   ${photo.kind === "set" ? photo.version : null})`,
      stmt`INSERT INTO price_history (product_id, old_srp, new_srp, actor_name)
           VALUES (last_insert_rowid(), ${null}, ${f.srp}, ${actor.name})`,
      stmt`SELECT product_id AS id FROM price_history WHERE id = last_insert_rowid()`,
      ...(photo.kind === "set"
        ? [{ sql: `INSERT INTO product_photos (product_id, mime, data) VALUES (${newProductId}, ?, ?)`, args: [photo.mime, photo.data] }]
        : []),
      auditStmt({
        actorName: actor.name,
        actorRole: actor.role,
        action: "product.create",
        summary: `Added product ${f.name} (SRP ₱${f.srp.toFixed(2)})${photo.kind === "set" ? " with photo" : ""}`,
        details: { sku: f.sku, barcode: f.barcode },
      }),
    ]);
    return { id: (results[2][0] as { id: number }).id };
  } catch (err) {
    return { error: isUniqueFailure(err) ? "That SKU or barcode is already used." : "Could not save product." };
  }
}

export async function updateProduct(actor: Actor, fd: FormData): Promise<{ error?: string; ok?: string }> {
  const id = Number(fd.get("id"));
  const f = readFields(fd);
  if (!f.name) return { error: "Name is required." };
  if (f.srp === null) return { error: "Enter a valid SRP." };
  const { name, srp, cost, barcode } = f;
  const photo = parsePhotoField(fd.get("photo"));
  if ("error" in photo) return photo;

  const [[before]] = await readBatch<[Product[]]>([stmt`SELECT * FROM products WHERE id = ${id}`]);
  if (!before) return { error: "Product not found." };

  // The update, the SRP history row, the photo and every audit entry go in
  // one batch.
  const who = { actorName: actor.name, actorRole: actor.role };
  const batch: Statement[] = [
    stmt`UPDATE products SET sku = ${f.sku}, barcode = ${barcode}, name = ${name},
           category_id = ${f.categoryId}, srp = ${srp}, cost = ${cost},
           reorder_level = ${f.reorderLevel},
           is_active = ${fd.get("is_active") ? 1 : 0},
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ${id}`,
  ];
  if (Math.abs(before.srp - srp) > 0.004) {
    batch.push(
      stmt`INSERT INTO price_history (product_id, old_srp, new_srp, actor_name)
           VALUES (${id}, ${before.srp}, ${srp}, ${actor.name})`,
      auditStmt({
        ...who,
        action: "price.srp_change",
        summary: `SRP of ${name} changed ₱${before.srp.toFixed(2)} → ₱${srp.toFixed(2)}`,
        details: { productId: id, name, oldSrp: before.srp, newSrp: srp },
      })
    );
  }
  if (Math.abs(before.cost - cost) > 0.004) {
    batch.push(
      auditStmt({
        ...who,
        action: "product.cost_change",
        summary: `Cost of ${name} changed ₱${before.cost.toFixed(2)} → ₱${cost.toFixed(2)}`,
        details: { productId: id, oldCost: before.cost, newCost: cost },
      })
    );
  }
  if (photo.kind !== "keep") {
    batch.push(
      ...photoStatements(id, photo),
      auditStmt({
        ...who,
        action: "product.update",
        summary: photo.kind === "set" ? `Updated the photo of ${name}` : `Removed the photo of ${name}`,
        details: { productId: id },
      })
    );
  }
  if (before.name !== name || before.barcode !== barcode) {
    batch.push(
      auditStmt({
        ...who,
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
  return { ok: "Saved." };
}
