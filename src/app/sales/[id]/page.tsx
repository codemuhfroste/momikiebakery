import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSessionOrRedirect } from "@/lib/rbac";
import { getSale, getSaleCreditPayments } from "@/lib/queries";
import { CREDIT_STATUS_LABELS, creditPaymentStatus } from "@/lib/types";
import { formatCurrency, formatDateTime, formatQty } from "@/lib/format";
import { Badge, Card, CardHeader, Notice, PageHeader, btnPrimary } from "@/components/ui";
import PrintButton from "@/components/PrintButton";
import VoidSaleForm from "@/components/VoidSaleForm";

export default async function SaleDetailPage({ params, searchParams }: PageProps<"/sales/[id]">) {
  const session = await requireSessionOrRedirect();
  const { id } = await params;
  const { new: isNew } = await searchParams;
  const data = await getSale(Number(id));
  if (!data) notFound();
  const { sale, items } = data;
  const isCredit = sale.credit_amount > 0;
  const creditPayments = isCredit ? await getSaleCreditPayments(sale.id) : [];
  const creditPaid = creditPayments.reduce((sum, p) => sum + p.amount, 0);
  const creditStatus = CREDIT_STATUS_LABELS[creditPaymentStatus(sale.credit_amount, creditPaid)];
  const change = isCredit ? 0 : sale.amount_tendered - sale.total;

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title={`Receipt ${sale.receipt_no}`}
          subtitle={formatDateTime(sale.created_at)}
          back={{ href: "/sales", label: "Transactions" }}
          actions={
            <>
              <PrintButton paper />
              <Link href="/pos" className={btnPrimary}>
                New sale
              </Link>
            </>
          }
        />
        {isNew && (
          <div className="mx-auto mb-5 max-w-md">
            <Notice tone="good">
              Sale completed.
              {sale.payment_method === "Cash" && change > 0 && <> Give change of <strong>{formatCurrency(change)}</strong>.</>}
              {isCredit && (
                <>
                  {" "}
                  <strong>{formatCurrency(sale.credit_amount)}</strong> was added to {sale.customer_name}&apos;s
                  account.
                </>
              )}
            </Notice>
          </div>
        )}
      </div>

      <Card className="receipt-print mx-auto max-w-md p-6 print:max-w-none print:border-0 print:shadow-none">
        <div className="text-center">
          <div className="text-base font-semibold uppercase tracking-wide">Momikie&apos;s General Merchandise</div>
          <div className="mt-1 text-xs text-muted">Receipt No. {sale.receipt_no}</div>
          <div className="text-xs text-muted">{formatDateTime(sale.created_at)}</div>
          <div className="text-xs text-muted">Cashier: {sale.cashier_name}</div>
          {sale.customer_name && <div className="text-xs text-muted">Customer: {sale.customer_name}</div>}
          {sale.voided_at && (
            <div className="mt-2">
              <Badge tone="bad">VOIDED</Badge>
            </div>
          )}
        </div>

        <div className="my-4 border-y border-dashed border-line py-3 text-sm">
          {items.map((i) => {
            const changed = Math.abs(i.unit_price - i.srp) > 0.004;
            return (
              <div key={i.id} className="py-1">
                <div className="flex justify-between gap-3">
                  <span>{i.name}</span>
                  <span className="tabular-nums">{formatCurrency(i.line_total)}</span>
                </div>
                <div className="text-xs text-muted">
                  {formatQty(i.qty)} × {formatCurrency(i.unit_price)}
                  {changed && (
                    <span className="ml-2 text-amber-700 print:hidden">(SRP {formatCurrency(i.srp)})</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <dl className="space-y-1 text-sm">
          <Row label="Subtotal" value={formatCurrency(sale.subtotal)} />
          {sale.discount > 0 && <Row label="Discount" value={`− ${formatCurrency(sale.discount)}`} />}
          <Row label="Total" value={formatCurrency(sale.total)} strong />
          {isCredit ? (
            <>
              <Row label="Paid now" value={formatCurrency(sale.amount_tendered)} />
              <Row label="Charged to account" value={formatCurrency(sale.credit_amount)} strong />
            </>
          ) : (
            <>
              <Row label={sale.payment_method} value={formatCurrency(sale.amount_tendered)} />
              {sale.payment_method === "Cash" && <Row label="Change" value={formatCurrency(change)} />}
            </>
          )}
        </dl>
        <p className="mt-5 text-center text-xs text-muted">Thank you for shopping at Momikie&apos;s!</p>
      </Card>

      {isCredit && !sale.voided_at && (
        <Card className="mx-auto mt-6 max-w-md print:hidden">
          <CardHeader
            title="Credit payment status"
            actions={<Badge tone={creditStatus.tone}>{creditStatus.label}</Badge>}
          />
          <div className="space-y-1 p-5 text-sm">
            <Row label="Charged to account" value={formatCurrency(sale.credit_amount)} />
            {creditPayments.map((p) => (
              <Row
                key={p.id}
                label={`Paid ${formatDateTime(p.created_at)} (${p.payment_method})`}
                value={`− ${formatCurrency(p.amount)}`}
              />
            ))}
            <Row label="Still owed" value={formatCurrency(sale.credit_amount - creditPaid)} strong />
            {sale.customer_id && (
              <Link href={`/customers/${sale.customer_id}`} className="mt-2 inline-block text-brand hover:underline">
                Go to {sale.customer_name}&apos;s account →
              </Link>
            )}
          </div>
        </Card>
      )}

      {sale.voided_at ? (
        <div className="mx-auto mt-4 max-w-md print:hidden">
          <Notice tone="warn">
            Voided {formatDateTime(sale.voided_at)} by {sale.voided_by}. Reason: {sale.void_reason}
          </Notice>
        </div>
      ) : creditPaid > 0.004 ? (
        <div className="mx-auto mt-4 max-w-md print:hidden">
          <Notice tone="info">
            This sale can&apos;t be voided because {formatCurrency(creditPaid)} has already been paid on it.
          </Notice>
        </div>
      ) : (
        session.role === "owner" && (
          <Card className="mx-auto mt-6 max-w-md print:hidden">
            <CardHeader
              title="Void this sale"
              description={`Cancels the sale and returns the items to stock${isCredit ? ", and removes the charge from the customer's account" : ""}.`}
            />
            <div className="p-5">
              <VoidSaleForm saleId={sale.id} />
            </div>
          </Card>
        )
      )}
    </>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "text-base font-semibold" : "text-muted"}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
