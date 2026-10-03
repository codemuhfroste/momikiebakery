"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// How long the first click outside stays "armed". Click outside again within
// this window and the dialog closes; wait longer and it starts over.
const ARM_MS = 4000;

// A dialog for forms that take real typing, so a stray click must not throw
// the work away: the first click on the backdrop only warns, and the dialog
// closes on a second click within a few seconds. The close button and Esc
// are deliberate actions and close straight away.
export default function Modal({
  title,
  description,
  onClose,
  children,
  footer,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const [armed, setArmed] = useState(false);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The page behind must not scroll while the dialog is up.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => () => {
    if (armTimer.current) clearTimeout(armTimer.current);
  }, []);

  function onBackdrop() {
    if (armed) {
      onClose();
      return;
    }
    setArmed(true);
    if (armTimer.current) clearTimeout(armTimer.current);
    armTimer.current = setTimeout(() => setArmed(false), ARM_MS);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:p-6"
      onMouseDown={onBackdrop}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // Clicks inside must never reach the backdrop handler, or typing in
        // the form would arm (and then trigger) the close.
        onMouseDown={(e) => e.stopPropagation()}
        className="my-auto w-full max-w-2xl animate-scale-in rounded-lg bg-surface shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 -mt-1 rounded p-2 text-muted transition hover:bg-slate-100 hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {armed && (
          <p role="status" className="animate-slide-down border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-800">
            Click outside again to close — anything you have typed will be lost.
          </p>
        )}

        <div className="px-6 py-5">{children}</div>
        {footer && <div className="border-t border-line px-6 py-3">{footer}</div>}
      </div>
    </div>
  );
}
