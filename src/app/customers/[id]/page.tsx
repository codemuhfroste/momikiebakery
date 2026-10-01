import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSessionOrRedirect } from "@/lib/rbac";
import { getCreditItems, getCustomer, getLedger, getOpenCreditSales } from "@/lib/queries";
import { formatCurrency, formatDate, formatDateTime, formatQty } from "@/lib/format";
import { CREDIT_STATUS_LABELS, accountStatus, creditPaymentStatus, type CreditItem } from "@/lib/types";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Stat, Tabs } from "@/components/ui";
import CustomerForm from "@/components/CustomerForm";
import CreditPaymentForm from "@/components/CreditPaymentForm";

export default async function CustomerPage({ params, searchParams }: PageProps<"/customers/[id]">) {
  const session = await requireSessionOrRedirect();
  const { id } = await params;
  const { items: itemsFilter } = await searchParams;
  const showAllItems = itemsFilter === "all";
  const customer = await getCustomer(Number(id));
  if (!customer) notFound();
  const [ledger, openSales, creditItems] = await Promise.all([
    getLedger(customer.id),
    getOpenCreditSales(customer.id),
    getCreditItems(customer.id),
  ]);

  const itemsBySale = new Map<number, CreditItem[]>();
  for (const item of creditItems) {
    itemsBySale.set(item.sale_id, [...(itemsBySale.get(item.sale_id) ?? []), item]);
  }
  // One-line summary per receipt for the payment form, e.g. "2 × Ensaymada, 1 × Sardines".
  const itemSummaries: Record<number, string> = {};
  for (const [saleId, items] of itemsBySale) {
    itemSummaries[saleId] = items.map((i) => `${formatQty(i.qty)} × ${i.name}`).join(", ");
  }

  // Items still being paid for: on receipts that aren't voided or fully paid.
  const openSaleIds = new Set(openSales.map((s) => s.id));
  const visibleItems = showAllItems ? creditItems : creditItems.filter((i) => openSaleIds.has(i.sale_id));

  // The ledger comes newest first, so each row's balance is the customer's
  // current balance minus everything that happened after it.
  const withBalance = ledger.map((e, i) => ({
    ...e,
    running: customer.balance - ledger.slice(0, i).reduce((sum, later) => sum + later.amount, 0),
  }));

  const status = accountStatus(customer);
  const available =
    customer.credit_limit == null ? null : Math.max(customer.credit_limit - customer.balance, 0);
  const itemsHref = (f: string) => `/customers/${customer.id}${f === "open" ? "" : `?items=${f}`}#items`;

  return (
    <>
      <PageHeader
        title={customer.name}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge tone={status.tone}>{status.label}</Badge>
            {customer.phone && <span>{customer.phone}</span>}
            {customer.address && <span>· {customer.address}</span>}
          </span>
        }
        back={{ href: "/customers", label: "Credit Accounts" }}
      />

      <div className="stagger mb-6 grid gap-4 sm:grid-cols-3">
        <Stat
          label="Balance owed"
          value={formatCurrency(customer.balance)}
          tone={status.tone === "bad" ? "bad" : customer.balance > 0.004 ? "warn" : "default"}
          hint={`${openSales.length} unpaid receipt${openSales.length === 1 ? "" : "s"}`}
        />
        <Stat
          label="Credit limit"
          value={customer.credit_limit == null ? "No limit" : formatCurrency(customer.credit_limit)}
        />
        <Stat
          label="Available credit"
          value={available == null ? "Unlimited" : formatCurrency(available)}
          hint="How much more they can buy on credit"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader
              title="Account statement"
              description="Purchases on credit add to the balance; payments and voided sales reduce it."
            />
            {withBalance.length === 0 ? (
              <EmptyState>No credit activity yet.</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line bg-slate-50 text-left text-xs uppercase tracking-wide text-muted">
                      <th className="px-4 py-2.5 font-semibold">Date</th>
                      <th className="px-4 py-2.5 font-semibold">Description</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Charge</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Payment</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {withBalance.map((e) => {
                      const items = e.sale_id ? itemsBySale.get(e.sale_id) ?? [] : [];
                      const receiptStatus =
                        e.entry_type === "charge"
                          ? CREDIT_STATUS_LABELS[creditPaymentStatus(e.amount, e.sale_credit_paid ?? 0)]
                          : null;
                      return (
                        <tr key={e.id} className="align-top hover:bg-slate-50">
                          <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDateTime(e.created_at)}</td>
                          <td className="px-4 py-3">
                            {e.entry_type === "charge" && (
                              <>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span>Purchase on credit</span>
                                  {e.sale_id && (
                                    <Link href={`/sales/${e.sale_id}`} className="text-brand hover:underline">
                                      {e.receipt_no}
                                    </Link>
                                  )}
                                  {receiptStatus && <Badge tone={receiptStatus.tone}>{receiptStatus.label}</Badge>}
                                </div>
                                {items.length > 0 && (
                                  <ul className="mt-1.5 space-y-0.5 text-xs text-muted">
                                    {items.map((i) => (
                                      <li key={i.item_id} className="flex justify-between gap-4">
                                        <span>
                                          {formatQty(i.qty)} × {i.name} @ {formatCurrency(i.unit_price)}
                                        </span>
                                        <span className="tabular-nums">{formatCurrency(i.line_total)}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                                {(e.sale_paid_now ?? 0) > 0 && (
                                  <div className="mt-1 text-xs text-muted">
                                    Receipt total {formatCurrency(e.sale_total ?? 0)}, paid{" "}
                                    {formatCurrency(e.sale_paid_now ?? 0)} at the counter
                                  </div>
                                )}
                              </>
                            )}
                            {e.entry_type === "payment" && (
                              <>
                                Payment received ({e.payment_method})
                                {e.applied_to && <div className="text-xs text-muted">For {e.applied_to}</div>}
                              </>
                            )}
                            {e.entry_type === "void" && (
                              <>
                                Sale voided{" "}
                                {e.sale_id && (
                                  <Link href={`/sales/${e.sale_id}`} className="text-brand hover:underline">
                                    {e.receipt_no}
                                  </Link>
                                )}
                              </>
                            )}
                            {e.note && <div className="text-xs text-muted">{e.note}</div>}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {e.amount > 0 ? formatCurrency(e.amount) : ""}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-emerald-700">
                            {e.amount < 0 ? formatCurrency(-e.amount) : ""}
                          </td>
                          <td className="px-4 py-3 text-right font-medium tabular-nums">
                            {formatCurrency(e.running)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <div id="items" className="scroll-mt-6" />
            <CardHeader
              title="Products bought on credit"
              description="Every item this customer has taken on credit."
            />
            <div className="px-4 pt-3">
              <Tabs
                active={showAllItems ? "all" : "open"}
                tabs={[
                  { key: "open", label: "Not yet fully paid", href: itemsHref("open") },
                  { key: "all", label: "All credit purchases", href: itemsHref("all") },
                ]}
              />
            </div>
            {visibleItems.length === 0 ? (
              <EmptyState>
                {showAllItems ? "No credit purchases yet." : "Nothing outstanding — every credit receipt is paid."}
              </EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line bg-slate-50 text-left text-xs uppercase tracking-wide text-muted">
                      <th className="px-4 py-2.5 font-semibold">Date</th>
                      <th className="px-4 py-2.5 font-semibold">Receipt</th>
                      <th className="px-4 py-2.5 font-semibold">Product</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Qty</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Price</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Amount</th>
                      <th className="px-4 py-2.5 font-semibold">Receipt status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {visibleItems.map((i) => {
                      const st = i.voided
                        ? { label: "Voided", tone: "neutral" as const }
                        : CREDIT_STATUS_LABELS[creditPaymentStatus(i.credit_amount, i.credit_paid)];
                      return (
                        <tr key={i.item_id} className={`hover:bg-slate-50 ${i.voided ? "text-muted" : ""}`}>
                          <td className="whitespace-nowrap px-4 py-2.5 text-muted">
                            {formatDate(i.sale_date.slice(0, 10))}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5">
                            <Link href={`/sales/${i.sale_id}`} className="text-brand hover:underline">
                              {i.receipt_no}
                            </Link>
                          </td>
                          <td className="px-4 py-2.5">{i.name}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{formatQty(i.qty)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(i.unit_price)}</td>
                          <td className={`px-4 py-2.5 text-right tabular-nums ${i.voided ? "line-through" : ""}`}>
                            {formatCurrency(i.line_total)}
                          </td>
                          <td className="px-4 py-2.5">
                            <Badge tone={st.tone}>{st.label}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Record a payment" description="Choose which receipts the customer is paying." />
            <div className="p-5">
              <CreditPaymentForm customerId={customer.id} openSales={openSales} itemSummaries={itemSummaries} />
            </div>
          </Card>
          {session.role === "owner" && (
            <Card>
              <CardHeader title="Customer details" />
              <div className="p-5">
                <CustomerForm customer={customer} />
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
