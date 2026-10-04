import Link from "next/link";
import { requireManagerOrRedirect } from "@/lib/rbac";
import { getDaySummary } from "@/lib/reports";
import { formatCurrency, formatDate, formatQty, formatTime, manilaToday } from "@/lib/format";
import { INVOICE_AT_THRESHOLD, INVOICE_THRESHOLD } from "@/lib/invoiceRules";
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
        <Stat
          label="Cash that should be in the drawer"
          value={formatCurrency(s.cashExpected)}
          hint={`Cash sales + cash down payments + cash credit payments${s.expensesFromDrawer > 0 ? " − expenses paid from the drawer" : ""}`}
        />
        <Stat label="Total sales" value={formatCurrency(s.grossSales)} hint={`${s.salesCount} sales · ${formatQty(s.itemsSold)} items`} />
        <Stat label="Gross profit" value={formatCurrency(profit)} hint="Sales minus the cost of items sold" />
        <Stat label="Put on credit (utang)" value={formatCurrency(s.creditCharged)} hint="Added to customer balances" />
      </div>

      <Card className="mb-6">
        <CardHeader
          title="For the invoice booklet"
          description="This system's printouts are not invoices. Write these in the store's BIR-registered invoice booklet, and also write one for any customer who asks."
        />
        <div className="grid gap-6 p-5 lg:grid-cols-[3fr_2fr]">
          <div className="min-w-0">
            <h3 className="mb-2 text-sm font-semibold">
              Sales of {formatCurrency(INVOICE_THRESHOLD)}
              {INVOICE_AT_THRESHOLD ? " or more" : " and up"} — one invoice each
            </h3>
            {s.invoicing.bigSales.length === 0 ? (
              <p className="text-sm text-muted">None today.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted">
                      <th className="py-1.5 pr-3 font-medium">Receipt</th>
                      <th className="py-1.5 pr-3 font-medium">Time</th>
                      <th className="py-1.5 pr-3 font-medium">Customer</th>
                      <th className="py-1.5 pr-3 font-medium">Paid by</th>
                      <th className="py-1.5 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {s.invoicing.bigSales.map((x) => (
                      <tr key={x.id}>
                        <td className="py-1.5 pr-3">
                          <Link href={`/sales/${x.id}`} className="text-brand hover:underline">
                            {x.receipt_no}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap py-1.5 pr-3">{formatTime(x.created_at)}</td>
                        <td className="py-1.5 pr-3">{x.customer_name ?? "—"}</td>
                        <td className="py-1.5 pr-3">{x.payment_method === "Credit" ? "Credit (utang)" : x.payment_method}</td>
                        <td className="py-1.5 text-right font-medium tabular-nums">{formatCurrency(x.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="rounded-md border border-line p-4">
            <h3 className="text-sm font-semibold">Summary invoice for the smaller sales</h3>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{formatCurrency(s.invoicing.smallTotal)}</p>
            <p className="text-sm text-muted">
              {s.invoicing.smallCount} sale{s.invoicing.smallCount === 1 ? "" : "s"} under {formatCurrency(INVOICE_THRESHOLD)}
            </p>
            <p className={`mt-3 text-sm font-medium ${s.invoicing.summaryNeeded ? "text-amber-800" : "text-muted"}`}>
              {s.invoicing.summaryNeeded
                ? `Over ${formatCurrency(INVOICE_THRESHOLD)}: write one summary invoice for ${formatCurrency(s.invoicing.smallTotal)}.`
                : `Not over ${formatCurrency(INVOICE_THRESHOLD)}: no summary invoice needed for today.`}
            </p>
          </div>
        </div>
        <p className="border-t border-line px-5 py-3 text-xs text-muted">
          Voided sales are left out. Credit (utang) sales are included on the day they were made. These rules are the store&apos;s
          understanding and are still to be confirmed with the bookkeeper. The{" "}
          <Link href={`/reports/guide?tab=booklet&from=${date}&to=${date}`} className="text-brand hover:underline print:hidden">
            Report Guide
          </Link>{" "}
          shows each invoice with its items, and what goes in each book.
        </p>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Cash drawer" description="Where the cash in the drawer should have come from today." />
          <div className="p-5">
            <dl className="mb-4 space-y-1.5 text-sm">
              <Row label="Cash sales" value={cashSales} />
              <Row label="Cash down payments on credit sales" value={s.creditDownPayments} />
              <Row label="Credit payments received in cash" value={cashPayments} />
              {s.expensesFromDrawer > 0 && <Row label="Expenses paid from the drawer" value={-s.expensesFromDrawer} />}
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
              <dt className="text-muted">
                Expenses recorded for this day{" "}
                <Link href={`/expenses?from=${date}&to=${date}`} className="text-brand hover:underline print:hidden">
                  (see)
                </Link>
              </dt>
              <dd className="tabular-nums">{formatCurrency(s.expensesTotal)}</dd>
            </div>
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
