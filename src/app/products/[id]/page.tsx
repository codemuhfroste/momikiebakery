import { notFound } from "next/navigation";
import { requireOwnerOrRedirect } from "@/lib/rbac";
import { getPriceHistory, getProduct, listCategories } from "@/lib/queries";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { Card, PageHeader, Table } from "@/components/ui";
import ProductForm from "@/components/ProductForm";

export default async function ProductPage({ params }: PageProps<"/products/[id]">) {
  await requireOwnerOrRedirect();
  const { id } = await params;
  const product = await getProduct(Number(id));
  if (!product) notFound();
  const [categories, history] = await Promise.all([listCategories(), getPriceHistory(product.id)]);

  return (
    <>
      <PageHeader title={product.name} subtitle={`Current SRP ${formatCurrency(product.srp)}`} />
      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <Card className="p-6">
          <ProductForm product={product} categories={categories} />
        </Card>
        <Card>
          <div className="border-b border-line px-4 py-3 font-semibold">SRP history</div>
          <Table>
            <thead>
              <tr>
                <th>When</th>
                <th className="text-right">Change</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>
                    {formatDateTime(h.created_at)}
                    <div className="text-xs text-muted">{h.actor_name}</div>
                  </td>
                  <td className="text-right">
                    {h.old_srp == null ? "Set to " : `${formatCurrency(h.old_srp)} → `}
                    <span className="font-medium">{formatCurrency(h.new_srp)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
