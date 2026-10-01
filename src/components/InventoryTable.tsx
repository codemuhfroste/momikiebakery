"use client";

import { Fragment, useState } from "react";
import { formatQty } from "@/lib/format";
import { byNumber, byString, useSearchSort } from "@/lib/useSearchSort";
import { stockStatus } from "@/lib/types";
import { Badge, btnSecondary } from "./ui";
import StockAdjustForm from "./StockAdjustForm";
import TableControls from "./TableControls";

export interface InventoryRow {
  id: number;
  name: string;
  category_name: string | null;
  stock_qty: number;
  reorder_level: number;
}

const SORT_OPTIONS = [
  { key: "name", label: "Name (A–Z)", compare: byString<InventoryRow>((p) => p.name) },
  { key: "stock_low", label: "Stock (Lowest)", compare: byNumber<InventoryRow>((p) => p.stock_qty, "asc") },
  { key: "stock_high", label: "Stock (Highest)", compare: byNumber<InventoryRow>((p) => p.stock_qty) },
  { key: "category", label: "Category", compare: byString<InventoryRow>((p) => p.category_name ?? "~") },
];

export default function InventoryTable({ rows }: { rows: InventoryRow[] }) {
  const [openId, setOpenId] = useState<number | null>(null);
  const { query, setQuery, sortKey, setSortKey, results } = useSearchSort(
    rows,
    (p) => `${p.name} ${p.category_name ?? ""}`,
    SORT_OPTIONS
  );

  return (
    <>
      <TableControls
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder="Search by product or category…"
        sortKey={sortKey}
        onSortKeyChange={setSortKey}
        sortOptions={SORT_OPTIONS}
      />
      {results.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted">No products match.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-slate-50 text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2.5 font-semibold">Product</th>
                <th className="px-4 py-2.5 font-semibold">Category</th>
                <th className="px-4 py-2.5 text-right font-semibold">In stock</th>
                <th className="px-4 py-2.5 text-right font-semibold">Reorder level</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {results.map((p) => {
                const s = stockStatus(p);
                const open = openId === p.id;
                return (
                  <Fragment key={p.id}>
                    <tr className={`transition-colors hover:bg-slate-50 ${open ? "bg-slate-50" : ""}`}>
                      <td className="px-4 py-3 font-medium text-ink">{p.name}</td>
                      <td className="px-4 py-3 text-muted">{p.category_name ?? "—"}</td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">{formatQty(p.stock_qty)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted">{formatQty(p.reorder_level)}</td>
                      <td className="px-4 py-3">
                        <Badge tone={s === "ok" ? "good" : s === "low" ? "warn" : "bad"}>
                          {s === "ok" ? "In stock" : s === "low" ? "Low stock" : "Out of stock"}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
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
                      <tr className="bg-slate-50">
                        <td colSpan={6} className="animate-slide-down px-4">
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
      )}
    </>
  );
}
