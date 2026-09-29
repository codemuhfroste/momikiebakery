"use client";

import { useActionState } from "react";
import { adjustStockAction } from "@/app/inventory/actions";
import { btnPrimary, inputCls } from "./ui";

export default function StockAdjustForm({ productId }: { productId: number }) {
  const [state, action, pending] = useActionState(adjustStockAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 py-2">
      <input type="hidden" name="product_id" value={productId} />
      <input
        name="change"
        type="number"
        step="any"
        required
        placeholder="± qty"
        className={`${inputCls} w-24`}
      />
      <select name="reason" defaultValue="restock" className={`${inputCls} w-48`}>
        <option value="restock">Restock (delivery)</option>
        <option value="spoilage">Spoilage / damage</option>
        <option value="correction">Count correction</option>
      </select>
      <input name="note" placeholder="Note (optional)" className={`${inputCls} w-56`} />
      <button className={btnPrimary} disabled={pending}>
        Apply
      </button>
      {state.error && <span className="text-sm text-red-600">{state.error}</span>}
      {state.ok && <span className="text-sm text-emerald-700">{state.ok}</span>}
    </form>
  );
}
