import { requireOwnerOrRedirect } from "@/lib/rbac";
import { listProducts, listStockMovements } from "@/lib/queries";
import { formatCurrency, formatDateTime, formatQty } from "@/lib/format";
import { stockStatus } from "@/lib/types";
import { Badge, Card, EmptyState, PageHeader, Stat, Table, Tabs } from "@/components/ui";
import StockAdjustForm from "@/components/StockAdjustForm";

const REASON_LABELS: Record<string, string> = {
  sale: "Sale",
  void: "Void restock",
  restock: "Restock",
  spoilage: "Spoilage",
  correction: "Correction",
};

export default async function InventoryPage({ searchParams }: PageProps<"/inventory">) {
  await requireOwnerOrRedirect();
  const { filter: f } = await searchParams;
  const filter = f === "low" || f === "out" ? f : "all";

  const [products, movements] = await Promise.all([listProducts({ activeOnly: true }), listStockMovements(25)]);
  const low = products.filter((p) => stockStatus(p) === "low").length;
  const out = products.filter((p) => stockStatus(p) === "out").length;
  const stockValue = products.reduce((s, p) => s + p.stock_qty * p.cost, 0);
  const rows = products.filter((p) => filter === "all" || stockStatus(p) === filter);

  return (
    <>
      <PageHeader title="Inventory" subtitle="Stock levels. Every change is recorded as a stock movement." />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Stock value (at cost)" value={formatCurrency(stockValue)} />
        <Stat label="Low stock" value={String(low)} tone={low ? "warn" : "default"} />
        <Stat label="Out of stock" value={String(out)} tone={out ? "warn" : "default"} />
      </div>

      <Tabs
        active={filter}
        tabs={[
          { key: "all", label: "All", href: "/inventory" },
          { key: "low", label: "Low", href: "/inventory?filter=low" },
          { key: "out", label: "Out", href: "/inventory?filter=out" },
        ]}
      />

      <Card className="mb-8">
        {rows.length === 0 ? (
          <EmptyState>Nothing here.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th className="text-right">In stock</th>
                <th className="text-right">Reorder at</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const s = stockStatus(p);
                return (
                  <tr key={p.id}>
                    <td colSpan={5} className="!p-0">
                      <details className="group">
                        <summary className="grid cursor-pointer list-none grid-cols-[1fr_1fr_6rem_6rem_6rem] items-center px-4 py-3 hover:bg-brand-soft/40">
                          <span className="font-medium">{p.name}</span>
                          <span>{p.category_name ?? "—"}</span>
                          <span className="text-right font-medium">{formatQty(p.stock_qty)}</span>
                          <span className="text-right text-muted">{formatQty(p.reorder_level)}</span>
                          <span className="pl-4">
                            <Badge tone={s === "ok" ? "good" : s === "low" ? "warn" : "bad"}>
                              {s === "ok" ? "OK" : s === "low" ? "Low" : "Out"}
                            </Badge>
                          </span>
                        </summary>
                        <div className="border-t border-line bg-brand-soft/30 px-4">
                          <StockAdjustForm productId={p.id} />
                        </div>
                      </details>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <h2 className="mb-3 text-lg font-semibold">Recent stock movements</h2>
      <Card>
        {movements.length === 0 ? (
          <EmptyState>No movements yet.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>When</th>
                <th>Product</th>
                <th>Reason</th>
                <th className="text-right">Change</th>
                <th>By</th>
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
                  <td className={`text-right font-medium ${m.change_qty < 0 ? "text-red-600" : "text-emerald-700"}`}>
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
