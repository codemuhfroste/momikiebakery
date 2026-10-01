"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/rbac";
import { processVoid } from "@/lib/checkout";
import type { ActionState } from "@/lib/actionState";

// Owner-only. Keeps the sale (marked voided), restores stock, and reverses
// any credit charge.
export async function voidSaleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const session = await getSession();
  if (session?.role !== "owner") return { error: "Only the owner can void sales." };
  const result = await processVoid(session, Number(fd.get("sale_id")), String(fd.get("reason") ?? ""));
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
