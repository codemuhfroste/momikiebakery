"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { MIN_BARCODE_LENGTH, SCAN_KEY_GAP_MS, SCAN_TERMINATORS } from "@/lib/barcode";

// Scanner and receipt-printer indicators in the sidebar.
//
// A browser can't see which devices are plugged in, so the scanner shows as
// working once it has scanned something (a fast burst of keys ending in
// Enter, from any page), with the time of the last scan; this browser
// remembers it. The Bluetooth receipt printer is driven by the tablet app —
// the app's sidebar shows whether it's connected.
const KEY = "momikie-last-scan";
const listeners = new Set<() => void>();

const RECENT_MS = 30 * 60_000;

// The last scan, if it was within the last half hour (else null).
function readRecentScan(): number | null {
  try {
    const v = Number(localStorage.getItem(KEY));
    return Number.isFinite(v) && v > 0 && Date.now() - v < RECENT_MS ? v : null;
  } catch {
    return null;
  }
}

function markScan() {
  try {
    localStorage.setItem(KEY, String(Date.now()));
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  // Re-render each minute so "last scan" stays honest, and pick up scans
  // from other tabs.
  const t = setInterval(l, 60_000);
  window.addEventListener("storage", l);
  return () => {
    listeners.delete(l);
    clearInterval(t);
    window.removeEventListener("storage", l);
  };
}

export default function DeviceStatus() {
  const lastScan = useSyncExternalStore(subscribe, readRecentScan, () => null);
  const buffer = useRef("");
  const lastKey = useRef(0);

  // Watches every keystroke on the page (without interfering) for a scan.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const now = Date.now();
      if (now - lastKey.current > SCAN_KEY_GAP_MS) buffer.current = "";
      lastKey.current = now;
      if (SCAN_TERMINATORS.includes(e.key)) {
        if (buffer.current.length >= MIN_BARCODE_LENGTH) markScan();
        buffer.current = "";
      } else if (e.key.length === 1) {
        buffer.current += e.key;
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const recent = lastScan != null;
  const time = lastScan ? new Date(lastScan).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }) : "";

  return (
    <div className="mt-4 space-y-1 px-3 text-xs font-medium">
      <div
        className={`flex items-center gap-2 ${recent ? "text-emerald-300" : "text-amber-300"}`}
        title={
          recent
            ? `The barcode scanner last scanned at ${time}.`
            : "Plug in (or pair) the barcode scanner and scan any barcode — this turns green when it works."
        }
      >
        <Icon d="M4 7V5h3M17 5h3v2M20 17v2h-3M7 19H4v-2M7 9v6M10 9v6M14 9v6M17 9v6" />
        {recent ? `Scanner working · ${time}` : "Scanner: scan a barcode to check"}
      </div>
      <div
        className="flex items-center gap-2 text-white/55"
        title="The Bluetooth receipt printer is connected to the tablet and prints from the Momikie's POS app. Its sidebar shows whether the printer is connected."
      >
        <Icon d="M7 8V4h10v4M7 17H5a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2M7 14h10v6H7z" />
        Receipt printer: on the tablet app
      </div>
    </div>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
