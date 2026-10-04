// Product create/edit logic, kept free of Next.js request APIs like
// checkout.ts so it can be tested and reused. Takes the product form's
// FormData; src/app/products/actions.ts wraps these as server actions.
import { isUniqueFailure, readBatch, runBatch, stmt, type Statement } from "./db";
import { auditStmt } from "./audit";
import { round2 } from "./format";
import { normalizeBarcode } from "./barcode";
import { parsePhotoField, photoStatements } from "./photo";
import { ensureCategory } from "./categories";
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

// The category picker sends an id, "" (Uncategorized), or "__new" with the
// typed name in new_category. Returns the statements to run first (creating
// the category if needed) and the SQL for the category id.
const NEW_CATEGORY = "__new";
function categoryFor(fd: FormData): { error: string } | { pre: Statement[]; id: Statement } {
  const raw = String(fd.get("category_id") ?? "");
  if (raw === NEW_CATEGORY) {
    const made = ensureCategory(fd.get("new_category"));
    if ("error" in made) return made;
    return { pre: made.statements, id: made.idSql };
  }
  const id = raw ? Number(raw) : null;
  return { pre: [], id: { sql: "?", args: [Number.isFinite(id) ? id : null] } };
}

// The optional wholesale pack: all three fields, or none (retail only).
export function readWholesale(
  name: unknown,
  size: unknown,
  price: unknown
): { error: string } | { packName: string | null; packSize: number | null; wholesalePrice: number | null } {
  const packName = String(name ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  const sizeText = String(size ?? "").trim();
  const priceText = String(price ?? "").trim();
  if (!packName && !sizeText && !priceText) return { packName: null, packSize: null, wholesalePrice: null };
  const packSize = Number(sizeText);
  const wholesalePrice = Number(priceText);
  if (!packName) return { error: "Name the wholesale unit (e.g. box, case, dozen, tray), or clear the wholesale fields." };
  if (packName.length > 20) return { error: "Keep the wholesale unit name short (e.g. box, tray)." };
  if (!sizeText || !(packSize > 1) || !Number.isFinite(packSize)) return { error: "Enter how many pieces are in one wholesale unit (2 or more)." };
  if (!priceText || !(wholesalePrice >= 0) || !Number.isFinite(wholesalePrice)) return { error: "Enter the wholesale price for one unit." };
  return { packName, packSize, wholesalePrice: round2(wholesalePrice) };
}

function readFields(fd: FormData) {
  const barcodeRaw = text(fd, "barcode");
  return {
    name: text(fd, "name"),
    sku: text(fd, "sku"),
    barcode: barcodeRaw ? normalizeBarcode(barcodeRaw) : null,
    srp: money(fd, "srp"),
    cost: money(fd, "cost") ?? 0,
    unit: fd.get("unit") === "kg" ? "kg" : "piece",
    reorderLevel: Number(fd.get("reorder_level")) || 0,
  };
}

export async function createProduct(actor: Actor, fd: FormData): Promise<{ error: string } | { id: number }> {
  const f = readFields(fd);
  if (!f.name) return { error: "Name is required." };
  if (f.srp === null) return { error: "Enter a valid SRP." };
  const photo = parsePhotoField(fd.get("photo"));
  if ("error" in photo) return photo;
  const category = categoryFor(fd);
  if ("error" in category) return category;
  const ws = readWholesale(fd.get("pack_name"), fd.get("pack_size"), fd.get("wholesale_price"));
  if ("error" in ws) return ws;

  // One batch: the price_history row, the SELECT and the photo find the new
  // product through last_insert_rowid() (the SELECT doesn't change it).
  const newProductId = "(SELECT product_id FROM price_history WHERE id = last_insert_rowid())";
  try {
    const results = await runBatch([
      ...category.pre,
      {
        sql: `INSERT INTO products (sku, barcode, name, category_id, srp, cost, stock_qty, reorder_level, photo_version,
                                    pack_name, pack_size, wholesale_price, unit)
              VALUES (?, ?, ?, ${category.id.sql}, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [f.sku, f.barcode, f.name, ...category.id.args, f.srp, f.cost,
               Number(fd.get("stock_qty")) || 0, f.reorderLevel, photo.kind === "set" ? photo.version : null,
               ws.packName, ws.packSize, ws.wholesalePrice, f.unit],
      },
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
        summary: `Added product ${f.name} (SRP ₱${f.srp.toFixed(2)}${f.unit === "kg" ? " per kg" : ""}${
          ws.packName ? `; wholesale ₱${ws.wholesalePrice!.toFixed(2)} per ${ws.packName} of ${ws.packSize}` : ""
        })${photo.kind === "set" ? " with photo" : ""}`,
        details: { sku: f.sku, barcode: f.barcode },
      }),
    ]);
    return { id: (results[category.pre.length + 2][0] as { id: number }).id };
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
  const category = categoryFor(fd);
  if ("error" in category) return category;
  const ws = readWholesale(fd.get("pack_name"), fd.get("pack_size"), fd.get("wholesale_price"));
  if ("error" in ws) return ws;

  const [[before]] = await readBatch<[Product[]]>([stmt`SELECT * FROM products WHERE id = ${id}`]);
  if (!before) return { error: "Product not found." };

  // The update, the SRP history row, the photo and every audit entry go in
  // one batch.
  const who = { actorName: actor.name, actorRole: actor.role };
  const batch: Statement[] = [
    ...category.pre,
    {
      sql: `UPDATE products SET sku = ?, barcode = ?, name = ?, category_id = ${category.id.sql},
              srp = ?, cost = ?, reorder_level = ?, is_active = ?,
              pack_name = ?, pack_size = ?, wholesale_price = ?, unit = ?,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = ?`,
      args: [f.sku, barcode, name, ...category.id.args, srp, cost, f.reorderLevel, fd.get("is_active") ? 1 : 0,
             ws.packName, ws.packSize, ws.wholesalePrice, f.unit, id],
    },
  ];
  const wsText = (p: { pack_name: string | null; pack_size: number | null; wholesale_price: number | null }) =>
    p.pack_name ? `₱${(p.wholesale_price ?? 0).toFixed(2)} per ${p.pack_name} of ${p.pack_size}` : "none";
  const wsBefore = wsText(before);
  const wsAfter = wsText({ pack_name: ws.packName, pack_size: ws.packSize, wholesale_price: ws.wholesalePrice });
  if (wsBefore !== wsAfter) {
    batch.push(
      auditStmt({
        ...who,
        action: "price.wholesale_change",
        summary: `Wholesale price of ${name} changed: ${wsBefore} → ${wsAfter}`,
        details: { productId: id, before: wsBefore, after: wsAfter },
      })
    );
  }
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
  if ((before.unit ?? "piece") !== f.unit) {
    batch.push(
      auditStmt({
        ...who,
        action: "product.update",
        summary: `${name} is now sold ${f.unit === "kg" ? "by weight (per kg)" : "by the piece"}`,
        details: { productId: id, unit: f.unit },
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

// Sets just the photo of a product (the "Find missing photos" page). `source`
// says where it came from, for the Audit Log.
export async function setProductPhoto(
  actor: Actor,
  productId: number,
  dataUrl: string,
  source?: string
): Promise<{ error?: string; ok?: string }> {
  const photo = parsePhotoField(dataUrl);
  if ("error" in photo) return photo;
  if (photo.kind !== "set") return { error: "No photo to save." };
  const [[product]] = await readBatch<[{ name: string }[]]>([stmt`SELECT name FROM products WHERE id = ${productId}`]);
  if (!product) return { error: "That product no longer exists." };
  await runBatch([
    ...photoStatements(productId, photo),
    auditStmt({
      actorName: actor.name,
      actorRole: actor.role,
      action: "product.update",
      summary: `Added a photo to ${product.name}${source ? ` (${source})` : ""}`,
      details: { productId, source },
    }),
  ]);
  return { ok: "Saved." };
}
