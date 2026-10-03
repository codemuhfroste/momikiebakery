// Named staff logins. Each staff member signs in at /login with their own
// PIN, so receipts and the Audit Log show who did what instead of a shared
// "Cashier". The shared AUTH_CASHIER_PIN still works as a fallback.
//
// PINs are never stored: only a salted PBKDF2 hash. Because a person signs in
// with the PIN alone, PINs must be unique — that's checked when one is set.
import { isRelaxedLogin, checkRolePin, type LoginRole, type Role } from "./auth";
import { readBatch, runBatch, stmt, isUniqueFailure, type Statement } from "./db";
import { auditStmt } from "./audit";
import type { Actor } from "./checkout";

const ITERATIONS = 60_000;
const MIN_PIN = 6;

export interface StaffMember {
  id: number;
  name: string;
  is_active: number;
  created_at: string;
  last_login_at: string | null;
}

function hex(buf: ArrayBuffer | Uint8Array): string {
  return Array.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashPin(pin: string, saltHex: string): Promise<string> {
  const salt = new Uint8Array(saltHex.match(/../g)!.map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, key, 256);
  return hex(bits);
}

function sameHex(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

async function matchingStaff(pin: string): Promise<{ id: number; name: string; is_active: number } | null> {
  const [rows] = await readBatch<[{ id: number; name: string; is_active: number; pin_salt: string; pin_hash: string }[]]>([
    stmt`SELECT id, name, is_active, pin_salt, pin_hash FROM staff`,
  ]);
  for (const r of rows) {
    if (sameHex(await hashPin(pin, r.pin_salt), r.pin_hash)) return r;
  }
  return null;
}

// Sign-in for both the website and the mobile app. Owner: the owner PIN.
// Cashier: a staff member's own PIN first, then the shared cashier PIN.
export async function authenticate(pin: string, loginRole: LoginRole): Promise<{ role: Role; name: string } | null> {
  pin = pin.trim();
  if (loginRole === "owner") return checkRolePin(pin, "owner");
  if (pin) {
    const staff = await matchingStaff(pin).catch(() => null);
    if (staff?.is_active) {
      await runBatch([stmt`UPDATE staff SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ${staff.id}`]).catch(() => {});
      return { role: "cashier", name: staff.name };
    }
  }
  return checkRolePin(pin, "cashier");
}

export async function listStaff(): Promise<StaffMember[]> {
  const [rows] = await readBatch<[StaffMember[]]>([
    stmt`SELECT id, name, is_active, created_at, last_login_at FROM staff ORDER BY is_active DESC, name COLLATE NOCASE`,
  ]);
  return rows;
}

async function checkNewPin(pin: string, exceptId?: number): Promise<string | null> {
  if (!/^\d+$/.test(pin)) return "Use digits only for the PIN.";
  if (pin.length < MIN_PIN && !isRelaxedLogin()) return `The PIN needs at least ${MIN_PIN} digits.`;
  if (/^(\d)\1+$/.test(pin) || "01234567890".includes(pin) || "09876543210".includes(pin)) {
    return "That PIN is too easy to guess. Avoid repeated or consecutive digits.";
  }
  if (checkRolePin(pin, "owner") || checkRolePin(pin, "cashier")) return "That PIN is already used for another sign-in. Choose a different one.";
  const other = await matchingStaff(pin);
  if (other && other.id !== exceptId) return "That PIN is already used by another staff member. Choose a different one.";
  return null;
}

function cleanName(raw: unknown): string | null {
  const name = String(raw ?? "").replace(/\s+/g, " ").trim();
  return name && name.length <= 40 ? name : null;
}

export async function addStaff(actor: Actor, rawName: unknown, rawPin: unknown): Promise<{ error?: string; ok?: string }> {
  const name = cleanName(rawName);
  if (!name) return { error: "Enter the staff member's name (up to 40 characters)." };
  const pin = String(rawPin ?? "").trim();
  const problem = await checkNewPin(pin);
  if (problem) return { error: problem };
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  try {
    await runBatch([
      stmt`INSERT INTO staff (name, pin_salt, pin_hash) VALUES (${name}, ${salt}, ${await hashPin(pin, salt)})`,
      auditStmt({ actorName: actor.name, actorRole: actor.role, action: "staff.create", summary: `Added staff member ${name}` }),
    ]);
  } catch (err) {
    if (isUniqueFailure(err)) return { error: `There is already a staff member called ${name}.` };
    throw err;
  }
  return { ok: `${name} can now sign in at /login with their PIN.` };
}

export async function updateStaff(
  actor: Actor,
  id: number,
  change: { name?: unknown; pin?: unknown; active?: boolean }
): Promise<{ error?: string; ok?: string }> {
  const [[current]] = await readBatch<[{ name: string; is_active: number }[]]>([stmt`SELECT name, is_active FROM staff WHERE id = ${id}`]);
  if (!current) return { error: "That staff member no longer exists." };
  const who = { actorName: actor.name, actorRole: actor.role };
  const batch: Statement[] = [];

  if (change.name !== undefined) {
    const name = cleanName(change.name);
    if (!name) return { error: "Enter a name (up to 40 characters)." };
    if (name !== current.name) {
      batch.push(
        stmt`UPDATE staff SET name = ${name} WHERE id = ${id}`,
        auditStmt({ ...who, action: "staff.update", summary: `Renamed staff member ${current.name} → ${name}` })
      );
    }
  }
  if (change.pin !== undefined) {
    const pin = String(change.pin ?? "").trim();
    const problem = await checkNewPin(pin, id);
    if (problem) return { error: problem };
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
    batch.push(
      stmt`UPDATE staff SET pin_salt = ${salt}, pin_hash = ${await hashPin(pin, salt)} WHERE id = ${id}`,
      auditStmt({ ...who, action: "staff.pin_reset", summary: `Changed the PIN of ${current.name}` })
    );
  }
  if (change.active !== undefined && change.active !== !!current.is_active) {
    batch.push(
      stmt`UPDATE staff SET is_active = ${change.active ? 1 : 0} WHERE id = ${id}`,
      auditStmt({
        ...who,
        action: "staff.update",
        summary: `${change.active ? "Re-activated" : "Deactivated"} staff member ${current.name}${change.active ? "" : " (can no longer sign in)"}`,
      })
    );
  }
  if (batch.length === 0) return { ok: "No change." };
  try {
    await runBatch(batch);
  } catch (err) {
    if (isUniqueFailure(err)) return { error: "There is already a staff member with that name." };
    throw err;
  }
  return { ok: "Saved." };
}
