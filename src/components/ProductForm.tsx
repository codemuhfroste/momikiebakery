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
        <select name="category_id" defaultValue={product?.category_id ?? ""} className={inputCls}>
          <option value="">Uncategorized</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>SRP — selling price (₱)</label>
          <input name="srp" type="number" step="0.01" min={0} required defaultValue={product?.srp} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Cost per item (₱)</label>
          <input name="cost" type="number" step="0.01" min={0} defaultValue={product?.cost ?? 0} className={inputCls} />
        </div>
      </div>
      {!product && (
        <div>
          <label className={labelCls}>Quantity on hand</label>
          <input name="stock_qty" type="number" step="any" min={0} defaultValue={0} className={inputCls} />
        </div>
      )}
      <div>
        <label className={labelCls}>Reorder level</label>
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
