import { headers } from "next/headers";
import { getDb } from "./db";
import { isRelaxedLogin } from "./auth";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 60 * 60 * 1000; // 1 hour

// Scoped per-IP (not global) so one person mistyping a PIN repeatedly, or
// deliberately brute-forcing it, doesn't lock everyone else out too. Every
// role shares one pool per IP, so switching roles doesn't buy more guesses.
// On Vercel the platform overwrites x-forwarded-for with the real client
// IP; behind any other host make sure the proxy does the same, or clients
// can pick their own identifier.
async function identifier(): Promise<string> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return `login:${ip}`;
}

export async function isLoginLocked(): Promise<boolean> {
  if (isRelaxedLogin()) return false;
  const sql = getDb();
  const id = await identifier();
  const rows = await sql<{ locked_until: string | null }[]>`
    SELECT locked_until FROM login_attempts WHERE identifier = ${id}
  `;
  const lockedUntil = rows[0]?.locked_until;
  if (lockedUntil == null) return false;
  if (new Date(lockedUntil).getTime() > Date.now()) return true;
  // Lockout served — start the next round with a clean count.
  await sql`DELETE FROM login_attempts WHERE identifier = ${id}`;
  return false;
}

// Call after every login attempt — clears the counter on success, otherwise
// increments it (atomically, so parallel guesses can't all read the same
// count) and locks the IP out once it hits MAX_ATTEMPTS.
export async function recordLoginResult(success: boolean): Promise<void> {
  if (isRelaxedLogin()) return;
  const sql = getDb();
  const id = await identifier();

  if (success) {
    await sql`DELETE FROM login_attempts WHERE identifier = ${id}`;
    return;
  }

  const [{ failed_count }] = await sql<{ failed_count: number }[]>`
    INSERT INTO login_attempts (identifier, failed_count) VALUES (${id}, 1)
    ON CONFLICT (identifier) DO UPDATE SET failed_count = failed_count + 1
    RETURNING failed_count
  `;
  if (failed_count >= MAX_ATTEMPTS) {
    const lockedUntil = new Date(Date.now() + LOCKOUT_MS).toISOString();
    await sql`UPDATE login_attempts SET locked_until = ${lockedUntil} WHERE identifier = ${id}`;
  }
}
