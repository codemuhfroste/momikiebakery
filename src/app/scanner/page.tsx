import { requireSessionOrRedirect } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import ScannerCheck from "@/components/ScannerCheck";

export default async function ScannerPage() {
  await requireSessionOrRedirect();
  return (
    <>
      <PageHeader
        title="Scanner Check"
        subtitle="Test a barcode scanner: scan an item and see whether the system recognises it."
      />
      <ScannerCheck />
    </>
  );
}
