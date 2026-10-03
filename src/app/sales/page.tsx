import Link from "next/link";
import { requireSessionOrRedirect } from "@/lib/rbac";
import { listSalesBetween } from "@/lib/queries";
import { formatCurrency, formatDate, formatQty, formatTime, manilaDayRange, manilaToday } from "@/lib/format";
import { CREDIT_STATUS_LABELS, creditPaymentStatus } from "@/lib/types";
import { Badge, Card, EmptyState, PageHeader, Stat, Table, Tabs, btnSecondary, inputCls } from "@/components/ui";
import VoidSaleButton from "@/components/VoidSaleButton";

const FILTERS = ["all", "credit", "overrides", "voided"] as const;
type Filter = (typeof FILTERS)[number];

export default async function SalesPage({ searchParams }: PageProps<"/sales">) {
  const session = await requireSessionOrRedirect();
  const params = await searchParams;
  const date =
    typeof params.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : manilaToday();
  const filter: Filter = FILTERS.includes(params.filter as Filter) ? (params.filter as Filter) : "all";

  const [start, end] = manilaDayRange(date);
  const all = await listSalesBetween(start, end);
  const rows = all.filter((s) =>
    filter === "overrides"
      ? s.override_count > 0
      : filter === "voided"
        ? s.voided_at
        : filter === "credit"
          ? s.credit_amount > 0
          : true
  );

  const valid = all.filter((s) => !s.voided_at);
  const revenue = valid.reduce((sum, s) => sum + s.total, 0);
  const onCredit = valid.reduce((sum, s) => sum + s.credit_amount, 0);
  const overrideCount = all.filter((s) => s.override_count > 0).length;
  const q = (f: string) => `/sales?date=${date}${f === "all" ? "" : `&filter=${f}`}`;
  // Voiding is owner-only, and a receipt with credit already paid against it
  // has to be settled with the customer first (see processVoid).
  const canVoid = session.role === "owner";
  const isVoidable = (s: (typeof rows)[number]) => canVoid && !s.voided_at && s.credit_paid <= 0.004;

  return (
    <>
      <PageHeader
        title="Transactions"
        subtitle={`All sales for ${formatDate(date)}. Open a receipt number to see its details.`}
        actions={
          <form className="flex items-center gap-2">
            <label htmlFor="date" className="text-sm text-muted">
              Date
            </label>
            <input id="date" type="date" name="date" defaultValue={date} className={`${inputCls} w-auto`} />
            <button className={btnSecondary}>Show</button>
          </form>
        }
      />

      <div className="stagger mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total sales" value={formatCurrency(revenue)} hint={`${valid.length} completed sales`} />
        <Stat label="Sold on credit" value={formatCurrency(onCredit)} hint="Not yet paid — added to customer balances" />
        <Stat
          label="Sales with price changes"
          value={String(overrideCount)}
          hint="At least one item sold at other than SRP"
          tone={overrideCount ? "warn" : "default"}
        />
        <Stat label="Voided sales" value={String(all.length - valid.length)} />
      </div>

      <Tabs
        active={filter}
        tabs={[
          { key: "all", label: "All sales", href: q("all") },
          { key: "credit", label: "On credit", href: q("credit") },
          { key: "overrides", label: "Price changes", href: q("overrides") },
          { key: "voided", label: "Voided", href: q("voided") },
        ]}
      />

      <Card>
        {rows.length === 0 ? (
          <EmptyState>No sales to show for this date and filter.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Receipt no.</th>
                <th>Time</th>
                <th>Cashier</th>
                <th>Customer</th>
                <th className="text-right">Items</th>
                <th>Payment</th>
                <th className="text-right">Total</th>
                <th>Notes</th>
                {canVoid && (
                  <th className="text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className={s.voided_at ? "text-muted" : ""}>
                  <td>
                    <Link href={`/sales/${s.id}`} className="font-medium text-brand hover:underline">
                      {s.receipt_no}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap">{formatTime(s.created_at)}</td>
                  <td>{s.cashier_name}</td>
                  <td>{s.customer_name ?? "—"}</td>
                  <td className="text-right tabular-nums">{formatQty(s.item_count)}</td>
                  <td>{s.payment_method}</td>
                  <td className={`text-right font-medium tabular-nums ${s.voided_at ? "line-through" : ""}`}>
                    {formatCurrency(s.total)}
                  </td>
                  <td className="space-x-1 whitespace-nowrap">
                    {s.credit_amount > 0 && !s.voided_at && (
                      <Badge tone={CREDIT_STATUS_LABELS[creditPaymentStatus(s.credit_amount, s.credit_paid)].tone}>
                        Credit · {CREDIT_STATUS_LABELS[creditPaymentStatus(s.credit_amount, s.credit_paid)].label}
                      </Badge>
                    )}
                    {s.override_count > 0 && <Badge tone="warn">Price changed</Badge>}
                    {s.voided_at && <Badge tone="bad">Voided</Badge>}
                  </td>
                  {canVoid && (
                    <td className="text-right">
                      {isVoidable(s) && (
                        <VoidSaleButton
                          saleId={s.id}
                          receiptNo={s.receipt_no}
                          total={formatCurrency(s.total)}
                          isCredit={s.credit_amount > 0}
                        />
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
