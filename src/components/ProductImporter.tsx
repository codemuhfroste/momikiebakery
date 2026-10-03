"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { ImportPlan } from "@/lib/productImport";
import { Badge, Card, CardHeader, Notice, Spinner, Table, btnPrimary, btnSecondary } from "./ui";

type Stage =
  | { kind: "idle" }
  | { kind: "busy"; label: string }
  | { kind: "preview"; plan: ImportPlan }
  | { kind: "done"; added: number; updated: number }
  | { kind: "error"; message: string };

const ACTION = {
  add: { label: "New", tone: "good" },
  update: { label: "Update", tone: "info" },
  same: { label: "No change", tone: "neutral" },
} as const;

// Upload → preview → confirm. The same file is sent again on confirm and the
// server re-checks it, so the preview can't drift from what gets saved.
export default function ProductImporter() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [showSame, setShowSame] = useState(false);

  async function send(f: File, mode: "preview" | "apply") {
    setStage({ kind: "busy", label: mode === "apply" ? "Saving products…" : "Reading the file…" });
    const body = new FormData();
    body.set("file", f);
    body.set("mode", mode);
    try {
      const res = await fetch("/api/products/import", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) return setStage({ kind: "error", message: data.error ?? "Something went wrong." });
      if (mode === "apply") setStage({ kind: "done", ...data.result });
      else setStage({ kind: "preview", plan: data.plan });
    } catch {
      setStage({ kind: "error", message: "Couldn't reach the server. Check the internet connection and try again." });
    }
  }

  function choose(f: File | undefined) {
    if (!f) return;
    setFile(f);
    setShowSame(false);
    send(f, "preview");
  }

  function reset() {
    setFile(null);
    setStage({ kind: "idle" });
    if (input.current) input.current.value = "";
  }

  const plan = stage.kind === "preview" ? stage.plan : null;
  const adds = plan?.changes.filter((c) => c.action === "add").length ?? 0;
  const updates = plan?.changes.filter((c) => c.action === "update").length ?? 0;
  const same = plan?.changes.filter((c) => c.action === "same").length ?? 0;
  const shown = plan?.changes.filter((c) => showSame || c.action !== "same") ?? [];

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="1. Get the sheet" description="Every current product plus empty rows for new ones, with category and Yes/No dropdowns." />
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <a href="/api/products/template" className={btnSecondary}>
            <DownloadIcon /> Download product sheet (.xlsx)
          </a>
          <span className="text-xs text-muted">Only Product name and SRP are required. Stock of existing products is not changed by imports — use Inventory for that.</span>
        </div>
      </Card>

      <Card>
        <CardHeader title="2. Upload it" description="Excel (.xlsx). From Google Sheets use File → Download → Microsoft Excel." />
        <div className="px-5 py-4">
          <label
            className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-line px-4 py-8 text-center transition hover:border-brand hover:bg-brand/5"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              choose(e.dataTransfer.files[0]);
            }}
          >
            <span className="text-sm font-medium text-ink">{file ? file.name : "Choose the Excel file or drop it here"}</span>
            <span className="text-xs text-muted">{file ? "Choose a different file to start over" : ".xlsx up to 4 MB"}</span>
            <input
              ref={input}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              aria-label="Excel file to import"
              onChange={(e) => choose(e.target.files?.[0])}
            />
          </label>
        </div>
      </Card>

      {stage.kind === "busy" && (
        <Card className="flex items-center gap-2 px-5 py-4 text-sm text-muted">
          <Spinner /> {stage.label}
        </Card>
      )}
      {stage.kind === "error" && <Notice tone="warn">{stage.message}</Notice>}
      {stage.kind === "done" && (
        <Notice tone="good">
          Saved: {stage.added} product{stage.added === 1 ? "" : "s"} added, {stage.updated} updated. Every change is in the Audit Log.{" "}
          <Link href="/products" className="font-medium underline">
            Back to Products
          </Link>{" "}
          ·{" "}
          <button type="button" onClick={reset} className="font-medium underline">
            Import another file
          </button>
        </Notice>
      )}

      {plan && file && (
        <Card>
          <CardHeader
            title="3. Check and confirm"
            description={`${adds} new · ${updates} to update · ${same} unchanged${plan.errors.length ? ` · ${plan.errors.length} row${plan.errors.length === 1 ? "" : "s"} skipped` : ""}`}
            actions={
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={reset} className={btnSecondary}>
                  Cancel
                </button>
                <button type="button" disabled={adds + updates === 0} onClick={() => send(file, "apply")} className={btnPrimary}>
                  Save {adds + updates} change{adds + updates === 1 ? "" : "s"}
                </button>
              </div>
            }
          />
          {plan.newCategories.length > 0 && (
            <div className="border-b border-line px-5 py-3 text-sm">
              New categories will be created: <span className="font-medium">{plan.newCategories.join(", ")}</span>
            </div>
          )}
          {plan.errors.length > 0 && (
            <div className="border-b border-line bg-amber-50/60 px-5 py-3 text-sm text-amber-900">
              <div className="mb-1 font-medium">These rows will be skipped — fix them in the file and upload again if needed:</div>
              <ul className="list-disc space-y-0.5 pl-5">
                {plan.errors.slice(0, 50).map((e) => (
                  <li key={e}>{e}</li>
                ))}
                {plan.errors.length > 50 && <li>…and {plan.errors.length - 50} more.</li>}
              </ul>
            </div>
          )}
          {shown.length > 0 ? (
            <Table>
              <thead>
                <tr>
                  <th className="w-16">Row</th>
                  <th>Product</th>
                  <th className="w-28">Action</th>
                  <th>What changes</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => (
                  <tr key={c.row}>
                    <td className="tabular-nums text-muted">{c.row}</td>
                    <td className="font-medium text-ink">{c.name}</td>
                    <td>
                      <Badge tone={ACTION[c.action].tone}>{ACTION[c.action].label}</Badge>
                    </td>
                    <td className="text-muted">{c.changes.join(" · ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <div className="px-5 py-6 text-center text-sm text-muted">Nothing in this file differs from what&apos;s saved.</div>
          )}
          {same > 0 && (
            <div className="border-t border-line px-5 py-2.5">
              <button type="button" onClick={() => setShowSame((s) => !s)} className="text-xs font-medium text-brand hover:underline">
                {showSame ? "Hide" : "Show"} {same} unchanged product{same === 1 ? "" : "s"}
              </button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
      <path d="M10 3v10m0 0l-4-4m4 4l4-4M4 15v1a1 1 0 001 1h10a1 1 0 001-1v-1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
