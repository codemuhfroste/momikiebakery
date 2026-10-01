"use client";

import { useActionState } from "react";
import { createCustomerAction, updateCustomerAction } from "@/app/customers/actions";
import type { Customer } from "@/lib/types";
import { Spinner, btnPrimary, hintCls, inputCls, labelCls } from "./ui";

export default function CustomerForm({ customer }: { customer?: Customer }) {
  const [state, action, pending] = useActionState(
    customer ? updateCustomerAction : createCustomerAction,
    {}
  );

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {customer && <input type="hidden" name="id" value={customer.id} />}
      <div className="sm:col-span-2">
        <label className={labelCls}>Full name</label>
        <input name="name" required defaultValue={customer?.name} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Mobile number</label>
        <input name="phone" defaultValue={customer?.phone ?? ""} placeholder="09XX XXX XXXX" className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Credit limit (₱)</label>
        <input
          name="credit_limit"
          type="number"
          min={0}
          step="0.01"
          defaultValue={customer?.credit_limit ?? ""}
          placeholder="No limit"
          className={inputCls}
        />
        <p className={hintCls}>The most this customer may owe at one time. Leave blank for no limit.</p>
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>Address</label>
        <input name="address" defaultValue={customer?.address ?? ""} className={inputCls} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>Notes</label>
        <textarea name="notes" rows={2} defaultValue={customer?.notes ?? ""} className={inputCls} />
      </div>
      {customer ? (
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="is_active" defaultChecked={!!customer.is_active} />
          Active — can buy on credit at the register
        </label>
      ) : (
        <input type="hidden" name="is_active" value="1" />
      )}
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className={btnPrimary} disabled={pending}>
          {pending && <Spinner />}
          {customer ? "Save changes" : "Add customer"}
        </button>
        {state.error && <span key={state.error} role="alert" className="inline-block animate-shake text-sm text-red-600">{state.error}</span>}
        {state.ok && <span key={state.ok} className="inline-block animate-slide-down text-sm text-emerald-700">{state.ok}</span>}
      </div>
    </form>
  );
}
