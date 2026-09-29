"use client";

import { useActionState } from "react";
import { voidSaleAction } from "@/app/sales/actions";
import { btnDanger, inputCls } from "./ui";

export default function VoidSaleForm({ saleId }: { saleId: number }) {
  const [state, action, pending] = useActionState(voidSaleAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="sale_id" value={saleId} />
      <input name="reason" required placeholder="Reason for void" className={`${inputCls} w-64`} />
      <button className={btnDanger} disabled={pending}>
        Void sale
      </button>
      {state.error && <span className="text-sm text-red-600">{state.error}</span>}
    </form>
  );
}
