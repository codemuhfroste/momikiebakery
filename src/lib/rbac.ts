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

// For owner-only surfaces (products, inventory, voids, audit log).
export async function requireOwnerOrRedirect(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "owner") redirect("/pos");
  return session;
}
