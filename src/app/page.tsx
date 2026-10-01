import Link from "next/link";
import { requireOwnerOrRedirect } from "@/lib/rbac";
import { getDb } from "@/lib/db";
import { getCreditSummary, listCustomers } from "@/lib/queries";
import { formatCurrency, manilaDayRange, manilaToday } from "@/lib/format";
import { Card, CardHeader, PageHeader, Stat, btnPrimary, btnSecondary } from "@/components/ui";

export default async function DashboardPage() {
  await requireOwnerOrRedirect();
  const sql = getDb();
  const [start, end] = manilaDayRange(manilaToday());

  const [[sales], [low], [overrides], top, credit, customers] = await Promise.all([
    sql<{ count: number; total: number; profit: number }[]>`
      SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS total,
        COALESCE(SUM(total - (SELECT COALESCE(SUM(unit_cost * qty), 0) FROM sale_items i WHERE i.sale_id = s.id)), 0) AS profit
      FROM sales s WHERE voided_at IS NULL AND created_at >= ${start} AND created_at < ${end}`,
    sql<{ count: number }[]>`
      SELECT COUNT(*) AS count FROM products WHERE is_active = 1 AND stock_qty <= reorder_level`,
    sql<{ count: number }[]>`
      SELECT COUNT(*) AS count FROM audit_log
      WHERE action = 'price.override' AND created_at >= ${start} AND created_at < ${end}`,
    sql<{ name: string; qty: number; revenue: number }[]>`
      SELECT i.name, SUM(i.qty) AS qty, SUM(i.line_total) AS revenue
      FROM sale_items i JOIN sales s ON s.id = i.sale_id
      WHERE s.voided_at IS NULL AND s.created_at >= ${start} AND s.created_at < ${end}
      GROUP BY i.name ORDER BY revenue DESC LIMIT 5`,
    getCreditSummary(start, end),
    listCustomers({ activeOnly: true }),
  ]);
  const topDebtors = customers.filter((c) => c.balance > 0.004).sort((a, b) => b.balance - a.balance).slice(0, 5);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Today's sales, stock and credit at a glance."
        actions={
          <Link href="/pos" className={btnPrimary}>
            Open register
          </Link>
        }
      />

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Today</h2>
      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Sales" value={formatCurrency(sales.total)} hint={`${sales.count} completed sales`} />
        <Stat label="Gross profit" value={formatCurrency(sales.profit)} hint="Sales minus the cost of items sold" />
        <Stat label="Credit payments received" value={formatCurrency(credit.collected)} />
        <Stat
          label="Items sold at other than SRP"
          value={String(overrides.count)}
          hint="See Audit Log → Price changes"
          tone={overrides.count ? "warn" : "default"}
        />
      </div>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Overall</h2>
      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <Stat label="Total owed by customers" value={formatCurrency(credit.receivable)} hint={`${credit.debtors} customers with a balance`} />
        <Stat label="Products low or out of stock" value={String(low.count)} tone={low.count ? "warn" : "default"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Best sellers today" />
          {top.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">No sales yet today.</p>
          ) : (
            <ul className="divide-y divide-line">
              {top.map((t) => (
                <li key={t.name} className="flex justify-between px-5 py-3 text-sm">
                  <span>
                    {t.name} <span className="text-muted">× {t.qty}</span>
                  </span>
                  <span className="font-medium tabular-nums">{formatCurrency(t.revenue)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader
            title="Largest credit balances"
            actions={
              <Link href="/customers" className={`${btnSecondary} !px-3 !py-1 text-xs`}>
                View all
              </Link>
            }
          />
          {topDebtors.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">No outstanding credit.</p>
          ) : (
            <ul className="divide-y divide-line">
              {topDebtors.map((c) => (
                <li key={c.id} className="flex justify-between px-5 py-3 text-sm">
                  <Link href={`/customers/${c.id}`} className="text-brand hover:underline">
                    {c.name}
                  </Link>
                  <span className="font-medium tabular-nums">{formatCurrency(c.balance)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
