import { NextResponse } from "next/server";
import { canManage, getSession } from "@/lib/rbac";
import { listCategories, listProducts } from "@/lib/queries";
import { buildTemplate } from "@/lib/productImport";
import { manilaToday } from "@/lib/format";
import { workbookResponse } from "@/lib/excel";

// GET /api/products/template — the product list as an Excel sheet to edit
// and upload back on Products → Import from Excel.
export async function GET() {
  const session = await getSession();
  if (!canManage(session)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const [products, categories] = await Promise.all([listProducts(), listCategories()]);
  const wb = await buildTemplate(products, categories, session.name);
  return workbookResponse(wb, `momikie-products-${manilaToday()}.xlsx`);
}
