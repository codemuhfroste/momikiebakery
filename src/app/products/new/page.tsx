import { requireOwnerOrRedirect } from "@/lib/rbac";
import { listCategories } from "@/lib/queries";
import { Card, PageHeader } from "@/components/ui";
import ProductForm from "@/components/ProductForm";

export default async function NewProductPage({ searchParams }: PageProps<"/products/new">) {
  await requireOwnerOrRedirect();
  const { barcode } = await searchParams;
  const categories = await listCategories();
  return (
    <>
      <PageHeader title="Add product" />
      <Card className="max-w-2xl p-6">
        <ProductForm categories={categories} defaultBarcode={typeof barcode === "string" ? barcode : undefined} />
      </Card>
    </>
  );
}
