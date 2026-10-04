import Link from "next/link";
import { requireManagerOrRedirect } from "@/lib/rbac";
import { getExpenseSummary, listExpenses } from "@/lib/expenses";
import { formatCurrency, formatDate, manilaToday } from "@/lib/format";
import { Card, CardHeader, PageHeader, Stat, Table, btnSecondary, inputCls } from "@/components/ui";
import ExpensesTable, { AddExpenseButton } from "@/components/ExpensesBoard";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400_000).toISOString().slice(0, 10);

// Money paid out for the store (flour, supplies, bills…), for any dates:
// totals by category and every expense. Owner and staff record them; only
// the owner changes or deletes one.
export default async function ExpensesPage({ searchParams }: PageProps<"/expenses">) {
  const session = await requireManagerOrRedirect();
  const params = await searchParams;
  const today = manilaToday();
  const monthStart = `${today.slice(0, 8)}01`;
  let to = typeof params.to === "string" && ISO.test(params.to) ? params.to : today;
  let from = typeof params.from === "string" && ISO.test(params.from) ? params.from : monthStart;
  if (from > to) [from, to] = [to, from];

  const [expenses, summary] = await Promise.all([listExpenses(from, to), getExpenseSummary(from, to)]);
  const lastMonthEnd = addDays(monthStart, -1);
  const presets = [
    { label: "Today", from: today, to: today },
    { label: "Last 7 days", from: addDays(today, -6), to: today },
    { label: "This month", from: monthStart, to: today },
    { label: "Last month", from: `${lastMonthEnd.slice(0, 8)}01`, to: lastMonthEnd },
    { label: "Last 30 days", from: addDays(today, -29), to: today },
  ];
  const top = summary.byCategory[0];

  return (
    <>
      <PageHeader
        title="Expenses"
        subtitle="Money paid out for the store — flour and other ingredients, supplies, bills, rent, wages. The Sales Report takes them off the profit."
        actions={<AddExpenseButton today={today} />}
      />

      <form className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="from" className="mb-1 block text-xs font-medium text-muted">
            From
          </label>
          <input id="from" type="date" name="from" defaultValue={from} max={today} className={`${inputCls} w-auto`} />
        </div>
        <div>
          <label htmlFor="to" className="mb-1 block text-xs font-medium text-muted">
            To
          </label>
          <input id="to" type="date" name="to" defaultValue={to} max={today} className={`${inputCls} w-auto`} />
        </div>
        <button className={btnSecondary}>Show</button>
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => {
            const active = p.from === from && p.to === to;
            return (
              <Link
                key={p.label}
                href={`/expenses?from=${p.from}&to=${p.to}`}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  active ? "border-brand bg-brand text-white" : "border-line bg-white text-ink hover:bg-slate-50"
                }`}
              >
                {p.label}
              </Link>
            );
          })}
        </div>
      </form>

      <div className="stagger mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Total spent"
          value={formatCurrency(summary.total)}
          hint={from === to ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`}
        />
        <Stat label="Number of expenses" value={String(summary.count)} />
        <Stat label="Biggest category" value={top ? top.category : "—"} hint={top ? formatCurrency(top.total) : undefined} />
        <Stat label="Cash taken from the drawer" value={formatCurrency(summary.fromDrawer)} hint="Taken off End of Day's expected cash" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_2fr]">
        <Card>
          <CardHeader title="By category" />
          <Table>
            <thead>
              <tr>
                <th>Category</th>
                <th className="text-right">Count</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {summary.byCategory.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center text-muted">
                    Nothing yet.
                  </td>
                </tr>
              )}
              {summary.byCategory.map((c) => (
                <tr key={c.category}>
                  <td>{c.category}</td>
                  <td className="text-right tabular-nums">{c.count}</td>
                  <td className="text-right font-medium tabular-nums">{formatCurrency(c.total)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="border-t border-line px-5 py-3 text-xs text-muted">
            Profit after expenses is on the{" "}
            <Link href={`/reports/sales?from=${from}&to=${to}`} className="text-brand hover:underline">
              Sales Report
            </Link>
            .
          </p>
        </Card>

        <Card>
          <CardHeader
            title="Every expense"
            description={session.role === "owner" ? "Newest first. Edit or delete fixes a mistake; both go in the Audit Log." : "Newest first. Ask the owner to fix a mistake."}
          />
          <ExpensesTable expenses={expenses} isOwner={session.role === "owner"} today={today} />
        </Card>
      </div>
    </>
  );
}
