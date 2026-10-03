"use client";

import Link from "next/link";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { byNumber, byString, useSearchSort } from "@/lib/useSearchSort";
import { accountStatus, agingTone, daysSince, type Customer } from "@/lib/types";
import { Badge, tableCls } from "./ui";
import TableControls from "./TableControls";

const SORT_OPTIONS = [
  { key: "balance", label: "Balance (Highest)", compare: byNumber<Customer>((c) => c.balance) },
  { key: "name", label: "Name (A–Z)", compare: byString<Customer>((c) => c.name) },
  { key: "recent", label: "Recent activity", compare: byString<Customer>((c) => c.last_activity ?? "") },
  // Longest-owed first; customers with nothing unpaid go last.
  { key: "aging", label: "Owed the longest", compare: byString<Customer>((c) => c.oldest_unpaid ?? "9999") },
];

export default function CustomersTable({ customers }: { customers: Customer[] }) {
  const { query, setQuery, sortKey, setSortKey, results } = useSearchSort(
    customers,
    (c) => `${c.name} ${c.phone ?? ""} ${c.address ?? ""}`,
    SORT_OPTIONS
  );
  // Recent-activity sort is newest first ("owed the longest" is already
  // oldest-first, since earlier dates sort first).
  const sorted = sortKey === "recent" ? [...results].reverse() : results;

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
      {sorted.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted">No customers match.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className={tableCls}>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Mobile</th>
                <th className="text-right">Credit limit</th>
                <th className="text-right">Balance owed</th>
                <th>Owed for</th>
                <th>Last activity</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => {
                const status = accountStatus(c);
                const aging = agingTone(daysSince(c.oldest_unpaid));
                return (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/customers/${c.id}`} className="font-medium text-brand hover:underline">
                        {c.name}
                      </Link>
                    </td>
                    <td className="text-muted">{c.phone ?? "—"}</td>
                    <td className="text-right tabular-nums text-muted">
                      {c.credit_limit == null ? "No limit" : formatCurrency(c.credit_limit)}
                    </td>
                    <td className="text-right font-semibold tabular-nums">{formatCurrency(c.balance)}</td>
                    <td>
                      {aging ? <Badge tone={aging.tone}>{aging.label}</Badge> : <span className="text-muted">—</span>}
                    </td>
                    <td className="text-muted">{c.last_activity ? formatDateTime(c.last_activity) : "—"}</td>
                    <td>
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
