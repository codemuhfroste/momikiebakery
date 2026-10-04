import Link from "next/link";
import type { ReactNode } from "react";
import { requireManagerOrRedirect } from "@/lib/rbac";
import { getBookGuide, type BookGuide, type GuideDay } from "@/lib/bookGuide";
import { formatCurrency, formatDate, formatQty, formatTime, manilaToday } from "@/lib/format";
import { INVOICE_AT_THRESHOLD, INVOICE_THRESHOLD } from "@/lib/invoiceRules";
import { Card, CardHeader, EmptyState, PageHeader, Table, Tabs, btnSecondary, inputCls } from "@/components/ui";
import PrintButton from "@/components/PrintButton";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400_000).toISOString().slice(0, 10);

const TABS = [
  { key: "booklet", label: "Invoice booklet" },
  { key: "crj", label: "Cash receipts journal" },
  { key: "cdj", label: "Cash disbursements journal" },
  { key: "gj", label: "General journal" },
  { key: "gl", label: "General ledger" },
] as const;
type Tab = (typeof TABS)[number]["key"];

// What to write by hand in the store's registered invoice booklet and books
// of accounts, from the system's records. A guide to copy from — never the
// booklet or the books themselves (see lib/bookGuide.ts).
export default async function ReportGuidePage({ searchParams }: PageProps<"/reports/guide">) {
  await requireManagerOrRedirect();
  const params = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === params.tab) ? (params.tab as Tab) : "booklet";
  const today = manilaToday();
  const monthStart = `${today.slice(0, 8)}01`;
  // The booklet is written day by day; the journals are usually kept by month.
  let to = typeof params.to === "string" && ISO.test(params.to) ? params.to : today;
  let from = typeof params.from === "string" && ISO.test(params.from) ? params.from : tab === "booklet" ? today : monthStart;
  if (from > to) [from, to] = [to, from];
  if (new Date(to).getTime() - new Date(from).getTime() > 92 * 86400_000) from = addDays(to, -92);

  const g = await getBookGuide(from, to);
  const lastMonthEnd = addDays(monthStart, -1);
  const presets = [
    { label: "Today", from: today, to: today },
    { label: "Yesterday", from: addDays(today, -1), to: addDays(today, -1) },
    { label: "This month", from: monthStart, to: today },
    { label: "Last month", from: `${lastMonthEnd.slice(0, 8)}01`, to: lastMonthEnd },
  ];
  const period = from === to ? formatDate(from) : `${formatDate(from)} to ${formatDate(to)}`;
  const q = (t: string) => `/reports/guide?tab=${t}&from=${from}&to=${to}`;

  return (
    <>
      <PageHeader
        title="Report Guide"
        subtitle={`What to write by hand in the store's invoice booklet and books of accounts, for ${period}.`}
        actions={
          <span className="print:hidden">
            <PrintButton label="Print this guide" />
          </span>
        }
      />

      <div className="mb-5 rounded-md border-2 border-dashed border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <strong>Guide only.</strong> Copy these entries by hand into the store&apos;s BIR-registered invoice booklet and books of
        accounts. This page is not an invoice or a book of accounts, and must not be filed as one. Booklet invoice numbers are
        left blank (&ldquo;____&rdquo;): write the number from the booklet.
      </div>

      <form className="mb-5 flex flex-wrap items-end gap-3 print:hidden">
        <input type="hidden" name="tab" value={tab} />
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
                href={`/reports/guide?tab=${tab}&from=${p.from}&to=${p.to}`}
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

      <div className="print:hidden">
        <Tabs active={tab} tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: q(t.key) }))} />
      </div>

      {tab === "booklet" && <Booklet g={g} />}
      {tab === "crj" && <Crj g={g} />}
      {tab === "cdj" && <Cdj g={g} />}
      {tab === "gj" && <Gj g={g} />}
      {tab === "gl" && <Gl g={g} from={from} to={to} />}
    </>
  );
}

// ---------------------------------------------------------------- booklet

function Booklet({ g }: { g: BookGuide }) {
  if (g.days.length === 0) return <EmptyState>No sales on these dates, so there is nothing to write in the booklet.</EmptyState>;
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        One invoice for each sale of {formatCurrency(INVOICE_THRESHOLD)}
        {INVOICE_AT_THRESHOLD ? " or more" : " and up"}, one summary invoice when a day&apos;s smaller sales add up to more than{" "}
        {formatCurrency(INVOICE_THRESHOLD)}, and one for any customer who asks. The original goes to the buyer; the copy stays in
        the booklet.
      </p>
      {g.days.map((d) => (
        <BookletDay key={d.day} d={d} />
      ))}
    </div>
  );
}

function BookletDay({ d }: { d: GuideDay }) {
  const invoices = d.bigSales.length + (d.summaryNeeded ? 1 : 0);
  return (
    <Card>
      <CardHeader
        title={formatDate(d.day)}
        description={invoices === 0 ? "No invoices to write for this day." : `${invoices} invoice${invoices === 1 ? "" : "s"} to write.`}
      />
      <div className="grid gap-4 p-5 lg:grid-cols-2">
        {d.bigSales.map((s) => (
          <InvoiceDraft
            key={s.id}
            date={d.day}
            soldTo={s.customer_name ?? ""}
            charge={s.credit_amount > 0}
            source={
              <>
                From sale{" "}
                <Link href={`/sales/${s.id}`} className="text-brand hover:underline">
                  {s.receipt_no}
                </Link>{" "}
                at {formatTime(s.created_at)}
              </>
            }
            lines={s.lines.map((l) => ({ qty: formatQty(l.qty), unit: l.unit, description: l.description, price: l.unit_price, amount: l.amount }))}
            discount={s.discount}
            total={s.total}
          />
        ))}
        {d.small.count > 0 &&
          (d.summaryNeeded ? (
            <InvoiceDraft
              date={d.day}
              soldTo="Various customers"
              charge={false}
              source={<>Daily summary of {d.small.count} smaller sales{d.small.onCredit > 0 ? ` (${formatCurrency(d.small.onCredit)} of it on utang)` : ""}</>}
              lines={[{ qty: "", unit: "", description: `Sales for the day under ${formatCurrency(INVOICE_THRESHOLD)} – ${d.small.count} sales`, price: null, amount: d.small.total }]}
              discount={0}
              total={d.small.total}
            />
          ) : (
            <div className="rounded-md border border-line p-4 text-sm">
              <p className="font-medium">Smaller sales: {formatCurrency(d.small.total)}</p>
              <p className="mt-1 text-muted">
                {d.small.count} sale{d.small.count === 1 ? "" : "s"} under {formatCurrency(INVOICE_THRESHOLD)}, adding up to no more than{" "}
                {formatCurrency(INVOICE_THRESHOLD)}: no summary invoice needed. They still go in the cash receipts journal.
              </p>
            </div>
          ))}
      </div>
    </Card>
  );
}

function InvoiceDraft({
  date,
  soldTo,
  charge,
  source,
  lines,
  discount,
  total,
}: {
  date: string;
  soldTo: string;
  charge: boolean;
  source: ReactNode;
  lines: { qty: string; unit: string; description: string; price: number | null; amount: number }[];
  discount: number;
  total: number;
}) {
  return (
    <div className="break-inside-avoid rounded-md border border-slate-300 bg-white p-4 text-sm">
      <div className="mb-3 flex items-baseline justify-between gap-3 border-b-2 border-ink pb-1.5">
        <span className="font-semibold tracking-[0.15em]">INVOICE</span>
        <span className="font-mono text-muted">No. ____</span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <dt className="text-muted">Date</dt>
        <dd>{formatDate(date)}</dd>
        <dt className="text-muted">Sold to</dt>
        <dd>{soldTo || <span className="text-muted">(write the buyer&apos;s name if given)</span>}</dd>
        <dt className="text-muted">Terms</dt>
        <dd>{charge ? "☑ Charge sales (utang)" : "☑ Cash sales"}</dd>
      </dl>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="py-1 pr-2 font-medium">Qty</th>
              <th className="py-1 pr-2 font-medium">Unit</th>
              <th className="py-1 pr-2 font-medium">Articles</th>
              <th className="py-1 pr-2 text-right font-medium">Unit price</th>
              <th className="py-1 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-b border-line/60">
                <td className="py-1 pr-2 tabular-nums">{l.qty}</td>
                <td className="py-1 pr-2">{l.unit}</td>
                <td className="py-1 pr-2">{l.description}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{l.price == null ? "" : formatCurrency(l.price)}</td>
                <td className="py-1 text-right tabular-nums">{formatCurrency(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="mt-2 space-y-0.5 text-right">
        {discount > 0 && (
          <div className="flex justify-end gap-6">
            <dt className="text-muted">Less discount</dt>
            <dd className="w-28 tabular-nums">{formatCurrency(discount)}</dd>
          </div>
        )}
        <div className="flex justify-end gap-6 font-semibold">
          <dt>Total amount due</dt>
          <dd className="w-28 tabular-nums">{formatCurrency(total)}</dd>
        </div>
      </dl>
      <p className="mt-3 border-t border-dashed border-line pt-2 text-xs text-muted">{source}</p>
    </div>
  );
}

// ---------------------------------------------------------------- journals

const money = (n: number) => (n ? formatCurrency(n) : "");

function Crj({ g }: { g: BookGuide }) {
  return (
    <Card>
      <CardHeader
        title="Cash receipts journal"
        description="Money that came in: sales paid at the counter (cash, GCash, Maya, card, and down payments on utang) and customers paying their utang."
      />
      {g.crj.length === 0 ? (
        <EmptyState>No money received on these dates.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Ref.</th>
              <th>Particulars</th>
              <th>Received via</th>
              <th className="text-right">Cash Dr.</th>
              <th className="text-right">Sales Cr.</th>
              <th className="text-right">Accounts receivable Cr.</th>
            </tr>
          </thead>
          <tbody>
            {g.crj.map((r, i) => (
              <tr key={i}>
                <td className="whitespace-nowrap">{formatDate(r.day)}</td>
                <td className="whitespace-nowrap font-mono text-xs">{r.ref}</td>
                <td>{r.particulars}</td>
                <td className="text-muted">{r.via}</td>
                <td className="text-right tabular-nums">{money(r.cash)}</td>
                <td className="text-right tabular-nums">{money(r.sales)}</td>
                <td className="text-right tabular-nums">{money(r.receivable)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td colSpan={4} className="text-right">
                Totals (post to the general ledger)
              </td>
              <td className="text-right tabular-nums">{formatCurrency(g.totals.crjCash)}</td>
              <td className="text-right tabular-nums">{formatCurrency(g.totals.crjSales)}</td>
              <td className="text-right tabular-nums">{formatCurrency(g.totals.crjReceivable)}</td>
            </tr>
          </tbody>
        </Table>
      )}
      <Notes>
        <li>Sales sold on utang are not here (no cash came in). They are in the general journal.</li>
        <li>Check: Cash = Sales + Accounts receivable.</li>
        <li>If the bookkeeper keeps GCash, Maya and card money separately, split &ldquo;Cash Dr.&rdquo; using &ldquo;Received via&rdquo;.</li>
      </Notes>
    </Card>
  );
}

function Cdj({ g }: { g: BookGuide }) {
  return (
    <Card>
      <CardHeader title="Cash disbursements journal" description="Money paid out, from the Expenses page. Keep the supplier invoice or bill for each line." />
      {g.cdj.length === 0 ? (
        <EmptyState>
          No expenses recorded on these dates. Record them on the{" "}
          <Link href="/expenses" className="text-brand hover:underline">
            Expenses
          </Link>{" "}
          page.
        </EmptyState>
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Ref.</th>
                <th>Paid to</th>
                <th>Particulars</th>
                <th>Paid via</th>
                <th className="text-right">Cash Cr.</th>
                <th>Debit account</th>
              </tr>
            </thead>
            <tbody>
              {g.cdj.map((r, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap">{formatDate(r.day)}</td>
                  <td className="whitespace-nowrap font-mono text-xs">SI ____</td>
                  <td>{r.paidTo}</td>
                  <td>{r.particulars}</td>
                  <td className="text-muted">{r.via}</td>
                  <td className="text-right tabular-nums">{formatCurrency(r.amount)}</td>
                  <td>{r.account}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td colSpan={5} className="text-right">
                  Total (post to the general ledger)
                </td>
                <td className="text-right tabular-nums">{formatCurrency(g.totals.cdj)}</td>
                <td></td>
              </tr>
            </tbody>
          </Table>
          <div className="border-t border-line px-5 py-4">
            <h3 className="mb-2 text-sm font-semibold">Debit columns (totals by account)</h3>
            <dl className="grid max-w-md gap-1 text-sm">
              {g.totals.cdjByAccount.map((a) => (
                <div key={a.account} className="flex justify-between">
                  <dt>{a.account}</dt>
                  <dd className="tabular-nums">{formatCurrency(a.amount)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </>
      )}
      <Notes>
        <li>&ldquo;SI ____&rdquo;: write the supplier&apos;s invoice or bill number. For wages and anything without an invoice, use a payment voucher number.</li>
        <li>Stock added on the Inventory page is not money paid. Record the payment for it as an expense (&ldquo;Stock for resale&rdquo;) so it shows here.</li>
        <li>Ingredients and stock for resale both go to Purchases. The bookkeeper may prefer other account names.</li>
      </Notes>
    </Card>
  );
}

function Gj({ g }: { g: BookGuide }) {
  return (
    <Card>
      <CardHeader title="General journal" description="Sales on utang: the customer owes the store, and no cash came in yet." />
      {g.gj.length === 0 ? (
        <EmptyState>No sales on utang on these dates.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Account titles and explanation</th>
              <th className="text-right">Debit</th>
              <th className="text-right">Credit</th>
            </tr>
          </thead>
          {g.gj.map((r, i) => (
            <tbody key={i} className="border-b-2 border-line">
              <tr>
                <td className="whitespace-nowrap">{formatDate(r.day)}</td>
                <td>Accounts receivable – {r.customer}</td>
                <td className="text-right tabular-nums">{formatCurrency(r.amount)}</td>
                <td></td>
              </tr>
              <tr>
                <td></td>
                <td className="pl-10">Sales</td>
                <td></td>
                <td className="text-right tabular-nums">{formatCurrency(r.amount)}</td>
              </tr>
              <tr>
                <td></td>
                <td className="text-xs italic text-muted">{r.explanation}</td>
                <td></td>
                <td></td>
              </tr>
            </tbody>
          ))}
          <tbody>
            <tr className="font-semibold">
              <td colSpan={2} className="text-right">
                Totals (post to the general ledger)
              </td>
              <td className="text-right tabular-nums">{formatCurrency(g.totals.gj)}</td>
              <td className="text-right tabular-nums">{formatCurrency(g.totals.gj)}</td>
            </tr>
          </tbody>
        </Table>
      )}
      <Notes>
        <li>Only the part not paid at the counter goes here; a down payment is in the cash receipts journal.</li>
        <li>When the customer pays later, that payment goes in the cash receipts journal, not here.</li>
      </Notes>
    </Card>
  );
}

function Gl({ g, from, to }: { g: BookGuide; from: string; to: string }) {
  const rows: { account: string; source: string; debit: number; credit: number }[] = [
    { account: "Cash", source: "Cash receipts journal", debit: g.totals.crjCash, credit: 0 },
    { account: "Cash", source: "Cash disbursements journal", debit: 0, credit: g.totals.cdj },
    { account: "Accounts receivable", source: "General journal", debit: g.totals.gj, credit: 0 },
    { account: "Accounts receivable", source: "Cash receipts journal", debit: 0, credit: g.totals.crjReceivable },
    { account: "Sales", source: "Cash receipts journal", debit: 0, credit: g.totals.crjSales },
    { account: "Sales", source: "General journal", debit: 0, credit: g.totals.gj },
    ...g.totals.cdjByAccount.map((a) => ({ account: a.account, source: "Cash disbursements journal", debit: a.amount, credit: 0 })),
  ].filter((r) => r.debit || r.credit);
  const debits = rows.reduce((t, r) => t + r.debit, 0);
  const credits = rows.reduce((t, r) => t + r.credit, 0);
  const sales = g.totals.crjSales + g.totals.gj;
  return (
    <Card>
      <CardHeader
        title="General ledger"
        description="The journal totals to post, one line per account page. Add each to the balance carried forward on that page."
      />
      {rows.length === 0 ? (
        <EmptyState>Nothing to post for these dates.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Account</th>
              <th>Posted from</th>
              <th className="text-right">Debit</th>
              <th className="text-right">Credit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="font-medium">{r.account}</td>
                <td className="text-muted">{r.source}</td>
                <td className="text-right tabular-nums">{money(r.debit)}</td>
                <td className="text-right tabular-nums">{money(r.credit)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td colSpan={2} className="text-right">
                Totals (debits must equal credits)
              </td>
              <td className="text-right tabular-nums">{formatCurrency(debits)}</td>
              <td className="text-right tabular-nums">{formatCurrency(credits)}</td>
            </tr>
          </tbody>
        </Table>
      )}
      <Notes>
        <li>
          Change in Cash for these dates: {formatCurrency(g.totals.crjCash - g.totals.cdj)} (money in minus money out).
        </li>
        <li>
          Sales for these dates: {formatCurrency(sales)}, the same as the{" "}
          <Link href={`/reports/sales?from=${from}&to=${to}`} className="text-brand hover:underline">
            Sales Report
          </Link>
          . This is the figure the store&apos;s sales tax is based on.
        </li>
        <li>
          Accounts receivable: the balance should match the total owed in{" "}
          <Link href="/customers" className="text-brand hover:underline">
            Credit Accounts
          </Link>
          .
        </li>
      </Notes>
    </Card>
  );
}

function Notes({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1 border-t border-line px-5 py-3 pl-9 text-xs text-muted">{children}</ul>;
}
