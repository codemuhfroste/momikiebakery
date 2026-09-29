"use client";

import { useActionState } from "react";
import { createProductAction, updateProductAction } from "@/app/products/actions";
import type { Category, Product } from "@/lib/types";
import { btnPrimary, inputCls, labelCls } from "./ui";

export default function ProductForm({
  product,
  categories,
  defaultBarcode,
}: {
  product?: Product;
  defaultBarcode?: string;
  categories: Category[];
}) {
  const [state, action, pending] = useActionState(
    product ? updateProductAction : createProductAction,
    {}
  );

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {product && <input type="hidden" name="id" value={product.id} />}

      <div className="sm:col-span-2">
        <label className={labelCls}>Name</label>
        <input name="name" required defaultValue={product?.name} className={inputCls} />
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
      </div>
      <div>
        <label className={labelCls}>SKU</label>
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
          <label className={labelCls}>SRP (₱)</label>
          <input name="srp" type="number" step="0.01" min={0} required defaultValue={product?.srp} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Cost (₱)</label>
          <input name="cost" type="number" step="0.01" min={0} defaultValue={product?.cost ?? 0} className={inputCls} />
        </div>
      </div>
      {!product && (
        <div>
          <label className={labelCls}>Opening stock</label>
          <input name="stock_qty" type="number" step="any" min={0} defaultValue={0} className={inputCls} />
        </div>
      )}
      <div>
        <label className={labelCls}>Reorder level</label>
        <input name="reorder_level" type="number" step="any" min={0} defaultValue={product?.reorder_level ?? 0} className={inputCls} />
      </div>
      {product && (
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="is_active" defaultChecked={!!product.is_active} />
          Active (shown on the register)
        </label>
      )}

      <div className="flex items-center gap-3 sm:col-span-2">
        <button className={btnPrimary} disabled={pending}>
          {product ? "Save changes" : "Add product"}
        </button>
        {state.error && <span className="text-sm text-red-600">{state.error}</span>}
        {state.ok && <span className="text-sm text-emerald-700">{state.ok}</span>}
      </div>
    </form>
  );
}
