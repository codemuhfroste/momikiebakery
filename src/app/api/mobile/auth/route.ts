import { createSessionToken, isLoginRole } from "@/lib/auth";
import { authenticate } from "@/lib/staff";
import { logAudit } from "@/lib/audit";
import { isLoginLocked, recordLoginResult } from "@/lib/loginThrottle";
import { json, preflight } from "@/lib/mobileAuth";

// POST /api/mobile/auth  { role: "cashier" | "owner", pin }
// Same PIN check and per-network lockout as the website's sign-in.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const loginRole = body?.role;
  if (!isLoginRole(loginRole)) return json({ error: "Choose Cashier or Owner." }, 400);
  if (await isLoginLocked()) return json({ error: "Too many incorrect PINs. Try again in an hour." }, 429);

  const pin = typeof body?.pin === "string" ? body.pin : "";
  const result = await authenticate(pin, loginRole);
  await recordLoginResult(result !== null);
  if (!result) return json({ error: "That PIN isn't right." }, 401);

  const token = await createSessionToken(result.role, result.name);
  await logAudit({
    actorName: result.name,
    actorRole: result.role,
    action: "auth.login",
    summary: `${result.name} signed in on the mobile app`,
    details: { via: "mobile" },
  });
  return json({ token, role: result.role, name: result.name });
}

export const OPTIONS = preflight;
