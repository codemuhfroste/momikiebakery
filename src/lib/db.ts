import { createClient, type Client } from "@libsql/client";

declare global {
  var __momikieTurso: Client | undefined;
  var __momikieTursoUrl: string | undefined;
}

function createConnection(): Client {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  // A local file: URL (e.g. file:data/momikie.db) needs no auth token.
  if (!url || (!authToken && !url.startsWith("file:"))) {
    throw new Error(
      "TURSO_DATABASE_URL / TURSO_AUTH_TOKEN are not set. Point them at your Turso database (turso db show <name> --url / turso db tokens create <name>)."
    );
  }
  return createClient({ url, authToken });
}

// One client per process, kept on `global` so dev hot-reloads don't open a
// new connection each time. Re-created if TURSO_DATABASE_URL changes, so
// switching .env.local between the local file and Turso takes effect
// without restarting `next dev`.
function getClient(): Client {
  const url = process.env.TURSO_DATABASE_URL;
  if (!global.__momikieTurso || global.__momikieTursoUrl !== url) {
    global.__momikieTurso?.close();
    global.__momikieTurso = createConnection();
    global.__momikieTursoUrl = url;
  }
  return global.__momikieTurso;
}

// For reads and one-off writes. Anything that writes more than one row goes
// through runBatch below — never statement-by-statement — because each
// statement is a network round trip to Turso.
export interface SqlTag {
  <T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

type Executor = (text: string, args: unknown[]) => Promise<unknown[]>;

// libSQL rows carry hidden array-style extras (numeric indexes, length), so
// React refuses to pass them to Client Components ("Only plain objects can
// be passed…"). Copying each into a plain object keeps just the columns.
function plainRows(rows: object[]): Record<string, unknown>[] {
  return rows.map((row) => ({ ...row }));
}

// Tagged-template call shape (sql`... ${value} ...`): embedded values become
// positional `?` placeholders, so they are always parameterised.
function buildTag(executor: Executor): SqlTag {
  const tag = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce(
      (acc, part, i) => acc + part + (i < values.length ? "?" : ""),
      ""
    );
    return executor(text, values);
  }) as SqlTag;

  return tag;
}

export function getDb(): SqlTag {
  const client = getClient();
  return buildTag(async (text, args) => {
    const result = await client.execute({ sql: text, args: args as never[] });
    return plainRows(result.rows);
  });
}

// ---- Batches ----
// With a hosted database every statement is a network round trip (~350 ms
// from the Philippines to Turso's US region), so an interactive transaction
// of 20 statements takes seconds. A batch sends them all at once and runs
// them as one all-or-nothing transaction: if any statement fails, none of
// them apply. Write paths read what they need first, then commit with one
// batch; safety checks that must hold at commit time are written into the
// statements themselves (see checkout.ts).

export interface Statement {
  sql: string;
  args: unknown[];
}

// Builds a statement without running it: stmt`INSERT ... VALUES (${a}, ${b})`.
export function stmt(strings: TemplateStringsArray, ...values: unknown[]): Statement {
  const sql = strings.reduce((acc, part, i) => acc + part + (i < values.length ? "?" : ""), "");
  return { sql, args: values };
}

// A guard: aborts the whole batch if the statement just before it changed no
// rows (e.g. a conditional UPDATE whose WHERE no longer matched because stock
// ran out or the sale was already voided). It works by making json() fail.
export const GUARD_CHANGED: Statement = {
  sql: "SELECT json(CASE WHEN changes() = 0 THEN 'guard failed' ELSE '1' END)",
  args: [],
};

export function isGuardFailure(err: unknown): boolean {
  return err instanceof Error && /malformed JSON/i.test(err.message);
}

export function isUniqueFailure(err: unknown, column?: string): boolean {
  return err instanceof Error && /UNIQUE/i.test(err.message) && (!column || err.message.includes(column));
}

// Runs the statements as one write transaction; returns each one's rows.
export async function runBatch(statements: Statement[]): Promise<Record<string, unknown>[][]> {
  const results = await getClient().batch(
    statements.map((s) => ({ sql: s.sql, args: s.args as never[] })),
    "write"
  );
  return results.map((r) => plainRows(r.rows));
}

// Runs read-only statements together in one round trip. Type the result as
// a tuple of row arrays, e.g. readBatch<[Product[], { n: number }[]]>(...).
export async function readBatch<T extends unknown[] = Record<string, unknown>[][]>(
  statements: Statement[]
): Promise<T> {
  const results = await getClient().batch(
    statements.map((s) => ({ sql: s.sql, args: s.args as never[] })),
    "read"
  );
  return results.map((r) => plainRows(r.rows)) as T;
}
