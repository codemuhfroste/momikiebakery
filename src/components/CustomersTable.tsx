"use client";

import Link from "next/link";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { byNumber, byString, useSearchSort } from "@/lib/useSearchSort";
import { accountStatus, type Customer } from "@/lib/types";
import { Badge } from "./ui";
import TableControls from "./TableControls";

const SORT_OPTIONS = [
  { key: "balance", label: "Balance (Highest)", compare: byNumber<Customer>((c) => c.balance) },
  { key: "name", label: "Name (A–Z)", compare: byString<Customer>((c) => c.name) },
  { key: "recent", label: "Recent activity", compare: byString<Customer>((c) => c.last_activity ?? "") },
];

export default function CustomersTable({ customers }: { customers: Customer[] }) {
  const { query, setQuery, sortKey, setSortKey, results } = useSearchSort(
    customers,
    (c) => `${c.name} ${c.phone ?? ""} ${c.address ?? ""}`,
    SORT_OPTIONS
  );
  // Recent-activity sort is newest first.
  const rows = sortKey === "recent" ? [...results].reverse() : results;

  return (
    <>
      <TableControls
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder="Search by name, mobile number or address…"
        sortKey={sortKey}
        onSortKeyChange={setSortKey}
        sortOptions={SORT_OPTIONS}
      />
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted">No customers match.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-slate-50 text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2.5 font-semibold">Customer</th>
                <th className="px-4 py-2.5 font-semibold">Mobile</th>
                <th className="px-4 py-2.5 text-right font-semibold">Credit limit</th>
                <th className="px-4 py-2.5 text-right font-semibold">Balance owed</th>
                <th className="px-4 py-2.5 font-semibold">Last activity</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((c) => {
                const status = accountStatus(c);
                return (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/customers/${c.id}`} className="font-medium text-brand hover:underline">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted">{c.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">
                      {c.credit_limit == null ? "No limit" : formatCurrency(c.credit_limit)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatCurrency(c.balance)}</td>
                    <td className="px-4 py-3 text-muted">{c.last_activity ? formatDateTime(c.last_activity) : "—"}</td>
                    <td className="px-4 py-3">
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
