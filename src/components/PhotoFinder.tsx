"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { refreshAfterPhotosAction, setProductPhotoAction } from "@/app/products/actions";
import { resizeImage } from "@/lib/resizeImage";
import { CONFIDENT_MATCH } from "@/lib/productImages";
import type { ProductImageHit } from "@/lib/productImages";
import { Badge, Card, Spinner, btnPrimary, btnSecondary } from "./ui";
import ProductThumb from "./ProductThumb";

type Hit = ProductImageHit & { score: number };
type Row = {
  id: number;
  name: string;
  category: string | null;
  status: "searching" | "ready" | "saving" | "saved" | "failed";
  hits: Hit[];
  pick: number | null; // index into hits, or null = skip
  error?: string;
};

const PARALLEL = 3;

// "Find missing photos": looks up every product that has no photo in the open
// product databases, pre-picks the best match when it is confident, and saves
// the chosen ones in one go. Nothing is saved until the owner presses Save, so
// a wrong match can be swapped or skipped first.
export default function PhotoFinder({ products }: { products: { id: number; name: string; category_name: string | null }[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() =>
    products.map((p) => ({ id: p.id, name: p.name, category: p.category_name, status: "searching", hits: [], pick: null }))
  );
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  const update = (id: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  // Search a few at a time so the page fills in steadily without hammering
  // the databases.
  useEffect(() => {
    let cancelled = false;
    const queue = [...products];
    async function worker() {
      while (!cancelled && queue.length) {
        const p = queue.shift()!;
        try {
          const res = await fetch(`/api/product-images/for?name=${encodeURIComponent(p.name)}`);
          const { results = [] }: { results?: Hit[] } = await res.json();
          if (!cancelled) update(p.id, { status: "ready", hits: results, pick: results[0] && results[0].score >= CONFIDENT_MATCH ? 0 : null });
        } catch {
          if (!cancelled) update(p.id, { status: "ready", hits: [], pick: null });
        }
      }
    }
    Promise.all(Array.from({ length: PARALLEL }, worker));
    return () => {
      cancelled = true;
    };
  }, [products]);

  const searching = rows.filter((r) => r.status === "searching").length;
  const chosen = rows.filter((r) => r.pick !== null && r.status === "ready");
  const savedCount = rows.filter((r) => r.status === "saved").length;

  async function saveAll() {
    setSaving(true);
    let ok = 0;
    for (const r of chosen) {
      const hit = r.hits[r.pick!];
      update(r.id, { status: "saving" });
      try {
        const res = await fetch(hit.image);
        if (!res.ok) throw new Error();
        const blob = await res.blob();
        const dataUrl = await resizeImage(new File([blob], "photo", { type: blob.type || "image/jpeg" }));
        const result = await setProductPhotoAction(r.id, dataUrl, `photo from Open Food Facts: ${hit.name}`);
        if (result.error) throw new Error(result.error);
        update(r.id, { status: "saved" });
        ok++;
      } catch (e) {
        update(r.id, { status: "failed", error: e instanceof Error && e.message ? e.message : "Couldn't download that picture." });
      }
    }
    await refreshAfterPhotosAction();
    setDone(ok);
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Card className="sticky top-[calc(var(--banner-h)+0.75rem)] z-10 flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="text-sm">
          {searching > 0 ? (
            <span className="inline-flex items-center gap-2 text-muted">
              <Spinner /> Looking up {searching} of {rows.length} products…
            </span>
          ) : done !== null ? (
            <span className="font-medium text-emerald-700">
              Saved {done} photo{done === 1 ? "" : "s"}.{" "}
              <Link href="/products" className="text-brand underline">
                Back to Products
              </Link>
            </span>
          ) : (
            <span>
              <strong>{chosen.length}</strong> of {rows.length} products have a photo picked. Check each pick, swap or skip any that
              look wrong, then save.
            </span>
          )}
          {saving && (
            <div className="mt-2 h-1.5 w-64 overflow-hidden rounded bg-slate-100">
              <div className="h-full bg-brand transition-all" style={{ width: `${(savedCount / Math.max(1, chosen.length + savedCount)) * 100}%` }} />
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" className={btnSecondary} disabled={saving || searching > 0} onClick={() => setRows((rs) => rs.map((r) => (r.status === "ready" ? { ...r, pick: null } : r)))}>
            Skip all
          </button>
          <button type="button" className={btnPrimary} disabled={saving || searching > 0 || chosen.length === 0} onClick={saveAll}>
            {saving && <Spinner />}
            Save {chosen.length} photo{chosen.length === 1 ? "" : "s"}
          </button>
        </div>
      </Card>

      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id}>
            <Card className={`p-4 ${r.status === "saved" ? "border-emerald-300 bg-emerald-50/40" : ""}`}>
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <ProductThumb product={{ id: r.id, name: r.name, photo_version: null }} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-ink">{r.name}</div>
                  <div className="text-xs text-muted">{r.category ?? "Uncategorized"}</div>
                </div>
                {r.status === "searching" && <Spinner className="h-4 w-4 text-muted" />}
                {r.status === "ready" && r.hits.length > 0 && r.pick !== null && r.hits[r.pick].score >= CONFIDENT_MATCH && <Badge tone="good">Good match</Badge>}
                {r.status === "ready" && r.hits.length > 0 && (r.pick === null || r.hits[r.pick].score < CONFIDENT_MATCH) && (
                  <Badge tone="warn">{r.pick === null ? "No confident match — skipped" : "Check this one"}</Badge>
                )}
                {r.status === "ready" && r.hits.length === 0 && <Badge>No pictures found</Badge>}
                {r.status === "saving" && <Spinner className="h-4 w-4" />}
                {r.status === "saved" && <Badge tone="good">✓ Saved</Badge>}
                {r.status === "failed" && <Badge tone="bad">{r.error}</Badge>}
              </div>
              {r.hits.length > 0 && r.status !== "saved" && (
                <div className="flex gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label={`Photo for ${r.name}`}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={r.pick === null}
                    disabled={r.status !== "ready" || saving}
                    onClick={() => update(r.id, { pick: null })}
                    className={`grid w-24 shrink-0 place-items-center rounded-md border-2 p-1 text-xs text-muted transition ${r.pick === null ? "border-brand bg-brand-soft text-brand" : "border-line bg-white hover:border-slate-300"}`}
                  >
                    Skip
                    <span className="text-[10px]">keep placeholder</span>
                  </button>
                  {r.hits.map((h, i) => (
                    <button
                      key={h.image}
                      type="button"
                      role="radio"
                      aria-checked={r.pick === i}
                      disabled={r.status !== "ready" || saving}
                      onClick={() => update(r.id, { pick: i })}
                      title={h.brand ? `${h.name} — ${h.brand}` : h.name}
                      className={`w-28 shrink-0 rounded-md border-2 bg-white p-1 text-left transition ${r.pick === i ? "border-brand ring-2 ring-brand/20" : "border-line hover:border-slate-300"}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- remote thumbnail from the photo database */}
                      <img src={h.thumb} alt={h.name} loading="lazy" className="h-20 w-full object-contain" />
                      <span className="mt-1 line-clamp-2 block text-[11px] leading-tight text-ink">{h.name}</span>
                      {h.brand && <span className="block truncate text-[10px] text-muted">{h.brand}</span>}
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">
        Pictures come from Open Food Facts and its sister databases (CC BY-SA). Each is resized and stored with the product, like an
        uploaded photo.
      </p>
    </div>
  );
}
