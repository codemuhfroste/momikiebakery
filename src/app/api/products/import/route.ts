import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { canManage, getSession } from "@/lib/rbac";
import { applyImport, planImport, readImportFile } from "@/lib/productImport";

const MAX_BYTES = 4 * 1024 * 1024;

// POST /api/products/import (multipart: file, mode=preview|apply)
// Preview returns what would change; apply re-reads the same file and saves.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!canManage(session)) return NextResponse.json({ error: "Only the owner can import products." }, { status: 403 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Choose an Excel file first." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That file is too big (over 4 MB)." }, { status: 400 });

  const { rows, errors } = await readImportFile(await file.arrayBuffer());
  const plan = await planImport(rows, errors);
  if (form!.get("mode") !== "apply") return NextResponse.json({ plan });

  const result = await applyImport(session, rows, plan);
  revalidatePath("/", "layout");
  return NextResponse.json({ plan, result });
}
