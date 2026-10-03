import { getDb, runBatch, stmt, type Statement } from "./db";
import { manilaDayRange } from "./format";

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

export interface AuditInput {
  actorName?: string;
  actorRole: string;
  action: string;
  summary: string;
  details?: Record<string, unknown>;
}

// The INSERT for an audit entry, for including in the same batch as the
// change it records (so the entry and the change succeed or fail together).
export function auditStmt(input: AuditInput): Statement {
  return stmt`
    INSERT INTO audit_log (actor_name, actor_role, action, summary, details)
    VALUES (${input.actorName ?? null}, ${input.actorRole}, ${input.action}, ${input.summary},
            ${input.details ? JSON.stringify(input.details) : null})`;
}

export async function logAudit(input: AuditInput): Promise<void> {
  await runBatch([auditStmt(input)]);
}

const AUDIT_LOG_PAGE_SIZE = 50;

export interface AuditSearch {
  q?: string; // words to find in the details or the person's name
  from?: string; // YYYY-MM-DD, Philippine time
  to?: string;
}

export async function getAuditLogPage(page = 1, filter: AuditFilter = "all", search: AuditSearch = {}) {
  const sql = getDb();
  // Every filter is one or two LIKE patterns; "all" matches everything.
  const patterns = filter === "all" ? ["%"] : FILTER_PREFIXES[filter].map((p) => `${p}%`);
  const [a, b = a] = patterns;
  const q = (search.q ?? "").trim();
  // "!" escapes LIKE's wildcards so a search for "50%" or "a_b" is literal.
  const like = `%${q.replace(/[!%_]/g, (c) => "!" + c)}%`;
  const start = search.from ? manilaDayRange(search.from)[0] : "0000";
  const end = search.to ? manilaDayRange(search.to)[1] : "9999";

  const [{ count }] = await sql<{ count: number }[]>`
    SELECT COUNT(*) AS count FROM audit_log
    WHERE (action LIKE ${a} OR action LIKE ${b})
      AND (${q} = '' OR summary LIKE ${like} ESCAPE '!' OR actor_name LIKE ${like} ESCAPE '!')
      AND created_at >= ${start} AND created_at < ${end}`;
  const totalPages = Math.max(1, Math.ceil(count / AUDIT_LOG_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const offset = (safePage - 1) * AUDIT_LOG_PAGE_SIZE;

  const entries = await sql<AuditLogEntry[]>`
    SELECT * FROM audit_log
    WHERE (action LIKE ${a} OR action LIKE ${b})
      AND (${q} = '' OR summary LIKE ${like} ESCAPE '!' OR actor_name LIKE ${like} ESCAPE '!')
      AND created_at >= ${start} AND created_at < ${end}
    ORDER BY created_at DESC, id DESC
    LIMIT ${AUDIT_LOG_PAGE_SIZE} OFFSET ${offset}`;
  return { entries, page: safePage, totalPages, totalCount: count };
}
