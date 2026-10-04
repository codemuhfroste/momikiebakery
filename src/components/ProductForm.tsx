"use client";

import { useActionState, useState } from "react";
import { createProductAction, updateProductAction } from "@/app/products/actions";
import type { ActionState } from "@/lib/actionState";
import type { Category, Product } from "@/lib/types";
import { Spinner, btnPrimary, hintCls, inputCls, labelCls } from "./ui";
import ProductPhotoField from "./ProductPhotoField";

export default function ProductForm({
  product,
  categories,
  defaultBarcode,
  onSaved,
}: {
  product?: Product;
  defaultBarcode?: string;
  categories: Category[];
  // Set when the form is shown in a dialog: suppresses the redirect that the
  // standalone page relies on, and reports success so the dialog can close.
  onSaved?: () => void;
}) {
  const [state, action, pending] = useActionState(async (prev: ActionState, fd: FormData) => {
    const result = await (product ? updateProductAction : createProductAction)(prev, fd);
    if (result?.ok) onSaved?.();
    return result;
  }, {} as ActionState);
  // Held here rather than in the input alone, so the photo field can offer
  // pictures matching whatever is being typed.
  const [name, setName] = useState(product?.name ?? "");
  // "__new" shows a box for typing a new category, created when the product
  // is saved (see categoryFor in lib/products.ts).
  const [categoryChoice, setCategoryChoice] = useState(String(product?.category_id ?? ""));
  // "kg": sold by weight — prices and stock are then per kg.
  const [unit, setUnit] = useState(product?.unit === "kg" ? "kg" : "piece");

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {product && <input type="hidden" name="id" value={product.id} />}
      {onSaved && <input type="hidden" name="no_redirect" value="1" />}

      <div className="sm:col-span-2">
        <ProductPhotoField product={product} productName={name} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>Product name</label>
        <input
          name="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Barcode</label>
        <input
          name="barcode"
          defaultValue={product?.barcode ?? defaultBarcode ?? ""}
          placeholder="Scan or type"
          onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
          className={inputCls}
        />
        <p className={hintCls}>Click here and scan the product, or leave blank.</p>
      </div>
      <div>
        <label className={labelCls}>SKU / item code (optional)</label>
        <input name="sku" defaultValue={product?.sku ?? ""} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Category</label>
        <select
          name="category_id"
          value={categoryChoice}
          onChange={(e) => setCategoryChoice(e.target.value)}
          className={inputCls}
        >
          <option value="">Uncategorized</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="__new">+ New category…</option>
        </select>
        {categoryChoice === "__new" && (
          <input
            name="new_category"
            required
            autoFocus
            maxLength={40}
            placeholder="New category name, e.g. Frozen Goods"
            aria-label="New category name"
            className={`${inputCls} mt-2 animate-slide-down`}
          />
        )}
      </div>
      <div>
        <label className={labelCls} htmlFor="unit">Sold by</label>
        <select
          id="unit"
          name="unit"
          value={unit}
          onChange={(e) => setUnit(e.target.value === "kg" ? "kg" : "piece")}
          className={inputCls}
        >
          <option value="piece">Piece (count) — bread, drinks, calamansi by the piece…</option>
          <option value="kg">Weight (kg) — vegetables, meat, rice…</option>
        </select>
        <p className={hintCls}>
          {unit === "kg"
            ? "The Register asks for the weight (or a peso amount) each time. SRP and cost are per kg, and stock is counted in kg."
            : "Sold by count. Choose Weight (kg) for things weighed on the scale."}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:col-span-2">
        <div>
          <label className={labelCls}>{unit === "kg" ? "SRP per kg (₱)" : "SRP — selling price (₱)"}</label>
          <input name="srp" type="number" step="0.01" min={0} required defaultValue={product?.srp} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>{unit === "kg" ? "Cost per kg (₱)" : "Cost per item (₱)"}</label>
          <input name="cost" type="number" step="0.01" min={0} defaultValue={product?.cost ?? 0} className={inputCls} />
        </div>
      </div>
      <fieldset className="min-w-0 rounded-lg border border-line p-4 sm:col-span-2">
        <legend className="px-1 text-sm font-medium text-ink">Wholesale (optional)</legend>
        <p className={`${hintCls} mb-3`}>
          For selling in bulk: the unit it&apos;s sold in, how many pieces it holds, and its price. Stock stays
          counted in pieces — selling 1 box of 24 takes 24 off. Leave empty if it&apos;s only sold retail.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={labelCls} htmlFor="pack_name">Sold by the</label>
            <input
              id="pack_name"
              name="pack_name"
              list="pack-names"
              maxLength={20}
              defaultValue={product?.pack_name ?? ""}
              placeholder="box, case, dozen, tray…"
              className={inputCls}
            />
            <datalist id="pack-names">
              {["box", "case", "pack", "dozen", "tray", "sack", "bundle", "ream"].map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>
          <div>
            <label className={labelCls} htmlFor="pack_size">Pieces in one</label>
            <input id="pack_size" name="pack_size" type="number" step="any" min={2} defaultValue={product?.pack_size ?? ""} placeholder="e.g. 24" className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="wholesale_price">Wholesale price (₱ each)</label>
            <input
              id="wholesale_price"
              name="wholesale_price"
              type="number"
              step="0.01"
              min={0}
              defaultValue={product?.wholesale_price ?? ""}
              placeholder="e.g. 240.00"
              className={inputCls}
            />
          </div>
        </div>
      </fieldset>
      {!product && (
        <div>
          <label className={labelCls}>Quantity on hand{unit === "kg" ? " (kg)" : ""}</label>
          <input name="stock_qty" type="number" step="any" min={0} defaultValue={0} className={inputCls} />
        </div>
      )}
      <div>
        <label className={labelCls}>Reorder level{unit === "kg" ? " (kg)" : ""}</label>
        <input name="reorder_level" type="number" step="any" min={0} defaultValue={product?.reorder_level ?? 0} className={inputCls} />
        <p className={hintCls}>Marked “Low stock” when the quantity falls to this number.</p>
      </div>
      {product && (
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="is_active" defaultChecked={!!product.is_active} />
          Active (shown on the register)
        </label>
      )}

      <div className="flex items-center gap-3 sm:col-span-2">
        <button className={btnPrimary} disabled={pending}>
          {pending && <Spinner />}
          {product ? "Save changes" : "Add product"}
        </button>
        {state.error && <span key={state.error} role="alert" className="inline-block animate-shake text-sm text-red-600">{state.error}</span>}
        {state.ok && <span key={state.ok} className="inline-block animate-slide-down text-sm text-emerald-700">{state.ok}</span>}
      </div>
    </form>
  );
}
