"use client";

import { useRef, useState } from "react";
import { resizeImage } from "@/lib/resizeImage";
import { productPhotoUrl } from "@/lib/types";
import { btnSecondary, hintCls, labelCls } from "./ui";

// The photo slot on the product form. Sends a hidden "photo" field with the
// product form: "" = unchanged, "remove", or the resized image as a data URL.
export default function ProductPhotoField({
  product,
}: {
  product?: { id: number; photo_version: string | null };
}) {
  const existing = product ? productPhotoUrl(product) : null;
  const [preview, setPreview] = useState<string | null>(existing);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

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
          {preview && (
            <button type="button" onClick={remove} className="block text-sm text-red-600 hover:underline">
              Remove photo
            </button>
          )}
        </div>
      </div>
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
