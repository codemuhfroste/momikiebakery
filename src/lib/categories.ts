// Product categories: add, rename, delete. Kept free of Next.js request APIs
// like the other lib/ modules; src/app/products/actions.ts wraps these.
import { GUARD_CHANGED, isGuardFailure, isUniqueFailure, readBatch, runBatch, stmt, type Statement } from "./db";
import { auditStmt } from "./audit";
import type { Actor } from "./checkout";

const MAX_NAME = 40;

function cleanName(raw: unknown): string | { error: string } {
  const name = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!name) return { error: "Enter a category name." };
  if (name.length > MAX_NAME) return { error: `Keep category names under ${MAX_NAME} characters.` };
  return name;
}

// Statements that make sure a category with this name exists (matching names
// case-insensitively, so "snacks" reuses "Snacks"), plus a SQL expression for
// its id — so the product form can create a category and use it in the same
// batch as the product save.
export function ensureCategory(raw: unknown): { error: string } | { statements: Statement[]; idSql: Statement; name: string } {
  const name = cleanName(raw);
  if (typeof name !== "string") return name;
  return {
    name,
    statements: [
      stmt`INSERT INTO categories (name)
           SELECT ${name} WHERE NOT EXISTS (SELECT 1 FROM categories WHERE lower(name) = lower(${name}))`,
    ],
    idSql: stmt`(SELECT id FROM categories WHERE lower(name) = lower(${name}) ORDER BY id LIMIT 1)`,
  };
}

export async function createCategory(actor: Actor, raw: unknown): Promise<{ error?: string; ok?: string }> {
  const name = cleanName(raw);
  if (typeof name !== "string") return name;
  const [[dupe]] = await readBatch<[{ name: string }[]]>([
    stmt`SELECT name FROM categories WHERE lower(name) = lower(${name})`,
  ]);
  if (dupe) return { error: `There is already a category called “${dupe.name}”.` };
  try {
    await runBatch([
      stmt`INSERT INTO categories (name) VALUES (${name})`,
      auditStmt({ actorName: actor.name, actorRole: actor.role, action: "category.create", summary: `Added category ${name}` }),
    ]);
  } catch (err) {
    if (isUniqueFailure(err)) return { error: `There is already a category called “${name}”.` };
    throw err;
  }
  return { ok: `Added “${name}”.` };
}

export async function renameCategory(actor: Actor, id: number, raw: unknown): Promise<{ error?: string; ok?: string }> {
  const name = cleanName(raw);
  if (typeof name !== "string") return name;
  const [[current], [dupe]] = await readBatch<[{ name: string }[], { name: string }[]]>([
    stmt`SELECT name FROM categories WHERE id = ${id}`,
    stmt`SELECT name FROM categories WHERE lower(name) = lower(${name}) AND id != ${id}`,
  ]);
  if (!current) return { error: "That category no longer exists." };
  if (dupe) return { error: `There is already a category called “${dupe.name}”.` };
  if (current.name === name) return { ok: "No change." };
  try {
    await runBatch([
      stmt`UPDATE categories SET name = ${name} WHERE id = ${id}`,
      GUARD_CHANGED,
      auditStmt({
        actorName: actor.name,
        actorRole: actor.role,
        action: "category.update",
        summary: `Renamed category ${current.name} → ${name}`,
        details: { categoryId: id },
      }),
    ]);
  } catch (err) {
    if (isUniqueFailure(err)) return { error: `There is already a category called “${name}”.` };
    if (isGuardFailure(err)) return { error: "That category no longer exists." };
    throw err;
  }
  return { ok: `Renamed to “${name}”.` };
}

// Its products are kept and become Uncategorized. Done explicitly rather than
// relying on ON DELETE SET NULL, which only applies when the database has
// foreign keys switched on (Turso does; a local SQLite file may not).
export async function deleteCategory(actor: Actor, id: number): Promise<{ error?: string; ok?: string }> {
  const [[current]] = await readBatch<[{ name: string; n: number }[]]>([
    stmt`SELECT name, (SELECT COUNT(*) FROM products WHERE category_id = ${id}) AS n FROM categories WHERE id = ${id}`,
  ]);
  if (!current) return { error: "That category no longer exists." };
  await runBatch([
    stmt`UPDATE products SET category_id = NULL WHERE category_id = ${id}`,
    stmt`DELETE FROM categories WHERE id = ${id}`,
    auditStmt({
      actorName: actor.name,
      actorRole: actor.role,
      action: "category.delete",
      summary: `Deleted category ${current.name}${current.n ? ` (${current.n} product${current.n === 1 ? "" : "s"} moved to Uncategorized)` : ""}`,
      details: { categoryId: id },
    }),
  ]);
  return { ok: `Deleted “${current.name}”.` };
}
