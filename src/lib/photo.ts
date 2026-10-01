// Product photos. The browser resizes the picture before upload (see
// resizeImage.ts) and sends it as a data URL in the product form's hidden
// "photo" field; this checks it on the server and builds the statements that
// store it, for including in the product save batch.
import { stmt, type Statement } from "./db";

const MAX_BYTES = 600 * 1024; // resized photos are ~30-50 KB; this is a safety cap
const ALLOWED = ["image/webp", "image/jpeg", "image/png"];

export type PhotoChange =
  | { kind: "keep" }
  | { kind: "remove" }
  | { kind: "set"; mime: string; data: string; version: string };

// The form sends "" (leave as is), "remove", or a data URL.
export function parsePhotoField(raw: FormDataEntryValue | null): PhotoChange | { error: string } {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (value === "") return { kind: "keep" };
  if (value === "remove") return { kind: "remove" };
  const match = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match || !ALLOWED.includes(match[1])) return { error: "The photo must be a JPG, PNG or WebP image." };
  if ((match[2].length * 3) / 4 > MAX_BYTES) return { error: "That photo is too large. Try a smaller picture." };
  return { kind: "set", mime: match[1], data: match[2], version: Date.now().toString(36) };
}

// Statements that store/remove the photo of an existing product (known id).
export function photoStatements(productId: number, change: PhotoChange): Statement[] {
  if (change.kind === "set") {
    return [
      stmt`INSERT INTO product_photos (product_id, mime, data) VALUES (${productId}, ${change.mime}, ${change.data})
           ON CONFLICT (product_id) DO UPDATE SET mime = excluded.mime, data = excluded.data,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      stmt`UPDATE products SET photo_version = ${change.version} WHERE id = ${productId}`,
    ];
  }
  if (change.kind === "remove") {
    return [
      stmt`DELETE FROM product_photos WHERE product_id = ${productId}`,
      stmt`UPDATE products SET photo_version = NULL WHERE id = ${productId}`,
    ];
  }
  return [];
}
