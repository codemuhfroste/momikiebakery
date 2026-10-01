"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManage, getSession } from "@/lib/rbac";
import { isUniqueFailure, readBatch, runBatch, stmt } from "@/lib/db";
import { auditStmt } from "@/lib/audit";
import { normalizeBarcode } from "@/lib/barcode";
import { createProduct, updateProduct } from "@/lib/products";
import type { ActionState } from "@/lib/actionState";
import type { Product } from "@/lib/types";

async function managerOnly() {
  const session = await getSession();
  return canManage(session) ? session : null;
}

export async function createProductAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const session = await managerOnly();
  if (!session) return { error: "Only the owner can add products." };
  const result = await createProduct(session, fd);
  if ("error" in result) return result;
  revalidatePath("/", "layout");
  redirect(`/products/${result.id}`);
}

export async function updateProductAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const session = await managerOnly();
  if (!session) return { error: "Only the owner can edit products." };
  const result = await updateProduct(session, fd);
  if (result.ok) revalidatePath("/", "layout");
  return result;
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
