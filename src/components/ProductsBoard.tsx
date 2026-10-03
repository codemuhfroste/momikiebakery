"use client";

import { formatCurrency } from "@/lib/format";
import { byNumber, byString, useSearchSort } from "@/lib/useSearchSort";
import type { Category, Product } from "@/lib/types";
import { Badge, GroupHeader, tableCls } from "./ui";
import CategoryIcon, { categoryColor } from "./CategoryIcon";
import ProductDialogButton from "./ProductDialogButton";
import ProductThumb from "./ProductThumb";
import TableControls from "./TableControls";

const margin = (p: Product) => (p.srp > 0 ? (p.srp - p.cost) / p.srp : 0);

const SORT_OPTIONS = [
  { key: "name", label: "Name (A–Z)", compare: byString<Product>((p) => p.name) },
  { key: "srp_high", label: "SRP (Highest)", compare: byNumber<Product>((p) => p.srp) },
  { key: "srp_low", label: "SRP (Lowest)", compare: byNumber<Product>((p) => p.srp, "asc") },
  { key: "margin", label: "Profit margin (Highest)", compare: byNumber<Product>(margin) },
  { key: "newest", label: "Recently added", compare: byNumber<Product>((p) => p.id) },
];

// The Products list in Lingkod's Secretariat layout: one card, search/sort on
// top, then a section per category with its own coloured header.
export default function ProductsBoard({ products, categories }: { products: Product[]; categories: Category[] }) {
  const { query, setQuery, sortKey, setSortKey, results } = useSearchSort(
    products,
    (p) => `${p.name} ${p.sku ?? ""} ${p.barcode ?? ""} ${p.category_name ?? ""}`,
    SORT_OPTIONS
  );
  const searching = query.trim() !== "";

  const groups: { key: string; name: string | null; items: Product[] }[] = [
    ...categories.map((c) => ({ key: `c${c.id}`, name: c.name, items: results.filter((p) => p.category_id === c.id) })),
    { key: "none", name: null, items: results.filter((p) => p.category_id == null) },
  ].filter((g) => (searching ? g.items.length > 0 : g.name !== null || g.items.length > 0));

  return (
    <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
      <TableControls
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder="Search by name, barcode, SKU or category…"
        sortKey={sortKey}
        onSortKeyChange={setSortKey}
        sortOptions={SORT_OPTIONS}
      />

      {searching && groups.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-muted">No products match “{query.trim()}”.</p>
      )}

      {groups.map((g) => (
        <section key={g.key}>
          <GroupHeader
            title={g.name ?? "Uncategorized"}
            count={g.items.length}
            color={categoryColor(g.name)}
            icon={<CategoryIcon name={g.name} />}
          />
          {g.items.length === 0 ? (
            <p className="px-4 py-5 text-center text-sm text-muted">No products in {g.name} yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className={tableCls}>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Barcode</th>
                    <th className="text-right">Cost</th>
                    <th className="text-right">SRP</th>
                    <th className="text-right">Margin</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((p) => (
                    <tr key={p.id} className={p.is_active ? "" : "text-muted"}>
                      <td>
                        <div className="flex items-center gap-3">
                          <ProductThumb product={p} />
                          <div className="min-w-0">
                            <div className="font-medium text-ink">{p.name}</div>
                            {p.sku && <div className="text-xs text-muted">{p.sku}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="font-mono text-xs tabular-nums text-slate-600">{p.barcode ?? "—"}</td>
                      <td className="text-right tabular-nums text-slate-600">{formatCurrency(p.cost)}</td>
                      <td className="text-right font-medium tabular-nums">{formatCurrency(p.srp)}</td>
                      <td className="text-right tabular-nums text-slate-600">
                        {p.srp > 0 ? `${(margin(p) * 100).toFixed(0)}%` : "—"}
                      </td>
                      <td>{p.is_active ? <Badge tone="good">Active</Badge> : <Badge>Inactive</Badge>}</td>
                      <td className="whitespace-nowrap text-right">
                        <ProductDialogButton
                          categories={categories}
                          product={p}
                          className="text-sm font-medium text-brand hover:underline"
                        >
                          Edit
                        </ProductDialogButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
