"use client";

import { inputCls } from "./ui";

export interface SortOptionMeta {
  key: string;
  label: string;
}

// Search box + sort dropdown that sits on top of a table card.
export default function TableControls({
  query,
  onQueryChange,
  searchPlaceholder = "Search…",
  sortKey,
  onSortKeyChange,
  sortOptions,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  searchPlaceholder?: string;
  sortKey: string;
  onSortKeyChange: (value: string) => void;
  sortOptions: SortOptionMeta[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line bg-white px-4 py-3">
      <div className="relative min-w-[160px] flex-1">
        <svg
          viewBox="0 0 24 24"
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={searchPlaceholder}
          className={`${inputCls} pl-8`}
        />
      </div>
      <select
        value={sortKey}
        onChange={(e) => onSortKeyChange(e.target.value)}
        className={`${inputCls} w-auto shrink-0`}
      >
        {sortOptions.map((o) => (
          <option key={o.key} value={o.key}>
            Sort: {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
