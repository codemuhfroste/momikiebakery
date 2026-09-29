export type Role = "cashier" | "owner";

export interface SessionPayload {
  role: Role;
  name: string;
  exp: number;
}

const SESSION_COOKIE = "momikie_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours — one shift

// No hardcoded fallback in production: with a guessable secret anyone could
// sign their own owner session. Local `next dev` gets a throwaway one.
function getSecret(): string {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV !== "production") return "momikie-local-dev-only-secret-not-for-prod";
  throw new Error("AUTH_SESSION_SECRET must be set to a random string of at least 32 characters.");
}

// The live site (Vercel production) always gets the PIN length minimum and
// the lockout. Previews and local `next dev` skip both, for testing. An
// unknown environment falls back to strict.
export function isRelaxedLogin(): boolean {
  if (process.env.VERCEL_ENV) return process.env.VERCEL_ENV === "preview";
  return process.env.NODE_ENV === "development";
}

// Cashier signs in on /login, Owner on the unlisted /owner page. Each has
// its own PIN env var; a role whose PIN is unset or too short can't sign in.
export type LoginRole = "cashier" | "owner";

const MIN_PIN_LENGTH = 6;

const LOGIN_ROLES: Record<LoginRole, { role: Role; name: string; pinEnv: string }> = {
  cashier: { role: "cashier", name: "Cashier", pinEnv: "AUTH_CASHIER_PIN" },
  owner: { role: "owner", name: "Owner", pinEnv: "AUTH_OWNER_PIN" },
};

export function isLoginRole(value: unknown): value is LoginRole {
  return value === "cashier" || value === "owner";
}

// Checked strictly against the chosen role's PIN, so picking the wrong role
// shows "incorrect PIN" instead of silently signing in as another role.
export function checkRolePin(
  candidate: string,
  loginRole: LoginRole
): { role: Role; name: string } | null {
  const { role, name, pinEnv } = LOGIN_ROLES[loginRole];
  const pin = process.env[pinEnv]?.trim();
  if (!pin || (pin.length < MIN_PIN_LENGTH && !isRelaxedLogin())) return null;
  return constantTimeEqual(candidate.trim(), pin) ? { role, name } : null;
}

// Compares every character regardless of where the first mismatch is, so
// response timing doesn't reveal how much of a PIN or signature was right.
function constantTimeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let str = "";
  for (const b of buf) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const str = atob(padded + pad);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function sign(payload: string): Promise<string> {
  const key = await hmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return toBase64Url(sig);
}

export async function createSessionToken(role: Role, name: string): Promise<string> {
  const payload: SessionPayload = { role, name, exp: Date.now() + SESSION_TTL_MS };
  const payloadB64 = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  return `${payloadB64}.${await sign(payloadB64)}`;
}

export async function verifySessionToken(
  token: string | undefined
): Promise<SessionPayload | null> {
  if (!token) return null;
  const [payloadB64, signature] = token.split(".");
  if (!payloadB64 || !signature) return null;

  const expectedSig = await sign(payloadB64);
  if (!constantTimeEqual(expectedSig, signature)) return null;

  try {
    const payload = JSON.parse(
      new TextDecoder().decode(fromBase64Url(payloadB64))
    ) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp <= Date.now()) return null;
    if (payload.role !== "cashier" && payload.role !== "owner") return null;
    return payload;
  } catch {
    return null;
  }
}

export { SESSION_COOKIE, SESSION_TTL_MS };
