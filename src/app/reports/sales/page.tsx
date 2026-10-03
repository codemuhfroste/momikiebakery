import Link from "next/link";
import { requireManagerOrRedirect } from "@/lib/rbac";
import { fillDays, getSalesReport } from "@/lib/reports";
import { formatCurrency, formatDate, formatQty, manilaToday } from "@/lib/format";
import { Card, CardHeader, PageHeader, Stat, Table, btnPrimary, btnSecondary, inputCls } from "@/components/ui";
import SalesBarChart from "@/components/SalesBarChart";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400_000).toISOString().slice(0, 10);

// Sales for any date range: totals, a day-by-day chart, and breakdowns by
// category, product and payment method — with a styled Excel download.
export default async function SalesReportPage({ searchParams }: PageProps<"/reports/sales">) {
  await requireManagerOrRedirect();
  const params = await searchParams;
  const today = manilaToday();
  let to = typeof params.to === "string" && ISO.test(params.to) ? params.to : today;
  let from = typeof params.from === "string" && ISO.test(params.from) ? params.from : addDays(to, -13);
  if (from > to) [from, to] = [to, from];
  // Keep a range readable: at most a year.
  if (new Date(to).getTime() - new Date(from).getTime() > 366 * 86400_000) from = addDays(to, -365);

  const r = await getSalesReport(from, to);
  const days = fillDays(from, to, r.byDay);
  const profit = r.totals.revenue - r.totals.cost;
  const monthStart = `${today.slice(0, 8)}01`;
  const presets = [
    { label: "Today", from: today, to: today },
    { label: "Last 7 days", from: addDays(today, -6), to: today },
    { label: "Last 14 days", from: addDays(today, -13), to: today },
    { label: "This month", from: monthStart, to: today },
    { label: "Last 30 days", from: addDays(today, -29), to: today },
  ];
  const q = `from=${from}&to=${to}`;

  return (
    <>
      <PageHeader
        title="Sales Report"
        subtitle={from === to ? `Sales on ${formatDate(from)}.` : `Sales from ${formatDate(from)} to ${formatDate(to)}.`}
        actions={
          <>
            <a href={`/api/reports/export?${q}`} className={btnPrimary}>
              Download Excel report
            </a>
          </>
        }
      />

      {/* Filters live in one row above the figures. */}
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
                href={`/reports/sales?from=${p.from}&to=${p.to}`}
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
        <Stat label="Total sales" value={formatCurrency(r.totals.revenue)} hint={`${r.totals.count} sales · ${r.totals.voids} voided`} />
        <Stat label="Gross profit" value={formatCurrency(profit)} hint={r.totals.revenue > 0 ? `${((profit / r.totals.revenue) * 100).toFixed(0)}% of sales` : undefined} />
        <Stat label="Average sale" value={formatCurrency(r.totals.count ? r.totals.revenue / r.totals.count : 0)} />
        <Stat label="Put on credit" value={formatCurrency(r.totals.credit)} hint={`Discounts given: ${formatCurrency(r.totals.discounts)}`} />
      </div>

      <Card className="mb-6">
        <CardHeader title="Sales per day" description="Hover a bar for the day's figures. The same numbers are in the table below." />
        <div className="px-3 pb-3 pt-4">
          <SalesBarChart data={days} label={`Sales per day from ${from} to ${to}`} />
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="By category" />
          <Table>
            <thead>
              <tr>
                <th>Category</th>
                <th className="text-right">Items</th>
                <th className="text-right">Sales</th>
                <th className="text-right">Profit</th>
              </tr>
            </thead>
            <tbody>
              {r.byCategory.map((c) => (
                <tr key={c.category}>
                  <td>{c.category}</td>
                  <td className="text-right tabular-nums">{formatQty(c.qty)}</td>
                  <td className="text-right font-medium tabular-nums">{formatCurrency(c.revenue)}</td>
                  <td className="text-right tabular-nums text-slate-600">{formatCurrency(c.revenue - c.cost)}</td>
                </tr>
              ))}
              {r.byCategory.length === 0 && <EmptyRow cols={4} />}
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader title="Best sellers" description="Top 15 by sales." />
          <Table>
            <thead>
              <tr>
                <th>Product</th>
                <th className="text-right">Sold</th>
                <th className="text-right">Sales</th>
              </tr>
            </thead>
            <tbody>
              {r.topProducts.map((p) => (
                <tr key={p.name}>
                  <td>{p.name}</td>
                  <td className="text-right tabular-nums">{formatQty(p.qty)}</td>
                  <td className="text-right font-medium tabular-nums">{formatCurrency(p.revenue)}</td>
                </tr>
              ))}
              {r.topProducts.length === 0 && <EmptyRow cols={3} />}
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader title="By payment method" />
          <Table>
            <thead>
              <tr>
                <th>Method</th>
                <th className="text-right">Sales</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {r.byMethod.map((m) => (
                <tr key={m.method}>
                  <td>{m.method === "Credit" ? "Credit (utang)" : m.method}</td>
                  <td className="text-right tabular-nums">{m.count}</td>
                  <td className="text-right font-medium tabular-nums">{formatCurrency(m.total)}</td>
                </tr>
              ))}
              {r.byMethod.length === 0 && <EmptyRow cols={3} />}
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader title="Day by day" />
          <Table>
            <thead>
              <tr>
                <th>Date</th>
                <th className="text-right">Sales</th>
                <th className="text-right">Amount</th>
                <th className="text-right">Profit</th>
              </tr>
            </thead>
            <tbody>
              {[...r.byDay].reverse().map((d) => (
                <tr key={d.day}>
                  <td>
                    <Link href={`/reports?date=${d.day}`} className="text-brand hover:underline">
                      {formatDate(d.day)}
                    </Link>
                  </td>
                  <td className="text-right tabular-nums">{d.count}</td>
                  <td className="text-right font-medium tabular-nums">{formatCurrency(d.revenue)}</td>
                  <td className="text-right tabular-nums text-slate-600">{formatCurrency(d.revenue - d.cost)}</td>
                </tr>
              ))}
              {r.byDay.length === 0 && <EmptyRow cols={4} />}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}

function EmptyRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols} className="text-center text-muted">
        No sales in this period.
      </td>
    </tr>
  );
}
