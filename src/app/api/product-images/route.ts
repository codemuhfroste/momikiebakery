import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/rbac";
import { searchProductImages, type ProductImageHit } from "@/lib/productImages";

export type { ProductImageHit };

// GET /api/product-images?q=c2+small — photo suggestions for the product
// form (see lib/productImages.ts). Runs on the server because Open Food Facts
// asks callers to identify themselves with a User-Agent, which a browser
// won't let us set.
export async function GET(request: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const results = await searchProductImages(request.nextUrl.searchParams.get("q") ?? "");
  return NextResponse.json({ results });
}
