import Link from "next/link";
import { requireOwnerOrRedirect } from "@/lib/rbac";
import { getDb } from "@/lib/db";
import { formatCurrency, manilaDayRange, manilaToday } from "@/lib/format";
import { Card, PageHeader, Stat, btnPrimary } from "@/components/ui";

export default async function DashboardPage() {
  await requireOwnerOrRedirect();
  const sql = getDb();
  const [start, end] = manilaDayRange(manilaToday());

  const [sales] = await sql<{ count: number; total: number; profit: number }[]>`
    SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS total,
      COALESCE(SUM(total - (SELECT COALESCE(SUM(unit_cost * qty), 0) FROM sale_items i WHERE i.sale_id = s.id)), 0) AS profit
    FROM sales s WHERE voided_at IS NULL AND created_at >= ${start} AND created_at < ${end}`;
  const [low] = await sql<{ count: number }[]>`
    SELECT COUNT(*) AS count FROM products WHERE is_active = 1 AND stock_qty <= reorder_level`;
  const [overrides] = await sql<{ count: number }[]>`
    SELECT COUNT(*) AS count FROM audit_log
    WHERE action = 'price.override' AND created_at >= ${start} AND created_at < ${end}`;
  const top = await sql<{ name: string; qty: number; revenue: number }[]>`
    SELECT i.name, SUM(i.qty) AS qty, SUM(i.line_total) AS revenue
    FROM sale_items i JOIN sales s ON s.id = i.sale_id
    WHERE s.voided_at IS NULL AND s.created_at >= ${start} AND s.created_at < ${end}
    GROUP BY i.name ORDER BY revenue DESC LIMIT 5`;

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Today at a glance"
        actions={
          <Link href="/pos" className={btnPrimary}>
            Open register
          </Link>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Sales today" value={formatCurrency(sales.total)} hint={`${sales.count} transactions`} />
        <Stat label="Gross profit" value={formatCurrency(sales.profit)} hint="Sales minus item cost" />
        <Stat
          label="Price overrides"
          value={String(overrides.count)}
          hint="Items sold ≠ SRP today"
          tone={overrides.count ? "warn" : "default"}
        />
        <Stat label="Low-stock items" value={String(low.count)} tone={low.count ? "warn" : "default"} />
      </div>
      <Card>
        <div className="border-b border-line px-5 py-4 font-semibold">Top sellers today</div>
        {top.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">No sales yet today.</p>
        ) : (
          <ul className="divide-y divide-line">
            {top.map((t) => (
              <li key={t.name} className="flex justify-between px-5 py-3 text-sm">
                <span>
                  {t.name} <span className="text-muted">× {t.qty}</span>
                </span>
                <span className="font-medium">{formatCurrency(t.revenue)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
