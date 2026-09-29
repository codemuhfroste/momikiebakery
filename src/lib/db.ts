import { createClient, type Client } from "@libsql/client";

declare global {
  var __momikieTurso: Client | undefined;
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

function getClient(): Client {
  if (!global.__momikieTurso) {
    global.__momikieTurso = createConnection();
  }
  return global.__momikieTurso;
}

export interface SqlTag {
  <T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  begin<T>(fn: (tx: SqlTag) => Promise<T>): Promise<T>;
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

  tag.begin = async <T>(fn: (tx: SqlTag) => Promise<T>): Promise<T> => {
    const client = getClient();
    const transaction = await client.transaction("write");
    try {
      const txTag = buildTag(async (text, args) => {
        const result = await transaction.execute({ sql: text, args: args as never[] });
        return plainRows(result.rows);
      });
      const result = await fn(txTag);
      await transaction.commit();
      return result;
    } catch (err) {
      await transaction.rollback();
      throw err;
    } finally {
      transaction.close();
    }
  };

  return tag;
}

export function getDb(): SqlTag {
  const client = getClient();
  return buildTag(async (text, args) => {
    const result = await client.execute({ sql: text, args: args as never[] });
    return plainRows(result.rows);
  });
}
