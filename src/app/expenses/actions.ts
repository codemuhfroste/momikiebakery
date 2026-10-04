"use server";

import { revalidatePath } from "next/cache";
import { canManage, getSession } from "@/lib/rbac";
import { createExpense, deleteExpense, updateExpense } from "@/lib/expenses";
import type { ActionState } from "@/lib/actionState";

export async function createExpenseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!canManage(session)) return { error: "Please sign in again." };
  const result = await createExpense(session, fd);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function updateExpenseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!canManage(session)) return { error: "Please sign in again." };
  const result = await updateExpense(session, fd);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function deleteExpenseAction(id: number): Promise<ActionState> {
  const session = await getSession();
  if (!canManage(session)) return { error: "Please sign in again." };
  const result = await deleteExpense(session, id);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
