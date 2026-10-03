"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/rbac";
import { addStaff, updateStaff } from "@/lib/staff";
import type { ActionState } from "@/lib/actionState";

// Owner only, even in demo mode: staff accounts decide who can sign in.
async function ownerOnly() {
  const session = await getSession();
  return session?.role === "owner" ? session : null;
}

export async function addStaffAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const session = await ownerOnly();
  if (!session) return { error: "Only the owner can manage staff." };
  if (String(fd.get("pin") ?? "") !== String(fd.get("pin_confirm") ?? "")) return { error: "The two PINs don't match." };
  const result = await addStaff(session, fd.get("name"), fd.get("pin"));
  if (result.ok) revalidatePath("/staff");
  return result;
}

export async function updateStaffAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const session = await ownerOnly();
  if (!session) return { error: "Only the owner can manage staff." };
  const id = Number(fd.get("id"));
  const op = String(fd.get("op") ?? "");
  let result;
  if (op === "rename") result = await updateStaff(session, id, { name: fd.get("name") });
  else if (op === "pin") {
    if (String(fd.get("pin") ?? "") !== String(fd.get("pin_confirm") ?? "")) return { error: "The two PINs don't match." };
    result = await updateStaff(session, id, { pin: fd.get("pin") });
  } else if (op === "deactivate") result = await updateStaff(session, id, { active: false });
  else if (op === "activate") result = await updateStaff(session, id, { active: true });
  else return { error: "Unknown change." };
  if (result.ok) revalidatePath("/staff");
  return result;
}
