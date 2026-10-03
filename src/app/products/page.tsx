import Link from "next/link";
import { requireManagerOrRedirect } from "@/lib/rbac";
import { listCategories, listProducts } from "@/lib/queries";
import ProductDialogButton from "@/components/ProductDialogButton";
import ProductsBoard from "@/components/ProductsBoard";
import CategoriesButton from "@/components/CategoriesButton";
import { Card, EmptyState, PageHeader, btnPrimary, btnSecondary } from "@/components/ui";

export default async function ProductsPage() {
  await requireManagerOrRedirect();
  const [products, categories] = await Promise.all([listProducts(), listCategories()]);
  const missingPhotos = products.filter((p) => p.is_active && !p.photo_version).length;

  return (
    <>
      <PageHeader
        title="Products"
        subtitle="Everything the store sells, grouped by category. SRP is the Suggested Retail Price — the normal selling price used at the register. Changes to an SRP are recorded in the Audit Log."
        actions={
          <>
            {missingPhotos > 0 && (
              <Link href="/products/photos" className={btnSecondary}>
                Find missing photos ({missingPhotos})
              </Link>
            )}
            <Link href="/products/import" className={btnSecondary}>
              Import from Excel
            </Link>
            <CategoriesButton categories={categories} className={btnSecondary} />
            <ProductDialogButton categories={categories} className={btnPrimary}>
              + Add product
            </ProductDialogButton>
          </>
        }
      />
      {products.length === 0 && categories.length === 0 ? (
        <Card>
          <EmptyState>
            No products yet. Start with <strong>Manage categories</strong> to set up groups like “Bread &amp; Pastries”
            or “Beverages”, then use <strong>Add product</strong>.
          </EmptyState>
        </Card>
      ) : (
        <ProductsBoard products={products} categories={categories} />
      )}
    </>
  );
}
