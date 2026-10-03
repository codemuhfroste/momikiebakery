"use client";

import { useEffect, useRef, useState } from "react";
import { resizeImage } from "@/lib/resizeImage";
import { productPhotoUrl } from "@/lib/types";
import type { ProductImageHit } from "@/app/api/product-images/route";
import { Spinner, btnSecondary, hintCls, inputCls, labelCls } from "./ui";

const MIN_QUERY = 3;
const DEBOUNCE_MS = 450;

// The photo slot on the product form. Sends a hidden "photo" field with the
// product form: "" = unchanged, "remove", or the resized image as a data URL.
//
// Typing a product name also searches the open product databases and offers
// matching pictures, so most items can be given a photo without hunting for
// one. Suggestions only appear while the slot is still empty.
export default function ProductPhotoField({
  product,
  productName = "",
}: {
  product?: { id: number; photo_version: string | null };
  productName?: string;
}) {
  const existing = product ? productPhotoUrl(product) : null;
  const [preview, setPreview] = useState<string | null>(existing);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const [suggestions, setSuggestions] = useState<ProductImageHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  // null while the strip is only following the product name. "Search image"
  // sets it, which both opens the strip and lets the term be edited - useful
  // when the catalogue name ("C2 GREEN TEA 500ML PET") is not what the
  // databases call the thing.
  const [manualQuery, setManualQuery] = useState<string | null>(null);

  const query = (manualQuery ?? productName).trim();
  // Suggestions follow the name while the slot is still empty; once a picture
  // is chosen, or the strip is closed, only the button brings them back.
  const wantSuggestions =
    manualQuery !== null || (!dismissed && !preview && query.length >= MIN_QUERY);

  useEffect(() => {
    if (!wantSuggestions) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/product-images?q=${encodeURIComponent(query)}`);
        const data: { results?: ProductImageHit[] } = await res.json();
        if (!cancelled) setSuggestions(data.results ?? []);
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [wantSuggestions, query]);

  async function choose(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const dataUrl = await resizeImage(file);
      setPreview(dataUrl);
      setValue(dataUrl);
    } catch {
      setError("Couldn't read that picture. Try a JPG or PNG.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  // A suggested picture goes through the same resize as an uploaded one, so
  // what gets stored is a small local copy, not a link to someone else's site.
  async function pick(hit: ProductImageHit) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(hit.image);
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      const dataUrl = await resizeImage(new File([blob], "photo", { type: blob.type || "image/jpeg" }));
      setPreview(dataUrl);
      setValue(dataUrl);
    } catch {
      setError("Couldn't use that picture. Try another one, or upload your own.");
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    setPreview(null);
    setValue(existing ? "remove" : "");
  }

  return (
    <div>
      <span className={labelCls}>Photo</span>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="group relative grid h-28 w-28 shrink-0 place-items-center overflow-hidden rounded-lg border-2 border-dashed border-line bg-slate-50 text-muted transition hover:border-brand hover:text-brand"
          aria-label={preview ? "Change photo" : "Add photo"}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local preview / data URL
            <img src={preview} alt="Product photo" className="h-full w-full object-cover" />
          ) : (
            <span className="flex flex-col items-center gap-1 text-xs">
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 7h3l2-3h6l2 3h3v13H4z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              {busy ? "Processing…" : "Add photo"}
            </span>
          )}
        </button>
        <div className="space-y-2">
          <button type="button" className={btnSecondary} onClick={() => input.current?.click()} disabled={busy}>
            {preview ? "Change photo" : "Upload photo"}
          </button>
          <button
            type="button"
            className={btnSecondary}
            onClick={() => {
              setDismissed(false);
              setManualQuery(productName.trim());
            }}
            disabled={busy}
          >
            Search image
          </button>
          {preview && (
            <button type="button" onClick={remove} className="block text-sm text-red-600 hover:underline">
              Remove photo
            </button>
          )}
        </div>
      </div>

      {wantSuggestions && (manualQuery !== null || searching || suggestions.length > 0) && (
        <div className="mt-3 animate-slide-down rounded-lg border border-line bg-slate-50 p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-muted">
              {searching ? (
                <span className="inline-flex items-center gap-1.5">
                  <Spinner className="h-3 w-3" />
                  Looking for pictures of &ldquo;{query}&rdquo;…
                </span>
              ) : (
                <>Pictures found for &ldquo;{query}&rdquo; — click one to use it</>
              )}
            </span>
            <button
              type="button"
              onClick={() => {
                setManualQuery(null);
                setDismissed(true);
              }}
              className="shrink-0 text-xs text-muted hover:text-ink hover:underline"
            >
              Hide
            </button>
          </div>
          {manualQuery !== null && (
            <input
              value={manualQuery}
              autoFocus
              onChange={(e) => setManualQuery(e.target.value)}
              placeholder="What to search for, e.g. C2 apple"
              aria-label="Search for a product picture"
              className={`${inputCls} mb-2`}
            />
          )}
          {!searching && suggestions.length === 0 && query.length >= MIN_QUERY && (
            <p className="text-xs text-muted">
              No pictures found. Try a shorter or more common name, or upload your own.
            </p>
          )}
          {suggestions.length > 0 && (
            <ul className="flex gap-2 overflow-x-auto pb-1">
              {suggestions.map((hit) => (
                <li key={hit.image} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => pick(hit)}
                    disabled={busy}
                    title={hit.brand ? `${hit.name} — ${hit.brand}` : hit.name}
                    className="block w-24 overflow-hidden rounded-md border border-line bg-white p-1 text-left transition hover:border-brand hover:shadow disabled:opacity-50"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- remote thumbnail, not a site asset */}
                    <img src={hit.thumb} alt={hit.name} loading="lazy" className="h-20 w-full object-contain" />
                    <span className="mt-1 block truncate text-[11px] leading-tight text-muted">{hit.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className={hintCls}>
        A clear photo helps staff find the right item at the register. On a phone you can take the picture
        directly.
      </p>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => choose(e.target.files?.[0])}
      />
      <input type="hidden" name="photo" value={value} />
    </div>
  );
}
