import { requireManagerOrRedirect } from "@/lib/rbac";
import { listProducts, listStockMovements } from "@/lib/queries";
import { formatCurrency, formatDateTime, formatQty } from "@/lib/format";
import { stockStatus } from "@/lib/types";
import { Card, CardHeader, EmptyState, PageHeader, Stat, Table, Tabs } from "@/components/ui";
import InventoryTable from "@/components/InventoryTable";

const REASON_LABELS: Record<string, string> = {
  sale: "Sale",
  void: "Returned (sale voided)",
  restock: "Restock",
  spoilage: "Spoilage",
  correction: "Count correction",
};

export default async function InventoryPage({ searchParams }: PageProps<"/inventory">) {
  await requireManagerOrRedirect();
  const { filter: f } = await searchParams;
  const filter = f === "low" || f === "out" ? f : "all";

  const [products, movements] = await Promise.all([listProducts({ activeOnly: true }), listStockMovements(25)]);
  const low = products.filter((p) => stockStatus(p) === "low").length;
  const out = products.filter((p) => stockStatus(p) === "out").length;
  const stockValue = products.reduce((s, p) => s + p.stock_qty * p.cost, 0);
  const rows = products.filter((p) => filter === "all" || stockStatus(p) === filter);

  return (
    <>
      <PageHeader
        title="Inventory"
        subtitle="How many of each product are on hand. Use Adjust to record a delivery, spoilage, or a count correction. Every change is listed under Stock history."
      />

      <div className="stagger mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Stock value (at cost)" value={formatCurrency(stockValue)} hint="What the items on hand cost the store" />
        <Stat label="Low stock" value={String(low)} hint="At or below the reorder level" tone={low ? "warn" : "default"} />
        <Stat label="Out of stock" value={String(out)} tone={out ? "bad" : "default"} />
      </div>

      <Tabs
        active={filter}
        tabs={[
          { key: "all", label: "All products", href: "/inventory" },
          { key: "low", label: "Low stock", href: "/inventory?filter=low" },
          { key: "out", label: "Out of stock", href: "/inventory?filter=out" },
        ]}
      />

      <Card className="mb-8">
        {rows.length === 0 ? (
          <EmptyState>No products in this list.</EmptyState>
        ) : (
          <InventoryTable
            rows={rows.map((p) => ({
              id: p.id,
              name: p.name,
              category_name: p.category_name,
              stock_qty: p.stock_qty,
              reorder_level: p.reorder_level,
            }))}
          />
        )}
      </Card>

      <Card>
        <CardHeader title="Stock history" description="The 25 most recent changes to stock, newest first." />
        {movements.length === 0 ? (
          <EmptyState>No stock changes yet.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Date &amp; time</th>
                <th>Product</th>
                <th>Reason</th>
                <th className="text-right">Quantity</th>
                <th>Done by</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id}>
                  <td>{formatDateTime(m.created_at)}</td>
                  <td>
                    {m.product_name}
                    {m.note && <div className="text-xs text-muted">{m.note}</div>}
                  </td>
                  <td>{REASON_LABELS[m.reason] ?? m.reason}</td>
                  <td className={`text-right font-medium tabular-nums ${m.change_qty < 0 ? "text-red-600" : "text-emerald-700"}`}>
                    {m.change_qty > 0 ? "+" : ""}
                    {formatQty(m.change_qty)}
                  </td>
                  <td>{m.actor_name}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
