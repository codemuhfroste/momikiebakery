import Link from "next/link";
import { requireSessionOrRedirect } from "@/lib/rbac";
import { getCreditSummary, listCustomers } from "@/lib/queries";
import { formatCurrency, manilaDayRange, manilaToday } from "@/lib/format";
import { Card, EmptyState, PageHeader, Stat, btnPrimary } from "@/components/ui";
import CustomersTable from "@/components/CustomersTable";

export default async function CustomersPage() {
  await requireSessionOrRedirect();
  const [start, end] = manilaDayRange(manilaToday());
  const [customers, summary] = await Promise.all([listCustomers(), getCreditSummary(start, end)]);
  const overLimit = customers.filter((c) => c.credit_limit != null && c.balance > c.credit_limit + 0.004).length;

  return (
    <>
      <PageHeader
        title="Credit Accounts"
        subtitle="Customers who may buy now and pay later (utang). Each account shows what is owed, every purchase on credit, and every payment received."
        actions={
          <Link href="/customers/new" className={btnPrimary}>
            + Add customer
          </Link>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total owed to the store" value={formatCurrency(summary.receivable)} />
        <Stat label="Customers with a balance" value={String(summary.debtors)} />
        <Stat label="Payments received today" value={formatCurrency(summary.collected)} />
        <Stat label="Over their limit" value={String(overLimit)} tone={overLimit ? "bad" : "default"} />
      </div>

      <Card>
        {customers.length === 0 ? (
          <EmptyState>
            No credit customers yet. Add a customer, then choose <strong>Credit</strong> as the payment at the
            register.
          </EmptyState>
        ) : (
          <CustomersTable customers={customers} />
        )}
      </Card>
    </>
  );
}
