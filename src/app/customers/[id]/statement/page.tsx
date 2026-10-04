import { notFound } from "next/navigation";
import { requireSessionOrRedirect } from "@/lib/rbac";
import { getCreditItems, getCustomer, getLedger, getOpenCreditSales } from "@/lib/queries";
import { formatCurrency, formatDate, formatDateTime, formatQty, manilaToday } from "@/lib/format";
import { daysSince } from "@/lib/types";
import { PageHeader } from "@/components/ui";
import PrintButton from "@/components/PrintButton";

// A statement of account for one credit customer — what they owe, receipt by
// receipt, with how long each has been unpaid — to print or photograph and
// hand to them.
const BUCKETS = [
  { label: "0–30 days", max: 30 },
  { label: "31–60 days", max: 60 },
  { label: "61–90 days", max: 90 },
  { label: "Over 90 days", max: Infinity },
];

function recentPayments<T extends { entry_type: string; created_at: string }>(ledger: T[], days: number): T[] {
  const since = Date.now() - days * 86400_000;
  return ledger.filter((l) => l.entry_type === "payment" && Date.parse(l.created_at) >= since);
}

export default async function StatementPage({ params }: PageProps<"/customers/[id]/statement">) {
  await requireSessionOrRedirect();
  const { id } = await params;
  const customer = await getCustomer(Number(id));
  if (!customer) notFound();
  const [open, items, ledger] = await Promise.all([
    getOpenCreditSales(customer.id),
    getCreditItems(customer.id),
    getLedger(customer.id),
  ]);

  const rows = open.map((s) => ({
    ...s,
    days: daysSince(s.created_at) ?? 0,
    items: items
      .filter((i) => i.sale_id === s.id)
      .map((i) => (i.unit === "kg" && i.packs == null ? `${formatQty(i.qty)} kg ${i.name}` : `${formatQty(i.qty)} × ${i.name}`))
      .join(", "),
  }));
  const buckets = BUCKETS.map((b, i) => {
    const min = i === 0 ? -1 : BUCKETS[i - 1].max;
    return { ...b, total: rows.filter((r) => r.days > min && r.days <= b.max).reduce((t, r) => t + r.outstanding, 0) };
  });
  const totalDue = rows.reduce((t, r) => t + r.outstanding, 0);
  const payments = recentPayments(ledger, 90);

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title={`Statement — ${customer.name}`}
          subtitle="Print this, or save it as a PDF from the print window, to give to the customer."
          back={{ href: `/customers/${customer.id}`, label: customer.name }}
          actions={<PrintButton label="Print statement" />}
        />
      </div>

      <article className="mx-auto max-w-3xl rounded-xl border border-line bg-surface p-8 shadow-sm print:max-w-none print:border-0 print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
          <div>
            <div className="text-lg font-bold uppercase tracking-wide">Momikie&apos;s General Merchandise</div>
            <div className="text-sm text-muted">Statement of account</div>
          </div>
          <div className="text-right text-sm">
            <div>
              Date: <strong>{formatDate(manilaToday())}</strong>
            </div>
            <div className="text-muted">As of {formatDateTime(new Date().toISOString())}</div>
          </div>
        </header>

        <section className="mt-5 flex flex-wrap justify-between gap-4">
          <div className="text-sm">
            <div className="text-muted">Customer</div>
            <div className="text-base font-semibold">{customer.name}</div>
            {customer.phone && <div>{customer.phone}</div>}
            {customer.address && <div>{customer.address}</div>}
          </div>
          <div className="rounded-lg bg-slate-50 px-5 py-3 text-right print:bg-transparent print:px-0">
            <div className="text-sm text-muted">Total amount due</div>
            <div className="text-2xl font-bold tabular-nums">{formatCurrency(totalDue)}</div>
            {customer.credit_limit != null && (
              <div className="text-xs text-muted">Credit limit {formatCurrency(customer.credit_limit)}</div>
            )}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">How long it has been owed</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {buckets.map((b) => (
              <div key={b.label} className="rounded-lg border border-line px-3 py-2">
                <div className="text-xs text-muted">{b.label}</div>
                <div className={`font-semibold tabular-nums ${b.max > 60 && b.total > 0 ? "text-red-700" : ""}`}>{formatCurrency(b.total)}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Unpaid receipts</h2>
          {rows.length === 0 ? (
            <p className="rounded-lg border border-line px-4 py-6 text-center text-sm text-muted">Nothing owed — fully paid. Thank you!</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">Receipt / items</th>
                  <th className="py-2 pr-3 text-right font-medium">Charged</th>
                  <th className="py-2 pr-3 text-right font-medium">Paid</th>
                  <th className="py-2 pr-3 text-right font-medium">Balance</th>
                  <th className="py-2 text-right font-medium">Days</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="whitespace-nowrap py-2 pr-3">{formatDate(r.created_at.slice(0, 10))}</td>
                    <td className="py-2 pr-3">
                      <div className="font-medium">{r.receipt_no}</div>
                      <div className="text-xs text-muted">{r.items}</div>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(r.credit_amount)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.paid > 0.004 ? formatCurrency(r.paid) : "—"}</td>
                    <td className="py-2 pr-3 text-right font-semibold tabular-nums">{formatCurrency(r.outstanding)}</td>
                    <td className={`py-2 text-right tabular-nums ${r.days > 60 ? "font-semibold text-red-700" : r.days > 30 ? "text-amber-700" : ""}`}>
                      {r.days}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300">
                  <td colSpan={4} className="py-2 pr-3 text-right font-semibold">
                    Total due
                  </td>
                  <td className="py-2 pr-3 text-right text-base font-bold tabular-nums">{formatCurrency(totalDue)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </section>

        {payments.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Payments received (last 90 days)</h2>
            <ul className="divide-y divide-slate-100 text-sm">
              {payments.map((p) => (
                <li key={p.id} className="flex justify-between py-1.5">
                  <span>
                    {formatDate(p.created_at.slice(0, 10))} · {p.payment_method}
                    {p.applied_to && <span className="text-muted"> · for {p.applied_to}</span>}
                  </span>
                  <span className="tabular-nums">{formatCurrency(-p.amount)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="mt-8 border-t border-line pt-4 text-center text-xs text-muted">
          Please settle your balance at the store. Thank you for your continued patronage!
          <div className="mt-2 font-semibold uppercase tracking-wide">This document is not valid for claim of input tax.</div>
        </footer>
      </article>
    </>
  );
}
