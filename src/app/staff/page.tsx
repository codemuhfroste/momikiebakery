import { requireOwnerOrRedirect } from "@/lib/rbac";
import { listStaff } from "@/lib/staff";
import { PageHeader } from "@/components/ui";
import StaffManager from "@/components/StaffManager";

export default async function StaffPage() {
  await requireOwnerOrRedirect();
  const staff = await listStaff();
  return (
    <>
      <PageHeader
        title="Staff"
        subtitle="Give each staff member their own PIN, so receipts and the Audit Log show who made each sale. Deactivate someone who leaves — their past records keep their name."
      />
      <StaffManager staff={staff} />
    </>
  );
}
