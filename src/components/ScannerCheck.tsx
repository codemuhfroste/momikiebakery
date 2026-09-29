"use client";

import { useState } from "react";
import { MIN_BARCODE_LENGTH, SCAN_KEY_GAP_MS } from "@/lib/barcode";
import { useBarcodeScanner } from "@/lib/useBarcodeScanner";
import { formatCurrency, formatTime } from "@/lib/format";
import { Badge, Card, EmptyState } from "./ui";

interface ScanResult {
  code: string;
  at: string;
  status: "matched" | "unregistered" | "error";
  name?: string;
  srp?: number;
}

// Plug in the scanner, open this page, scan anything. Each scan runs through
// the same hook and the same /api/scan lookup the real integration uses, so
// "matched" here means the register will recognise it too.
export default function ScannerCheck() {
  const [scans, setScans] = useState<ScanResult[]>([]);

  function record(result: ScanResult) {
    setScans((prev) => [result, ...prev].slice(0, 15));
  }

  useBarcodeScanner(async (code) => {
    const at = new Date().toISOString();
    try {
      const res = await fetch(`/api/scan?code=${encodeURIComponent(code)}`);
      if (res.ok) {
        const { product } = await res.json();
        record({ code, at, status: "matched", name: product.name, srp: product.srp });
      } else {
        record({ code, at, status: res.status === 404 ? "unregistered" : "error" });
      }
    } catch {
      record({ code, at, status: "error" });
    }
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <Card>
        <div className="border-b border-line px-5 py-4 font-semibold">Scans</div>
        {scans.length === 0 ? (
          <EmptyState>Waiting for a scan… click anywhere on this page (not in a text box) and scan a barcode.</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {scans.map((s, i) => (
              <li key={i} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                <div>
                  <div className="font-mono text-base">{s.code}</div>
                  <div className="text-xs text-muted">
                    {s.code.length} characters · {formatTime(s.at)}
                  </div>
                </div>
                <div className="text-right">
                  {s.status === "matched" && (
                    <>
                      <Badge tone="good">Matched</Badge>
                      <div className="mt-1">
                        {s.name} · {formatCurrency(s.srp ?? 0)}
                      </div>
                    </>
                  )}
                  {s.status === "unregistered" && <Badge tone="warn">Not registered</Badge>}
                  {s.status === "error" && <Badge tone="bad">Lookup failed</Badge>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="h-fit p-5 text-sm">
        <h2 className="mb-2 font-semibold">If nothing shows up</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-muted">
          <li>Scanner must be in keyboard mode (HID) — the default for most USB and Bluetooth scanners.</li>
          <li>It should end each scan with Enter or Tab. Check the scanner manual for the &quot;suffix&quot; setting.</li>
          <li>Scans need at least {MIN_BARCODE_LENGTH} characters, with under {SCAN_KEY_GAP_MS} ms between keys.</li>
          <li>Bluetooth scanners must be paired first, and set to HID mode.</li>
          <li>Keep the cursor out of text boxes; the register&apos;s search box handles its own scans.</li>
        </ul>
      </Card>
    </div>
  );
}
