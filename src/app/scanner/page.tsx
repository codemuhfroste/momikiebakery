import { requireSessionOrRedirect } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import ScannerCheck from "@/components/ScannerCheck";

export default async function ScannerPage() {
  await requireSessionOrRedirect();
  return (
    <>
      <PageHeader
        title="Scanner Check"
        subtitle="Use this page to test a barcode scanner. Scan any item; the result shows whether the system recognises it."
      />
      <ScannerCheck />
    </>
  );
}
