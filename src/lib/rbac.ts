import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken, type SessionPayload } from "@/lib/auth";
import { STAFF_SEES_OWNER_TABS } from "@/lib/demo";

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

// For pages and redirecting Server Actions: any signed-in user.
export async function requireSessionOrRedirect(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

// Who may manage the store: products, inventory, dashboard, credit
// customers. Normally the owner only; while STAFF_SEES_OWNER_TABS is on
// (demo), staff too.
export function canManage(session: SessionPayload | null): session is SessionPayload {
  return session?.role === "owner" || (STAFF_SEES_OWNER_TABS && session?.role === "cashier");
}

export async function requireManagerOrRedirect(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManage(session)) redirect("/pos");
  return session;
}

// Strictly owner-only, even in the demo: the audit log and voiding sales.
export async function requireOwnerOrRedirect(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "owner") redirect("/pos");
  return session;
}
