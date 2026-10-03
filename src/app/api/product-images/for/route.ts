import { NextRequest, NextResponse } from "next/server";
import { canManage, getSession } from "@/lib/rbac";
import { suggestPhotosFor } from "@/lib/productImages";

// GET /api/product-images/for?name=Milo%2022g%20Sachet — suggestions for one
// catalogue product, best match first, each with a 0..1 match score (see
// suggestPhotosFor). Used by the "Find missing photos" page.
export async function GET(request: NextRequest) {
  if (!canManage(await getSession())) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const name = (request.nextUrl.searchParams.get("name") ?? "").trim();
  if (!name) return NextResponse.json({ results: [] });
  return NextResponse.json({ results: (await suggestPhotosFor(name)).slice(0, 6) });
}
