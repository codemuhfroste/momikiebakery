import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/rbac";
import { CORS_HEADERS, getBearerSession, preflight } from "@/lib/mobileAuth";
import { readBatch, stmt } from "@/lib/db";

// GET /api/products/12/photo?v=<photo_version> — the product's photo.
// The ?v= part changes whenever the photo is replaced, so each URL's image
// never changes and the browser may keep it for a year.
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/products/[id]/photo">) {
  // Website (cookie) or mobile app (Bearer token).
  if (!(await getSession()) && !(await getBearerSession(_request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: CORS_HEADERS });
  }

  const { id } = await ctx.params;
  const [[photo]] = await readBatch<[{ mime: string; data: string }[]]>([
    stmt`SELECT mime, data FROM product_photos WHERE product_id = ${Number(id)}`,
  ]);
  if (!photo) return NextResponse.json({ error: "No photo" }, { status: 404 });

  return new NextResponse(Buffer.from(photo.data, "base64"), {
    headers: {
      "Content-Type": photo.mime,
      "Cache-Control": "private, max-age=31536000, immutable",
      ...CORS_HEADERS,
    },
  });
}

export const OPTIONS = preflight;
