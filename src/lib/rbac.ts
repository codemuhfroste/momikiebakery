import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken, type SessionPayload } from "@/lib/auth";

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

// Who may manage the store — products, inventory, dashboard, reports, credit
// customers: the owner and staff alike. The Audit Log, staff accounts,
// voiding sales and the full backup stay owner-only (requireOwnerOrRedirect
// and the role checks in those actions).
export function canManage(session: SessionPayload | null): session is SessionPayload {
  return session?.role === "owner" || session?.role === "cashier";
}

export async function requireManagerOrRedirect(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManage(session)) redirect("/pos");
  return session;
}

// Strictly owner-only: the audit log and staff accounts.
export async function requireOwnerOrRedirect(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "owner") redirect("/pos");
  return session;
}
