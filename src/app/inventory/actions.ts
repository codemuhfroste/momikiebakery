"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/rbac";
import { adjustStock, type StockReason } from "@/lib/inventory";
import type { ActionState } from "@/lib/actionState";

// Owner-only. Records a delivery, spoilage, or count correction.
export async function adjustStockAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const session = await getSession();
  if (session?.role !== "owner") return { error: "Only the owner can adjust stock." };
  const result = await adjustStock(
    session,
    Number(fd.get("product_id")),
    String(fd.get("reason") ?? "") as StockReason,
    Number(fd.get("change")),
    String(fd.get("note") ?? "")
  );
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
