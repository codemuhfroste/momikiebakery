import { getDb } from "./db";

export interface AuditLogEntry {
  id: number;
  actor_name: string | null;
  actor_role: string;
  action: string;
  summary: string;
  details: string | null;
  created_at: string;
}

// Action names are "area.verb". `price.*` covers both SRP changes
// (price.srp_change) and prices overridden at the register (price.override);
// `credit.*` covers charges, payments, voids and limit changes on customer
// accounts.
export type AuditFilter = "all" | "price" | "sales" | "credit" | "stock" | "auth";

const FILTER_PREFIXES: Record<Exclude<AuditFilter, "all">, string[]> = {
  price: ["price.", "product.cost_change"],
  sales: ["sale."],
  credit: ["credit.", "customer."],
  stock: ["stock."],
  auth: ["auth."],
};

export async function logAudit(input: {
  actorName?: string;
  actorRole: string;
  action: string;
  summary: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO audit_log (actor_name, actor_role, action, summary, details)
    VALUES (
      ${input.actorName ?? null},
      ${input.actorRole},
      ${input.action},
      ${input.summary},
      ${input.details ? JSON.stringify(input.details) : null}
    )
  `;
}

const AUDIT_LOG_PAGE_SIZE = 50;

export async function getAuditLogPage(page = 1, filter: AuditFilter = "all") {
  const sql = getDb();
  // Every filter is one or two LIKE patterns; "all" matches everything.
  const patterns = filter === "all" ? ["%"] : FILTER_PREFIXES[filter].map((p) => `${p}%`);
  const [a, b = a] = patterns;

  const [{ count }] = await sql<{ count: number }[]>`
    SELECT COUNT(*) AS count FROM audit_log WHERE action LIKE ${a} OR action LIKE ${b}`;
  const totalPages = Math.max(1, Math.ceil(count / AUDIT_LOG_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const offset = (safePage - 1) * AUDIT_LOG_PAGE_SIZE;

  const entries = await sql<AuditLogEntry[]>`
    SELECT * FROM audit_log WHERE action LIKE ${a} OR action LIKE ${b}
    ORDER BY created_at DESC, id DESC
    LIMIT ${AUDIT_LOG_PAGE_SIZE} OFFSET ${offset}`;
  return { entries, page: safePage, totalPages, totalCount: count };
}
