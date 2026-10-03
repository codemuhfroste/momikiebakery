import Link from "next/link";
import { requireManagerOrRedirect } from "@/lib/rbac";
import { getDaySummary } from "@/lib/reports";
import { formatCurrency, formatDate, formatQty, formatTime, manilaToday } from "@/lib/format";
import { Card, CardHeader, PageHeader, Stat, Table, btnSecondary, inputCls } from "@/components/ui";
import CashCount from "@/components/CashCount";
import PrintButton from "@/components/PrintButton";

// End of day: what the store took, how it was paid, and the cash that should
// be in the drawer — for closing time.
export default async function EndOfDayPage({ searchParams }: PageProps<"/reports">) {
  await requireManagerOrRedirect();
  const { date: d } = await searchParams;
  const date = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : manilaToday();
  const s = await getDaySummary(date);
  const profit = s.grossSales - s.costOfGoods;
  const nonCash = s.byMethod.filter((m) => m.method !== "Cash" && m.method !== "Credit");
  const cashSales = s.byMethod.find((m) => m.method === "Cash")?.total ?? 0;
  const cashPayments = s.creditPayments.find((m) => m.method === "Cash")?.total ?? 0;

  return (
    <>
      <PageHeader
        title="End of Day"
        subtitle={`Closing summary for ${formatDate(date)}${s.firstSaleAt ? ` · first sale ${formatTime(s.firstSaleAt)}, last ${formatTime(s.lastSaleAt)}` : ""}.`}
        actions={
          <>
            <form className="flex items-center gap-2 print:hidden">
              <label htmlFor="date" className="text-sm text-muted">
                Date
              </label>
              <input id="date" type="date" name="date" defaultValue={date} className={`${inputCls} w-auto`} />
              <button className={btnSecondary}>Show</button>
            </form>
            <span className="print:hidden">
              <PrintButton label="Print summary" />
            </span>
          </>
        }
      />

      <div className="stagger mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Cash that should be in the drawer" value={formatCurrency(s.cashExpected)} hint="Cash sales + cash down payments + cash credit payments" />
        <Stat label="Total sales" value={formatCurrency(s.grossSales)} hint={`${s.salesCount} sales · ${formatQty(s.itemsSold)} items`} />
        <Stat label="Gross profit" value={formatCurrency(profit)} hint="Sales minus the cost of items sold" />
        <Stat label="Put on credit (utang)" value={formatCurrency(s.creditCharged)} hint="Added to customer balances" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Cash drawer" description="Where the cash in the drawer should have come from today." />
          <div className="p-5">
            <dl className="mb-4 space-y-1.5 text-sm">
              <Row label="Cash sales" value={cashSales} />
              <Row label="Cash down payments on credit sales" value={s.creditDownPayments} />
              <Row label="Credit payments received in cash" value={cashPayments} />
              <div className="flex justify-between border-t border-line pt-2 font-semibold">
                <dt>Expected from today</dt>
                <dd className="tabular-nums">{formatCurrency(s.cashExpected)}</dd>
              </div>
            </dl>
            <div className="print:hidden">
              <CashCount expected={s.cashExpected} />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Sales by payment method" />
          <Table>
            <thead>
              <tr>
                <th>Method</th>
                <th className="text-right">Sales</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {s.byMethod.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center text-muted">
                    No sales on this day.
                  </td>
                </tr>
              )}
              {s.byMethod.map((m) => (
                <tr key={m.method}>
                  <td>{m.method === "Credit" ? "Credit (utang)" : m.method}</td>
                  <td className="text-right tabular-nums">{m.count}</td>
                  <td className="text-right font-medium tabular-nums">{formatCurrency(m.total)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          {nonCash.length > 0 && (
            <p className="border-t border-line px-5 py-3 text-xs text-muted">
              GCash, Maya and card sales ({formatCurrency(nonCash.reduce((t, m) => t + m.total, 0))}) go to those accounts, not the drawer.
            </p>
          )}
        </Card>

        <Card>
          <CardHeader title="Credit payments received" description="Customers paying toward their balances." />
          <Table>
            <thead>
              <tr>
                <th>Paid through</th>
                <th className="text-right">Payments</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {s.creditPayments.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center text-muted">
                    No credit payments on this day.
                  </td>
                </tr>
              )}
              {s.creditPayments.map((m) => (
                <tr key={m.method}>
                  <td>{m.method}</td>
                  <td className="text-right tabular-nums">{m.count}</td>
                  <td className="text-right font-medium tabular-nums">{formatCurrency(m.total)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader title="Other figures" />
          <dl className="space-y-1.5 p-5 text-sm">
            <Row label="Discounts given" value={s.discounts} />
            <Row label="Cost of items sold" value={s.costOfGoods} />
            <div className="flex justify-between">
              <dt className="text-muted">Items sold at other than SRP</dt>
              <dd className="tabular-nums">{s.priceOverrides}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Voided sales</dt>
              <dd className="tabular-nums">
                {s.voids.count} {s.voids.count > 0 && `(${formatCurrency(s.voids.total)})`}
              </dd>
            </div>
          </dl>
          <p className="border-t border-line px-5 py-3 text-xs text-muted print:hidden">
            See every sale for this day in{" "}
            <Link href={`/sales?date=${date}`} className="text-brand hover:underline">
              Transactions
            </Link>
            , or a longer period in{" "}
            <Link href="/reports/sales" className="text-brand hover:underline">
              Sales Report
            </Link>
            .
          </p>
        </Card>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular-nums">{formatCurrency(value)}</dd>
    </div>
  );
}
