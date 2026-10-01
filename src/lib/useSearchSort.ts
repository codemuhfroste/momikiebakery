"use client";

import { useState } from "react";

export interface SortOption<T> {
  key: string;
  label: string;
  compare: (a: T, b: T) => number;
}

// Search + sort entirely client-side against an already-fetched list: even a
// few thousand rows is trivial to filter and sort in the browser.
export function useSearchSort<T>(
  items: T[],
  searchableText: (item: T) => string,
  sortOptions: SortOption<T>[]
) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState(sortOptions[0]?.key ?? "");

  const q = query.trim().toLowerCase();
  const filtered = q ? items.filter((item) => searchableText(item).toLowerCase().includes(q)) : items;
  const option = sortOptions.find((o) => o.key === sortKey);
  const results = option ? [...filtered].sort(option.compare) : filtered;

  return { query, setQuery, sortKey, setSortKey, results };
}

export function byString<T>(getValue: (item: T) => string): (a: T, b: T) => number {
  return (a, b) => getValue(a).localeCompare(getValue(b));
}

export function byNumber<T>(
  getValue: (item: T) => number,
  direction: "asc" | "desc" = "desc"
): (a: T, b: T) => number {
  return (a, b) => (direction === "asc" ? getValue(a) - getValue(b) : getValue(b) - getValue(a));
}
