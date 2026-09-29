import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession, requireSessionOrRedirect } from "@/lib/rbac";
import { getSale } from "@/lib/queries";
import { formatCurrency, formatDateTime, formatQty } from "@/lib/format";
import { Badge, Card, PageHeader } from "@/components/ui";
import PrintButton from "@/components/PrintButton";
import VoidSaleForm from "@/components/VoidSaleForm";

export default async function SaleDetailPage({ params, searchParams }: PageProps<"/sales/[id]">) {
  await requireSessionOrRedirect();
  const session = await getSession();
  const { id } = await params;
  const { new: isNew } = await searchParams;
  const data = await getSale(Number(id));
  if (!data) notFound();
  const { sale, items } = data;
  const change = sale.amount_tendered - sale.total;

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title={sale.receipt_no}
          subtitle={formatDateTime(sale.created_at)}
          actions={
            <>
              <Link href="/pos" className="text-sm text-brand hover:underline">
                {isNew ? "New sale →" : "Register"}
              </Link>
              <PrintButton />
            </>
          }
        />
        {isNew && (
          <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Sale completed.{sale.payment_method === "Cash" && change > 0 && ` Change due: ${formatCurrency(change)}.`}
          </p>
        )}
      </div>

      <Card className="mx-auto max-w-md p-6 print:border-0 print:shadow-none">
        <div className="text-center">
          <div className="text-lg font-semibold">Momikie&apos;s General Merchandise</div>
          <div className="text-xs text-muted">{sale.receipt_no}</div>
          <div className="text-xs text-muted">{formatDateTime(sale.created_at)}</div>
          <div className="text-xs text-muted">Cashier: {sale.cashier_name}</div>
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
                  <span>{formatCurrency(i.line_total)}</span>
                </div>
                <div className="text-xs text-muted">
                  {formatQty(i.qty)} × {formatCurrency(i.unit_price)}
                  {changed && (
                    <span className="ml-2 text-amber-700 print:hidden">
                      (SRP {formatCurrency(i.srp)})
                    </span>
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
          <Row label={sale.payment_method} value={formatCurrency(sale.amount_tendered)} />
          {sale.payment_method === "Cash" && <Row label="Change" value={formatCurrency(change)} />}
        </dl>
        <p className="mt-5 text-center text-xs text-muted">Thank you for shopping at Momikie&apos;s!</p>
      </Card>

      {sale.voided_at ? (
        <p className="mx-auto mt-4 max-w-md text-sm text-red-700 print:hidden">
          Voided {formatDateTime(sale.voided_at)} by {sale.voided_by}: {sale.void_reason}
        </p>
      ) : (
        session?.role === "owner" && (
          <div className="mx-auto mt-6 max-w-md print:hidden">
            <VoidSaleForm saleId={sale.id} />
          </div>
        )
      )}
    </>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "text-base font-semibold" : "text-muted"}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
