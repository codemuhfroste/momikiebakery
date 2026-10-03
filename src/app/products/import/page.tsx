import { requireManagerOrRedirect } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import ProductImporter from "@/components/ProductImporter";

export default async function ImportProductsPage() {
  await requireManagerOrRedirect();
  return (
    <>
      <PageHeader
        title="Import products from Excel"
        subtitle="Add or update many products at once. Download the sheet (it already lists every product), edit it in Excel or Google Sheets, then upload it here. You'll see exactly what will change before anything is saved."
        back={{ href: "/products", label: "Products" }}
      />
      <ProductImporter />
    </>
  );
}
