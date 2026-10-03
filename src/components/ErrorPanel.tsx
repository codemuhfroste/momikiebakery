import Link from "next/link";
import type { ReactNode } from "react";

// The body of the error and not-found screens: a calm explanation and clear
// ways back, instead of a bare "This page couldn't load".
export default function ErrorPanel({
  tone,
  title,
  children,
  actions,
  reference,
}: {
  tone: "error" | "missing";
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  reference?: string;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md animate-rise-in rounded-xl border border-line bg-surface p-8 text-center shadow-sm">
        <span
          className={`mx-auto grid h-14 w-14 place-items-center rounded-full ${
            tone === "error" ? "bg-amber-50 text-amber-600" : "bg-brand-soft text-brand"
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {tone === "error" ? (
              <path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
            ) : (
              <path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4M9 9l4 4M13 9l-4 4" />
            )}
          </svg>
        </span>
        <h1 className="mt-4 text-xl font-semibold text-ink">{title}</h1>
        <div className="mt-2 text-sm text-muted">{children}</div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {actions}
          <Link
            href="/pos"
            className="inline-flex items-center justify-center rounded-md border border-line bg-white px-4 py-2 text-sm font-medium text-ink shadow-sm transition hover:bg-slate-50"
          >
            Go to Register
          </Link>
        </div>
        {reference && (
          <p className="mt-6 text-xs text-slate-400">
            Reference: <span className="font-mono">{reference}</span>
          </p>
        )}
      </div>
    </div>
  );
}
