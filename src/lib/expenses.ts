// Money the store spends: flour and other ingredients for the bread,
// supplies, bills, rent, wages… Recorded by the owner or staff; only the
// owner can change or delete one. Every add, change and delete is in the
// Audit Log.
//
// An expense paid with cash from the register drawer is marked from_drawer,
// and End of Day takes it off the cash that should be in the drawer.
import { readBatch, runBatch, stmt } from "./db";
import { auditStmt } from "./audit";
import { formatCurrency, formatDate, manilaToday, round2 } from "./format";
import type { Actor } from "./checkout";
import { EXPENSE_CATEGORIES, EXPENSE_METHODS, type Expense } from "./expenseTypes";

export * from "./expenseTypes";

export interface ExpenseSummary {
  total: number;
  count: number;
  fromDrawer: number;
  byCategory: { category: string; count: number; total: number }[];
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const clean = (v: FormDataEntryValue | null, max: number) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max) || null;

interface ExpenseFields {
  spentOn: string;
  category: string;
  description: string;
  amount: number;
  method: string;
  fromDrawer: boolean;
  supplier: string | null;
  notes: string | null;
}

function readExpense(fd: FormData): ExpenseFields | { error: string } {
  const spentOn = String(fd.get("spent_on") ?? "").trim() || manilaToday();
  if (!ISO.test(spentOn)) return { error: "Choose the date it was paid." };
  if (spentOn > manilaToday()) return { error: "The date can't be in the future." };
  const category = String(fd.get("category") ?? "");
  if (!(EXPENSE_CATEGORIES as readonly string[]).includes(category)) return { error: "Choose a category." };
  const description = clean(fd.get("description"), 120);
  if (!description) return { error: "Say what it was for, e.g. \"2 sacks of flour\"." };
  const amount = round2(Number(String(fd.get("amount") ?? "").replace(/[₱,\s]/g, "")));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter the amount paid." };
  if (amount > 10_000_000) return { error: "That amount is too large." };
  const method = String(fd.get("payment_method") ?? "Cash");
  if (!(EXPENSE_METHODS as readonly string[]).includes(method)) return { error: "Choose how it was paid." };
  return {
    spentOn,
    category,
    description,
    amount,
    method,
    // Only cash can come out of the drawer.
    fromDrawer: method === "Cash" && fd.get("from_drawer") != null,
    supplier: clean(fd.get("supplier"), 80),
    notes: clean(fd.get("notes"), 300),
  };
}

const label = (e: { description: string; amount: number; spentOn: string }) =>
  `${e.description} (${formatCurrency(e.amount)}, ${formatDate(e.spentOn)})`;

export async function createExpense(actor: Actor, fd: FormData): Promise<{ error?: string; ok?: string }> {
  const f = readExpense(fd);
  if ("error" in f) return f;
  await runBatch([
    stmt`INSERT INTO expenses (spent_on, category, description, amount, payment_method, from_drawer, supplier, notes, recorded_by)
         VALUES (${f.spentOn}, ${f.category}, ${f.description}, ${f.amount}, ${f.method}, ${f.fromDrawer ? 1 : 0},
                 ${f.supplier}, ${f.notes}, ${actor.name})`,
    auditStmt({
      actorName: actor.name,
      actorRole: actor.role,
      action: "expense.create",
      summary: `Recorded expense: ${label(f)} — ${f.category}${f.fromDrawer ? ", cash from the drawer" : ""}`,
      details: { ...f },
    }),
  ]);
  return { ok: `Saved: ${f.description}, ${formatCurrency(f.amount)}.` };
}

export async function updateExpense(actor: Actor, fd: FormData): Promise<{ error?: string; ok?: string }> {
  if (actor.role !== "owner") return { error: "Only the owner can change an expense." };
  const id = Number(fd.get("id"));
  const f = readExpense(fd);
  if ("error" in f) return f;
  const [[before]] = await readBatch<[Expense[]]>([stmt`SELECT * FROM expenses WHERE id = ${id}`]);
  if (!before) return { error: "That expense no longer exists." };
  await runBatch([
    stmt`UPDATE expenses SET spent_on = ${f.spentOn}, category = ${f.category}, description = ${f.description},
           amount = ${f.amount}, payment_method = ${f.method}, from_drawer = ${f.fromDrawer ? 1 : 0},
           supplier = ${f.supplier}, notes = ${f.notes}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ${id}`,
    auditStmt({
      actorName: actor.name,
      actorRole: actor.role,
      action: "expense.update",
      summary: `Changed expense: ${label({ description: before.description, amount: before.amount, spentOn: before.spent_on })} → ${label(f)}`,
      details: { id, before, after: f },
    }),
  ]);
  return { ok: "Expense updated." };
}

export async function deleteExpense(actor: Actor, id: number): Promise<{ error?: string; ok?: string }> {
  if (actor.role !== "owner") return { error: "Only the owner can delete an expense." };
  const [[before]] = await readBatch<[Expense[]]>([stmt`SELECT * FROM expenses WHERE id = ${id}`]);
  if (!before) return { error: "That expense no longer exists." };
  await runBatch([
    stmt`DELETE FROM expenses WHERE id = ${id}`,
    auditStmt({
      actorName: actor.name,
      actorRole: actor.role,
      action: "expense.delete",
      summary: `Deleted expense: ${label({ description: before.description, amount: before.amount, spentOn: before.spent_on })} — recorded by ${before.recorded_by}`,
      details: { before },
    }),
  ]);
  return { ok: "Expense deleted." };
}

export async function listExpenses(from: string, to: string): Promise<Expense[]> {
  const [rows] = await readBatch<[Expense[]]>([
    stmt`SELECT * FROM expenses WHERE spent_on >= ${from} AND spent_on <= ${to} ORDER BY spent_on DESC, id DESC`,
  ]);
  return rows;
}

export async function getExpenseSummary(from: string, to: string): Promise<ExpenseSummary> {
  const [[totals], byCategory] = await readBatch<
    [{ total: number; count: number; drawer: number }[], ExpenseSummary["byCategory"]]
  >([
    stmt`SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count,
                COALESCE(SUM(CASE WHEN from_drawer = 1 THEN amount ELSE 0 END), 0) AS drawer
         FROM expenses WHERE spent_on >= ${from} AND spent_on <= ${to}`,
    stmt`SELECT category, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total
         FROM expenses WHERE spent_on >= ${from} AND spent_on <= ${to}
         GROUP BY category ORDER BY total DESC`,
  ]);
  return {
    total: round2(totals.total),
    count: totals.count,
    fromDrawer: round2(totals.drawer),
    byCategory: byCategory.map((c) => ({ ...c, total: round2(c.total) })),
  };
}
