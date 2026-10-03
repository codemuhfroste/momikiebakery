"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/format";
import { inputCls, labelCls } from "./ui";

// Type what is actually in the drawer; shows over/short against what today's
// sales and payments say should be there. Nothing is saved — it's a counting
// aid for closing time (print the page to keep a copy).
export default function CashCount({ expected, openingFloat = 0 }: { expected: number; openingFloat?: number }) {
  const [counted, setCounted] = useState("");
  const [float, setFloat] = useState(openingFloat ? String(openingFloat) : "");
  const c = Number(counted);
  const f = Number(float) || 0;
  const should = expected + f;
  const diff = Math.round((c - should) * 100) / 100;
  const has = counted.trim() !== "" && Number.isFinite(c);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls} htmlFor="float">
            Starting cash (float)
          </label>
          <input id="float" type="number" min={0} step="0.01" value={float} onChange={(e) => setFloat(e.target.value)} placeholder="0.00" className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="counted">
            Cash counted now
          </label>
          <input id="counted" type="number" min={0} step="0.01" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="0.00" className={inputCls} />
        </div>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-muted">Should be in the drawer</span>
        <span className="font-semibold tabular-nums">{formatCurrency(should)}</span>
      </div>
      {has && (
        <div
          role="status"
          className={`animate-slide-down rounded-md border px-3 py-2 text-sm ${
            Math.abs(diff) < 0.005
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : diff > 0
                ? "border-blue-200 bg-blue-50 text-blue-900"
                : "border-red-200 bg-red-50 text-red-900"
          }`}
        >
          {Math.abs(diff) < 0.005 ? (
            <>✓ Drawer matches exactly.</>
          ) : diff > 0 ? (
            <>
              Over by <strong className="tabular-nums">{formatCurrency(diff)}</strong>.
            </>
          ) : (
            <>
              Short by <strong className="tabular-nums">{formatCurrency(-diff)}</strong>.
            </>
          )}
        </div>
      )}
    </div>
  );
}
