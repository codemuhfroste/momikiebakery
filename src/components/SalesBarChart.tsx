"use client";

import { useEffect, useRef, useState } from "react";
import { formatCurrency } from "@/lib/format";

// Daily sales as columns: one series (so no legend — the card title names it),
// thin bars with a rounded top and a square base, hairline gridlines, clean
// peso ticks, only the best day labelled, and a hover tooltip on every bar.
// Colour #2f56c8 is the brand blue stepped into the chart lightness band
// (checked with the dataviz palette validator). The numbers are always also
// shown in a table next to the chart.

const BAR = "#2f56c8";
const PAD = { top: 22, right: 8, bottom: 26, left: 56 };
const HEIGHT = 220;

export interface DayPoint {
  day: string; // YYYY-MM-DD
  revenue: number;
  count: number;
}

function niceMax(v: number): { max: number; step: number } {
  if (v <= 0) return { max: 100, step: 25 };
  const raw = v / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  return { max: Math.ceil(v / step) * step, step };
}

const shortDay = (d: string) =>
  new Date(`${d}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" });
const longDay = (d: string) =>
  new Date(`${d}T00:00:00+08:00`).toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
const tick = (v: number) => (v >= 1000 ? `₱${(v / 1000).toLocaleString("en-PH", { maximumFractionDigits: 1 })}k` : `₱${v}`);

export default function SalesBarChart({ data, label }: { data: DayPoint[]; label: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-muted">No sales in this period.</p>;
  }

  const { max, step } = niceMax(Math.max(...data.map((d) => d.revenue)));
  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const slot = plotW / data.length;
  const barW = Math.min(24, Math.max(4, slot - 2)); // ≥2px surface gap between neighbours
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
  const best = data.reduce((b, d, i) => (d.revenue > data[b].revenue ? i : b), 0);
  // Day labels: as many as fit without colliding (~52px each).
  const every = Math.max(1, Math.ceil(52 / slot));

  const bar = (x: number, top: number, w: number, base: number) => {
    const r = Math.min(4, w / 2, base - top);
    return `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${base} Z`;
  };

  const h = hover == null ? null : data[hover];
  const hx = hover == null ? 0 : PAD.left + slot * hover + slot / 2;

  return (
    <div ref={wrap} className="relative w-full select-none" onMouseLeave={() => setHover(null)}>
      <svg width={width} height={HEIGHT} role="img" aria-label={label} className="block">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="#e7ebf1" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-slate-500 text-[11px] tabular-nums">
              {tick(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = PAD.left + slot * i + (slot - barW) / 2;
          const base = PAD.top + plotH;
          const top = Math.min(y(d.revenue), base - (d.revenue > 0 ? 1 : 0));
          return (
            <g key={d.day}>
              {d.revenue > 0 && (
                <path d={bar(x, top, barW, base)} fill={BAR} opacity={hover == null || hover === i ? 1 : 0.45} />
              )}
              {i % every === 0 && (
                <text x={PAD.left + slot * i + slot / 2} y={HEIGHT - 8} textAnchor="middle" className="fill-slate-500 text-[11px]">
                  {shortDay(d.day)}
                </text>
              )}
              {i === best && hover == null && d.revenue > 0 && (
                <text x={x + barW / 2} y={top - 6} textAnchor="middle" className="fill-slate-700 text-[11px] font-medium tabular-nums">
                  {formatCurrency(d.revenue)}
                </text>
              )}
              {/* Hit target: the whole column slot, taller and wider than the bar. */}
              <rect
                x={PAD.left + slot * i}
                y={PAD.top}
                width={slot}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                tabIndex={0}
                aria-label={`${longDay(d.day)}: ${formatCurrency(d.revenue)}, ${d.count} sales`}
              />
            </g>
          );
        })}
        <line x1={PAD.left} x2={width - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} stroke="#cbd3df" strokeWidth={1} />
      </svg>
      {h && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border border-line bg-white px-3 py-2 text-xs shadow-md"
          style={{ left: Math.min(Math.max(hx, 80), width - 80), top: Math.max(0, y(h.revenue) - 64) }}
        >
          <div className="font-medium text-ink">{longDay(h.day)}</div>
          <div className="mt-0.5 flex items-center gap-1.5 tabular-nums text-ink">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: BAR }} />
            {formatCurrency(h.revenue)}
          </div>
          <div className="text-muted">
            {h.count} sale{h.count === 1 ? "" : "s"}
          </div>
        </div>
      )}
    </div>
  );
}
