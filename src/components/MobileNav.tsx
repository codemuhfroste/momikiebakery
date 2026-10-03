"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useDialogFocus } from "@/lib/useDialogFocus";

// Phones and small tablets: a compact top bar with a ☰ button that slides the
// sidebar in as a drawer. The drawer's contents (links, sign out) come from
// AppShell so they stay identical to the desktop sidebar.
export default function MobileNav({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="sticky top-[var(--banner-h)] z-30 flex items-center gap-3 border-b border-white/10 bg-sidebar px-3 py-2 text-white lg:hidden print:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          className="flex h-10 w-10 items-center justify-center rounded-md transition hover:bg-white/10 active:scale-95"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent font-serif text-base font-bold text-sidebar">M</div>
        <span className="truncate text-sm font-semibold">{title}</span>
      </div>
      {open && <Drawer onClose={() => setOpen(false)}>{children}</Drawer>}
    </>
  );
}

function Drawer({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useDialogFocus(panel);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 lg:hidden print:hidden">
      <div className="absolute inset-0 animate-fade-in bg-slate-900/50" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        tabIndex={-1}
        // Any link tapped inside navigates, so close the drawer with it.
        onClick={(e) => (e.target as HTMLElement).closest("a") && onClose()}
        className="animate-drawer-in absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-sidebar px-3 py-4 text-white shadow-2xl"
      >
        <div className="mb-5 flex items-center justify-between gap-3 px-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent font-serif text-lg font-bold text-sidebar">M</div>
            <div className="leading-tight">
              <div className="text-sm font-semibold">Momikie&apos;s</div>
              <div className="text-xs text-white/55">General Merchandise</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="flex h-9 w-9 items-center justify-center rounded-md text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
