"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/rbac";
import { processCheckout, type CheckoutInput, type CheckoutResult } from "@/lib/checkout";

export async function checkoutAction(input: CheckoutInput): Promise<CheckoutResult> {
  const session = await getSession();
  if (!session) return { error: "You are signed out. Sign in again." };
  const result = await processCheckout(session, input);
  if (!("error" in result)) revalidatePath("/", "layout");
  return result;
}
