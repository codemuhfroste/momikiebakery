"use client";

import { Fragment, useState } from "react";
import { formatQty } from "@/lib/format";
import { byNumber, byString, useSearchSort } from "@/lib/useSearchSort";
import { stockStatus, unitSuffix } from "@/lib/types";
import { Badge, GroupHeader, btnSecondary, tableCls } from "./ui";
import CategoryIcon, { categoryColor } from "./CategoryIcon";
import StockAdjustForm from "./StockAdjustForm";
import TableControls from "./TableControls";
import ProductThumb from "./ProductThumb";

export interface InventoryRow {
  id: number;
  name: string;
  category_name: string | null;
  stock_qty: number;
  reorder_level: number;
  photo_version: string | null;
  unit: string;
}

const SORT_OPTIONS = [
  { key: "name", label: "Name (A–Z)", compare: byString<InventoryRow>((p) => p.name) },
  { key: "stock_low", label: "Stock (Lowest)", compare: byNumber<InventoryRow>((p) => p.stock_qty, "asc") },
  { key: "stock_high", label: "Stock (Highest)", compare: byNumber<InventoryRow>((p) => p.stock_qty) },
];

// Stock levels in Lingkod's Secretariat layout: one card, search/sort on top,
// a section per category. "Adjust" opens the stock form under its row.
export default function InventoryTable({ rows }: { rows: InventoryRow[] }) {
  const [openId, setOpenId] = useState<number | null>(null);
  const { query, setQuery, sortKey, setSortKey, results } = useSearchSort(
    rows,
    (p) => `${p.name} ${p.category_name ?? ""}`,
    SORT_OPTIONS
  );

  // Categories in A–Z order, Uncategorized last.
  const names = [...new Set(results.map((p) => p.category_name))].sort((a, b) =>
    a === null ? 1 : b === null ? -1 : a.localeCompare(b)
  );

  return (
    <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
      <TableControls
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder="Search by product or category…"
        sortKey={sortKey}
        onSortKeyChange={setSortKey}
        sortOptions={SORT_OPTIONS}
      />
      {results.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted">No products match.</p>}

      {names.map((name) => {
        const items = results.filter((p) => p.category_name === name);
        return (
          <section key={name ?? "none"}>
            <GroupHeader
              title={name ?? "Uncategorized"}
              count={items.length}
              color={categoryColor(name)}
              icon={<CategoryIcon name={name} />}
            />
            <div className="overflow-x-auto">
              <table className={tableCls}>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="text-right">In stock</th>
                    <th className="text-right">Reorder level</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => {
                    const s = stockStatus(p);
                    const open = openId === p.id;
                    return (
                      <Fragment key={p.id}>
                        <tr className={open ? "bg-slate-50" : ""}>
                          <td className="font-medium text-ink">
                            <span className="flex items-center gap-3">
                              <ProductThumb product={p} className="h-9 w-9" textClass="text-[10px]" />
                              {p.name}
                            </span>
                          </td>
                          <td className="text-right font-medium tabular-nums">{formatQty(p.stock_qty)}{unitSuffix(p.unit)}</td>
                          <td className="text-right tabular-nums text-slate-600">{formatQty(p.reorder_level)}{unitSuffix(p.unit)}</td>
                          <td>
                            <Badge tone={s === "ok" ? "good" : s === "low" ? "warn" : "bad"}>
                              {s === "ok" ? "In stock" : s === "low" ? "Low stock" : "Out of stock"}
                            </Badge>
                          </td>
                          <td className="whitespace-nowrap text-right">
                            <button
                              type="button"
                              className={`${btnSecondary} !px-3 !py-1`}
                              onClick={() => setOpenId(open ? null : p.id)}
                            >
                              {open ? "Close" : "Adjust"}
                            </button>
                          </td>
                        </tr>
                        {open && (
                          <tr className="bg-slate-50 hover:!bg-slate-50">
                            <td colSpan={5} className="animate-slide-down">
                              <StockAdjustForm productId={p.id} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
