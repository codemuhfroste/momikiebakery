"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  createSessionToken,
  isLoginRole,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  type Role,
} from "@/lib/auth";
import { isLoginLocked, recordLoginResult } from "@/lib/loginThrottle";
import { authenticate } from "@/lib/staff";
import { logAudit } from "@/lib/audit";

async function setSessionCookie(role: Role, name: string) {
  const token = await createSessionToken(role, name);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS / 1000,
    path: "/",
  });
}

export async function loginAction(formData: FormData) {
  const loginRole = formData.get("role");
  if (!isLoginRole(loginRole)) redirect("/login?error=1");
  // Errors go back to the page the form came from: /login for the cashier,
  // the unlisted /owner for the owner.
  const page = loginRole === "owner" ? "/owner" : "/login";
  if (await isLoginLocked()) redirect(`${page}?error=locked`);

  const result = await authenticate(String(formData.get("pin") ?? ""), loginRole);
  await recordLoginResult(result !== null);
  if (!result) redirect(`${page}?error=1`);

  await setSessionCookie(result.role, result.name);
  await logAudit({
    actorName: result.name,
    actorRole: result.role,
    action: "auth.login",
    summary: `${result.name} signed in`,
  });
  redirect(result.role === "owner" ? "/" : "/pos");
}

export async function logoutAction() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
