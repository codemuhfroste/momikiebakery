import Link from "next/link";
import ErrorPanel from "@/components/ErrorPanel";
import { btnPrimary } from "@/components/ui";

// Shown for unknown addresses and for records that don't exist
// (e.g. a receipt, product or customer that was never created).
export default function NotFound() {
  return (
    <ErrorPanel
      tone="missing"
      title="We couldn't find that page"
      actions={
        <Link href="/" className={btnPrimary}>
          Go to Dashboard
        </Link>
      }
    >
      <p>The link may be mistyped, or the receipt, product or customer it points to doesn&apos;t exist.</p>
    </ErrorPanel>
  );
}
