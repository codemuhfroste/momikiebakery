"use client";

import { useActionState } from "react";
import { adjustStockAction } from "@/app/inventory/actions";
import { btnPrimary, inputCls, labelCls } from "./ui";

export default function StockAdjustForm({ productId }: { productId: number }) {
  const [state, action, pending] = useActionState(adjustStockAction, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3 py-3">
      <input type="hidden" name="product_id" value={productId} />
      <div>
        <label className={labelCls}>Reason</label>
        <select name="reason" defaultValue="restock" className={`${inputCls} w-52`}>
          <option value="restock">Delivery received (add)</option>
          <option value="spoilage">Spoiled / damaged (remove)</option>
          <option value="correction">Count correction (use − to subtract)</option>
        </select>
      </div>
      <div>
        <label className={labelCls}>Quantity</label>
        <input
          name="change"
          type="number"
          step="any"
          required
          placeholder="e.g. 24"
          className={`${inputCls} w-32`}
        />
      </div>
      <div>
        <label className={labelCls}>Note (optional)</label>
        <input name="note" placeholder="e.g. supplier name" className={`${inputCls} w-56`} />
      </div>
      <button className={btnPrimary} disabled={pending}>
        Save
      </button>
      {state.error && <span className="text-sm text-red-600">{state.error}</span>}
      {state.ok && <span className="text-sm text-emerald-700">{state.ok}</span>}
    </form>
  );
}
