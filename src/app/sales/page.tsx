import Link from "next/link";
import { requireSessionOrRedirect } from "@/lib/rbac";
import { listSalesBetween } from "@/lib/queries";
import { formatCurrency, formatQty, formatTime, manilaDayRange, manilaToday } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader, Stat, Table, Tabs, btnSecondary, inputCls } from "@/components/ui";

export default async function SalesPage({ searchParams }: PageProps<"/sales">) {
  await requireSessionOrRedirect();
  const params = await searchParams;
  const date = typeof params.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : manilaToday();
  const filter = params.filter === "overrides" || params.filter === "voided" ? params.filter : "all";

  const [start, end] = manilaDayRange(date);
  const all = await listSalesBetween(start, end);
  const rows = all.filter((s) =>
    filter === "overrides" ? s.override_count > 0 : filter === "voided" ? s.voided_at : true
  );

  const valid = all.filter((s) => !s.voided_at);
  const revenue = valid.reduce((sum, s) => sum + s.total, 0);
  const overrideCount = all.filter((s) => s.override_count > 0).length;
  const q = (f: string) => `/sales?date=${date}${f === "all" ? "" : `&filter=${f}`}`;

  return (
    <>
      <PageHeader
        title="Transaction History"
        subtitle="Every sale, with price overrides and voids flagged."
        actions={
          <form className="flex items-center gap-2">
            <input type="date" name="date" defaultValue={date} className={`${inputCls} w-auto`} />
            <button className={btnSecondary}>Go</button>
          </form>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Sales" value={formatCurrency(revenue)} hint={`${valid.length} transactions`} />
        <Stat label="Price overrides" value={String(overrideCount)} hint="Sales with a price ≠ SRP" tone={overrideCount ? "warn" : "default"} />
        <Stat label="Voided" value={String(all.length - valid.length)} />
      </div>

      <Tabs
        active={filter}
        tabs={[
          { key: "all", label: "All", href: q("all") },
          { key: "overrides", label: "Price overrides", href: q("overrides") },
          { key: "voided", label: "Voided", href: q("voided") },
        ]}
      />

      <Card>
        {rows.length === 0 ? (
          <EmptyState>No transactions for this view.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Receipt</th>
                <th>Time</th>
                <th>Cashier</th>
                <th>Items</th>
                <th>Payment</th>
                <th className="text-right">Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className={s.voided_at ? "opacity-60" : ""}>
                  <td>
                    <Link href={`/sales/${s.id}`} className="font-medium text-brand hover:underline">
                      {s.receipt_no}
                    </Link>
                  </td>
                  <td>{formatTime(s.created_at)}</td>
                  <td>{s.cashier_name}</td>
                  <td>{formatQty(s.item_count)}</td>
                  <td>{s.payment_method}</td>
                  <td className={`text-right font-medium ${s.voided_at ? "line-through" : ""}`}>
                    {formatCurrency(s.total)}
                  </td>
                  <td className="space-x-1 text-right">
                    {s.override_count > 0 && <Badge tone="warn">Price override</Badge>}
                    {s.voided_at && <Badge tone="bad">Voided</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
