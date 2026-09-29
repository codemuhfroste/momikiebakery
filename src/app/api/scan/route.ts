import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/rbac";
import { getProductByBarcode } from "@/lib/queries";
import { normalizeBarcode } from "@/lib/barcode";

// Barcode lookup, for any scanner integration that isn't a keyboard-wedge
// device (a vendor SDK, a camera scanner, a companion phone app):
//   GET  /api/scan?code=4800000000001
//   POST /api/scan   {"code": "4800000000001"}
// 200 {product} when the code is registered, 404 when it isn't.
async function lookup(rawCode: string | null | undefined) {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const code = normalizeBarcode(rawCode ?? "");
  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });

  const product = await getProductByBarcode(code);
  if (!product) return NextResponse.json({ error: "Not found", code }, { status: 404 });
  return NextResponse.json({ product });
}

export async function GET(request: NextRequest) {
  return lookup(request.nextUrl.searchParams.get("code"));
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
  return lookup(typeof body?.code === "string" ? body.code : null);
}
