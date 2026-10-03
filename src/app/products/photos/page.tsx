import { requireManagerOrRedirect } from "@/lib/rbac";
import { listProducts } from "@/lib/queries";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import PhotoFinder from "@/components/PhotoFinder";

export default async function FindPhotosPage() {
  await requireManagerOrRedirect();
  const missing = (await listProducts({ activeOnly: true }))
    .filter((p) => !p.photo_version)
    .map((p) => ({ id: p.id, name: p.name, category_name: p.category_name }));

  return (
    <>
      <PageHeader
        title="Find missing photos"
        subtitle="Looks up a picture for every product that has none. Good matches are picked for you; check them, change or skip any that look wrong, then save."
        back={{ href: "/products", label: "Products" }}
      />
      {missing.length === 0 ? (
        <Card>
          <EmptyState>Every active product already has a photo.</EmptyState>
        </Card>
      ) : (
        <PhotoFinder products={missing} />
      )}
    </>
  );
}
