"use client";

import { useActionState } from "react";
import { voidSaleAction } from "@/app/sales/actions";
import { btnDanger, inputCls, labelCls } from "./ui";

export default function VoidSaleForm({ saleId }: { saleId: number }) {
  const [state, action, pending] = useActionState(voidSaleAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="sale_id" value={saleId} />
      <div>
        <label className={labelCls}>Reason</label>
        <input name="reason" required placeholder="e.g. Wrong item rung up" className={inputCls} />
      </div>
      <button className={btnDanger} disabled={pending}>
        Void sale
      </button>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
