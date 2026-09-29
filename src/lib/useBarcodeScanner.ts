"use client";

import { useEffect, useRef } from "react";
import { MIN_BARCODE_LENGTH, SCAN_KEY_GAP_MS, SCAN_TERMINATORS, normalizeBarcode } from "./barcode";

// Listens for keyboard-wedge barcode scanners anywhere on the page: a scan is
// a burst of keystrokes (each < SCAN_KEY_GAP_MS apart) ending in Enter. Human
// typing is slower, so it's ignored and text inputs still work normally.
// Keystrokes aimed at a text field are left to that field (it handles its own
// Enter), so a scan is never processed twice.
//
// This is the single entry point for scans. A future camera or vendor-API
// scanner should just call the same `onScan(code)`.
export function useBarcodeScanner(onScan: (code: string) => void) {
  const handler = useRef(onScan);
  useEffect(() => {
    handler.current = onScan;
  });

  useEffect(() => {
    let buffer = "";
    let last = 0;

    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) {
        buffer = "";
        return;
      }
      const now = Date.now();
      if (now - last > SCAN_KEY_GAP_MS) buffer = "";
      last = now;

      if (SCAN_TERMINATORS.includes(e.key)) {
        const code = normalizeBarcode(buffer);
        buffer = "";
        if (code.length >= MIN_BARCODE_LENGTH) {
          e.preventDefault();
          handler.current(code);
        }
        return;
      }
      if (e.key.length === 1) buffer += e.key;
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
