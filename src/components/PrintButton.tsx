"use client";

import { btnSecondary } from "./ui";

export default function PrintButton() {
  return (
    <button type="button" className={btnSecondary} onClick={() => window.print()}>
      Print receipt
    </button>
  );
}
