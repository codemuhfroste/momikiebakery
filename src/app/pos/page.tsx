import { requireSessionOrRedirect } from "@/lib/rbac";
import { listProducts } from "@/lib/queries";
import PosClient from "@/components/PosClient";
import { PageHeader } from "@/components/ui";

export default async function PosPage() {
  await requireSessionOrRedirect();
  const products = await listProducts({ activeOnly: true });

  return (
    <>
      <PageHeader
        title="Register"
        subtitle="Scan a barcode or tap a product. Prices default to SRP; any change is flagged and audited."
      />
      <PosClient
        products={products.map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          barcode: p.barcode,
          category_name: p.category_name,
          srp: p.srp,
          stock_qty: p.stock_qty,
        }))}
      />
    </>
  );
}
