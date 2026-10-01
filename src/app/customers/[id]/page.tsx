import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSessionOrRedirect } from "@/lib/rbac";
import { getCustomer, getLedger, getOpenCreditSales } from "@/lib/queries";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { accountStatus } from "@/lib/types";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui";
import CustomerForm from "@/components/CustomerForm";
import CreditPaymentForm from "@/components/CreditPaymentForm";

export default async function CustomerPage({ params }: PageProps<"/customers/[id]">) {
  const session = await requireSessionOrRedirect();
  const { id } = await params;
  const customer = await getCustomer(Number(id));
  if (!customer) notFound();
  const [ledger, openSales] = await Promise.all([getLedger(customer.id), getOpenCreditSales(customer.id)]);

  // The ledger comes newest first, so each row's balance is the customer's
  // current balance minus everything that happened after it.
  const withBalance = ledger.map((e, i) => ({
    ...e,
    running: customer.balance - ledger.slice(0, i).reduce((sum, later) => sum + later.amount, 0),
  }));

  const status = accountStatus(customer);
  const available =
    customer.credit_limit == null ? null : Math.max(customer.credit_limit - customer.balance, 0);

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

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat
          label="Balance owed"
          value={formatCurrency(customer.balance)}
          tone={status.tone === "bad" ? "bad" : customer.balance > 0.004 ? "warn" : "default"}
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
                  {withBalance.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDateTime(e.created_at)}</td>
                      <td className="px-4 py-3">
                        {e.entry_type === "charge" && (
                          <>
                            Purchase on credit{" "}
                            {e.sale_id && (
                              <Link href={`/sales/${e.sale_id}`} className="text-brand hover:underline">
                                {e.receipt_no}
                              </Link>
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
                      <td className="px-4 py-3 text-right font-medium tabular-nums">{formatCurrency(e.running)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Record a payment" description="Choose which receipts the customer is paying." />
            <div className="p-5">
              <CreditPaymentForm customerId={customer.id} openSales={openSales} />
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
