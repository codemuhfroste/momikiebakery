import Link from "next/link";
import type { ReactNode } from "react";

// Shared class strings so every form control and button looks the same.
export const inputCls =
  "w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink transition-[border-color,box-shadow] duration-150 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15";
export const labelCls = "mb-1.5 block text-sm font-medium text-ink";
export const hintCls = "mt-1 text-xs text-muted";
export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition duration-150 hover:bg-brand-dark hover:shadow active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100";
export const btnSecondary =
  "inline-flex items-center justify-center gap-2 rounded-md border border-line bg-white px-4 py-2 text-sm font-medium text-ink shadow-sm transition duration-150 hover:border-slate-300 hover:bg-slate-50 active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100";
export const btnDanger =
  "inline-flex items-center justify-center gap-2 rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 transition duration-150 hover:bg-red-50 active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100";

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-6 border-b border-line pb-5">
      {back && (
        <Link href={back.href} className="mb-2 inline-block text-sm text-muted hover:text-brand">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{title}</h1>
          {subtitle && <p className="mt-1 max-w-3xl text-sm text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`rounded-xl border border-line bg-surface shadow-sm ${className}`}>{children}</div>;
}

export function CardHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
      <div>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {description && <p className="text-xs text-muted">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warn" | "bad";
}) {
  const color = tone === "warn" ? "text-amber-700" : tone === "bad" ? "text-red-700" : "text-ink";
  return (
    <Card className="p-5 transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="text-sm text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </Card>
  );
}

const BADGE_TONES = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  good: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warn: "bg-amber-50 text-amber-800 ring-amber-200",
  bad: "bg-red-50 text-red-700 ring-red-200",
  info: "bg-blue-50 text-blue-800 ring-blue-200",
} as const;

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: keyof typeof BADGE_TONES;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

// A short explanatory box, for telling people what a page or field does.
export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "good"; children: ReactNode }) {
  const cls =
    tone === "warn"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : tone === "good"
        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
        : "border-blue-200 bg-blue-50 text-blue-900";
  return <div className={`animate-slide-down rounded-md border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="px-6 py-12 text-center text-sm text-muted">{children}</div>;
}

// Table building blocks, styled like Lingkod's Secretariat tables: small
// uppercase grey headings with no fill and a single rule underneath, rows
// split by hairlines. Use <Table><thead>…</thead><tbody>…</tbody></Table>.
export const tableCls =
  "w-full text-left text-sm [&_thead_tr]:border-b [&_thead_tr]:border-line [&_th]:px-4 [&_th]:py-2 [&_th]:text-xs [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-slate-500 [&_tbody]:divide-y [&_tbody]:divide-slate-100 [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-slate-50/70 [&_td]:px-4 [&_td]:py-3";

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className={tableCls}>{children}</table>
    </div>
  );
}

// The strip that opens each group in a grouped table (Lingkod's
// per-document-type header): a coloured icon badge, the group name, a count,
// and optional actions on the right.
export function GroupHeader({
  title,
  count,
  color,
  icon,
  actions,
}: {
  title: string;
  count?: number;
  color: string;
  icon: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 bg-slate-50 px-4 py-2.5">
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
        style={{ backgroundColor: `${color}22`, color }}
      >
        {icon}
      </span>
      <h3 className="font-semibold text-slate-800">{title}</h3>
      {count != null && <span className="text-xs text-slate-500">{count}</span>}
      {actions && <div className="ml-auto flex items-center gap-3">{actions}</div>}
    </div>
  );
}

// Filter tabs rendered as links (state lives in the URL).
export function Tabs({
  tabs,
  active,
}: {
  tabs: { href: string; label: string; key: string }[];
  active: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-1 border-b border-line">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors duration-200 ${
            t.key === active ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

// Small spinning circle for buttons that are busy ("Processing…").
export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
