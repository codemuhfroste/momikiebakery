"use client";

import { useRef, type MouseEventHandler, type ReactNode } from "react";
import { useDialogFocus } from "@/lib/useDialogFocus";

// The box of a dialog: marked as a modal dialog for screen readers, and
// keeps keyboard focus inside while open (see useDialogFocus).
export default function DialogPanel({
  label,
  className,
  children,
  onMouseDown,
}: {
  label: string;
  className?: string;
  children: ReactNode;
  onMouseDown?: MouseEventHandler<HTMLDivElement>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref);
  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} onMouseDown={onMouseDown} className={`outline-none ${className ?? ""}`}>
      {children}
    </div>
  );
}
