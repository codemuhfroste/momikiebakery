import { redirect } from "next/navigation";
import type { SessionPayload } from "@/lib/auth";

// AUTH IS OFF for now: everyone using the app is the owner. To turn login
// back on, restore the cookie lookup here (see verifySessionToken and
// checkRolePin in auth.ts, loginThrottle.ts for lockout), then re-add the
// /login and /owner pages, login/logout actions, and a src/proxy.ts guard.
const OWNER_SESSION: SessionPayload = { role: "owner", name: "Owner", exp: Infinity };

export async function getSession(): Promise<SessionPayload | null> {
  return OWNER_SESSION;
}

// For pages and redirecting Server Actions: any signed-in user.
export async function requireSessionOrRedirect(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/");
  return session;
}

// For owner-only surfaces (products, inventory, voids, audit log).
export async function requireOwnerOrRedirect(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role !== "owner") redirect("/pos");
  return session;
}
