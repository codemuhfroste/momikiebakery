"use server";

import { revalidatePath } from "next/cache";
import { canManage, getSession } from "@/lib/rbac";
import { processVoid } from "@/lib/checkout";
import type { ActionState } from "@/lib/actionState";

// Owner and staff. Keeps the sale (marked voided, with who and why — also in
// the Audit Log), restores stock, and reverses any credit charge.
export async function voidSaleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!canManage(session)) return { error: "Please sign in again." };
  const result = await processVoid(session, Number(fd.get("sale_id")), String(fd.get("reason") ?? ""));
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
