import Link from "next/link";
import { requireOwnerOrRedirect } from "@/lib/rbac";
import { listProducts } from "@/lib/queries";
import { formatCurrency } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader, Table, btnPrimary } from "@/components/ui";

export default async function ProductsPage() {
  await requireOwnerOrRedirect();
  const products = await listProducts();

  return (
    <>
      <PageHeader
        title="Products"
        subtitle="Everything the store sells. SRP is the Suggested Retail Price — the normal selling price used at the register. Changes to an SRP are recorded in the Audit Log."
        actions={
          <Link href="/products/new" className={btnPrimary}>
            + Add product
          </Link>
        }
      />
      <Card>
        {products.length === 0 ? (
          <EmptyState>No products yet. Use “Add product” to create the first one.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Barcode</th>
                <th>Category</th>
                <th className="text-right">Cost</th>
                <th className="text-right">SRP (selling price)</th>
                <th className="text-right">Profit margin</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className={p.is_active ? "" : "opacity-50"}>
                  <td>
                    <Link href={`/products/${p.id}`} className="font-medium text-brand hover:underline">
                      {p.name}
                    </Link>
                    {p.sku && <div className="text-xs text-muted">{p.sku}</div>}
                  </td>
                  <td className="font-mono text-xs">{p.barcode ?? "—"}</td>
                  <td>{p.category_name ?? "—"}</td>
                  <td className="text-right tabular-nums">{formatCurrency(p.cost)}</td>
                  <td className="text-right font-medium tabular-nums">{formatCurrency(p.srp)}</td>
                  <td className="text-right tabular-nums text-muted">
                    {p.srp > 0 ? `${(((p.srp - p.cost) / p.srp) * 100).toFixed(0)}%` : "—"}
                  </td>
                  <td className="text-right">{!p.is_active && <Badge>Inactive</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
