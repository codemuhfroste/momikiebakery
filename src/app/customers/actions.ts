"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManage, getSession } from "@/lib/rbac";
import { createCustomer, recordCreditPayment, updateCustomer, type CustomerInput } from "@/lib/credit";
import type { ActionState } from "@/lib/actionState";
import type { CreditPaymentMethod } from "@/lib/types";

function readCustomer(fd: FormData): CustomerInput {
  const limitRaw = String(fd.get("credit_limit") ?? "").trim();
  return {
    name: String(fd.get("name") ?? ""),
    phone: String(fd.get("phone") ?? ""),
    address: String(fd.get("address") ?? ""),
    notes: String(fd.get("notes") ?? ""),
    creditLimit: limitRaw === "" ? null : Number(limitRaw),
    isActive: fd.get("is_active") != null,
  };
}

export async function createCustomerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!canManage(session)) return { error: "Only the owner can add credit customers." };
  const result = await createCustomer(session, readCustomer(fd));
  if ("error" in result) return result;
  revalidatePath("/", "layout");
  redirect(`/customers/${result.id}`);
}

export async function updateCustomerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!canManage(session)) return { error: "Only the owner can edit customers." };
  const result = await updateCustomer(session, Number(fd.get("id")), readCustomer(fd));
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function recordPaymentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: "You are signed out." };
  const result = await recordCreditPayment(
    session,
    Number(fd.get("customer_id")),
    Number(fd.get("amount")),
    String(fd.get("method") ?? "") as CreditPaymentMethod,
    fd.getAll("sale_id").map(Number),
    String(fd.get("note") ?? "")
  );
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
