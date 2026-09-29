"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/rbac";
import { getDb } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { round2 } from "@/lib/format";
import { normalizeBarcode } from "@/lib/barcode";
import type { ActionState } from "@/lib/actionState";
import type { Product } from "@/lib/types";

async function ownerOnly() {
  const session = await getSession();
  return session?.role === "owner" ? session : null;
}

function text(fd: FormData, key: string): string | null {
  const v = String(fd.get(key) ?? "").trim();
  return v === "" ? null : v;
}

function money(fd: FormData, key: string): number | null {
  const n = Number(fd.get(key));
  return Number.isFinite(n) && n >= 0 ? round2(n) : null;
}

function isUniqueError(err: unknown) {
  return err instanceof Error && /UNIQUE/i.test(err.message);
}

export async function createProductAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const session = await ownerOnly();
  if (!session) return { error: "Only the owner can add products." };

  const name = text(fd, "name");
  const srp = money(fd, "srp");
  const cost = money(fd, "cost") ?? 0;
  if (!name) return { error: "Name is required." };
  if (srp === null) return { error: "Enter a valid SRP." };
  const barcodeRaw = text(fd, "barcode");
  const barcode = barcodeRaw ? normalizeBarcode(barcodeRaw) : null;
  const categoryId = fd.get("category_id") ? Number(fd.get("category_id")) : null;

  let id: number;
  try {
    const sql = getDb();
    [{ id }] = await sql<{ id: number }[]>`
      INSERT INTO products (sku, barcode, name, category_id, srp, cost, stock_qty, reorder_level)
      VALUES (${text(fd, "sku")}, ${barcode}, ${name}, ${categoryId}, ${srp}, ${cost},
              ${Number(fd.get("stock_qty")) || 0}, ${Number(fd.get("reorder_level")) || 0})
      RETURNING id`;
    await sql`INSERT INTO price_history (product_id, old_srp, new_srp, actor_name)
              VALUES (${id}, ${null}, ${srp}, ${session.name})`;
  } catch (err) {
    return { error: isUniqueError(err) ? "That SKU or barcode is already used." : "Could not save product." };
  }

  await logAudit({
    actorName: session.name,
    actorRole: session.role,
    action: "product.create",
    summary: `Added product ${name} (SRP ₱${srp.toFixed(2)})`,
    details: { productId: id },
  });
  revalidatePath("/", "layout");
  redirect(`/products/${id}`);
}

export async function updateProductAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const session = await ownerOnly();
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

  const sql = getDb();
  const [before] = await sql<Product[]>`SELECT * FROM products WHERE id = ${id}`;
  if (!before) return { error: "Product not found." };

  try {
    await sql`UPDATE products SET sku = ${text(fd, "sku")}, barcode = ${barcode}, name = ${name},
        category_id = ${categoryId}, srp = ${srp}, cost = ${cost},
        reorder_level = ${Number(fd.get("reorder_level")) || 0},
        is_active = ${fd.get("is_active") ? 1 : 0},
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ${id}`;
  } catch (err) {
    return { error: isUniqueError(err) ? "That SKU or barcode is already used." : "Could not save product." };
  }

  if (Math.abs(before.srp - srp) > 0.004) {
    await sql`INSERT INTO price_history (product_id, old_srp, new_srp, actor_name)
              VALUES (${id}, ${before.srp}, ${srp}, ${session.name})`;
    await logAudit({
      actorName: session.name,
      actorRole: session.role,
      action: "price.srp_change",
      summary: `SRP of ${name} changed ₱${before.srp.toFixed(2)} → ₱${srp.toFixed(2)}`,
      details: { productId: id, name, oldSrp: before.srp, newSrp: srp },
    });
  }
  if (Math.abs(before.cost - cost) > 0.004) {
    await logAudit({
      actorName: session.name,
      actorRole: session.role,
      action: "product.cost_change",
      summary: `Cost of ${name} changed ₱${before.cost.toFixed(2)} → ₱${cost.toFixed(2)}`,
      details: { productId: id, oldCost: before.cost, newCost: cost },
    });
  }
  if (before.name !== name || before.barcode !== barcode) {
    await logAudit({
      actorName: session.name,
      actorRole: session.role,
      action: "product.update",
      summary: `Updated product ${name}`,
      details: { productId: id, before: { name: before.name, barcode: before.barcode }, after: { name, barcode } },
    });
  }

  revalidatePath("/", "layout");
  return { ok: "Saved." };
}

// Links a scanned barcode to an existing product (used by the register when a
// scan doesn't match anything).
export async function attachBarcodeAction(
  productId: number,
  rawCode: string
): Promise<ActionState> {
  const session = await ownerOnly();
  if (!session) return { error: "Only the owner can register barcodes." };
  const code = normalizeBarcode(rawCode);
  if (!code) return { error: "No barcode to attach." };

  const sql = getDb();
  const [product] = await sql<Product[]>`SELECT * FROM products WHERE id = ${productId}`;
  if (!product) return { error: "Product not found." };
  const [taken] = await sql<{ name: string }[]>`SELECT name FROM products WHERE barcode = ${code} AND id != ${productId}`;
  if (taken) return { error: `That barcode already belongs to ${taken.name}.` };

  await sql`UPDATE products SET barcode = ${code},
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ${productId}`;
  await logAudit({
    actorName: session.name,
    actorRole: session.role,
    action: "product.update",
    summary: `Registered barcode ${code} to ${product.name}`,
    details: { productId, before: { barcode: product.barcode }, after: { barcode: code } },
  });
  revalidatePath("/", "layout");
  return { ok: "Barcode registered." };
}
