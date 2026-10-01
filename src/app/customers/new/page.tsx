import { requireOwnerOrRedirect } from "@/lib/rbac";
import { Card, PageHeader } from "@/components/ui";
import CustomerForm from "@/components/CustomerForm";

export default async function NewCustomerPage() {
  await requireOwnerOrRedirect();
  return (
    <>
      <PageHeader
        title="Add credit customer"
        subtitle="Once added, this customer can be chosen at the register when paying by credit."
        back={{ href: "/customers", label: "Credit Accounts" }}
      />
      <Card className="max-w-2xl p-6">
        <CustomerForm />
      </Card>
    </>
  );
}
