"use client";

import { useSyncExternalStore } from "react";
import { btnSecondary } from "./ui";

// Paper sizes for receipts: thermal receipt printers use 58 mm or 80 mm
// rolls; "A4" is an ordinary printer. The choice is remembered on this
// device. See the .receipt-print rules in globals.css.
const PAPERS = [
  { key: "80", label: "80 mm receipt", page: "80mm auto", margin: "3mm" },
  { key: "58", label: "58 mm receipt", page: "58mm auto", margin: "2mm" },
  { key: "a4", label: "A4 / Letter", page: "auto", margin: "15mm" },
] as const;
type Paper = (typeof PAPERS)[number]["key"];
const KEY = "momikie.paper";

// The saved choice, read from localStorage (the server renders the default).
const listeners = new Set<() => void>();
function readPaper(): Paper {
  try {
    const saved = localStorage.getItem(KEY) as Paper | null;
    if (saved && PAPERS.some((p) => p.key === saved)) return saved;
  } catch {
    // storage unavailable (private mode): use the default
  }
  return "80";
}
function savePaper(v: Paper) {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export default function PrintButton({ label = "Print receipt", paper = false }: { label?: string; paper?: boolean }) {
  const size = useSyncExternalStore(subscribe, readPaper, () => "80" as Paper);

  function print() {
    if (paper) {
      const p = PAPERS.find((x) => x.key === size)!;
      document.documentElement.dataset.paper = p.key;
      let style = document.getElementById("print-page-size") as HTMLStyleElement | null;
      if (!style) {
        style = document.createElement("style");
        style.id = "print-page-size";
        document.head.appendChild(style);
      }
      style.textContent = `@page { size: ${p.page}; margin: ${p.margin}; }`;
    }
    window.print();
  }

  return (
    <span className="inline-flex items-center gap-2">
      {paper && (
        <select
          aria-label="Paper size"
          value={size}
          onChange={(e) => savePaper(e.target.value as Paper)}
          className="rounded-md border border-line bg-white px-2 py-2 text-sm"
        >
          {PAPERS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      )}
      <button type="button" className={btnSecondary} onClick={print}>
        {label}
      </button>
    </span>
  );
}
