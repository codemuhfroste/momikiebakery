"use client";

import { useActionState, useEffect, useState } from "react";
import { voidSaleAction } from "@/app/sales/actions";
import type { ActionState } from "@/lib/actionState";
import { Spinner, btnDanger, btnSecondary, inputCls, labelCls } from "./ui";
import DialogPanel from "./DialogPanel";

// Void straight from the transactions table, so the owner doesn't have to open
// every receipt. Same server action as the one on the receipt page, which is
// where the guards live (already voided, credit already paid, stock restored
// exactly once).
export default function VoidSaleButton({
  saleId,
  receiptNo,
  total,
  isCredit,
}: {
  saleId: number;
  receiptNo: string;
  total: string;
  isCredit: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Closing in the submit path rather than an effect on state.ok: an effect
  // that calls setState just schedules a second render for something we
  // already know the moment the action returns.
  const [state, action, pending] = useActionState(async (prev: ActionState, fd: FormData) => {
    const result = await voidSaleAction(prev, fd);
    if (result.ok) setOpen(false);
    return result;
  }, {} as ActionState);

  // Esc closes, matching the barcode modal on the register.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded px-2 py-1 text-sm font-medium text-red-600 hover:bg-red-50 hover:underline"
      >
        Void
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-slate-900/50 p-4">
          <DialogPanel label={`Void receipt ${receiptNo}`} className="w-full max-w-md animate-scale-in rounded-lg bg-surface p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Void receipt {receiptNo}?</h2>
            <p className="mt-1 text-sm text-muted">
              This cancels the {total} sale and returns its items to stock
              {isCredit && <>, and removes the charge from the customer&apos;s account</>}. It can&apos;t be undone.
            </p>
            <form action={action} className="mt-4 space-y-3">
              <input type="hidden" name="sale_id" value={saleId} />
              <div>
                <label className={labelCls} htmlFor={`void-reason-${saleId}`}>
                  Reason
                </label>
                <input
                  id={`void-reason-${saleId}`}
                  name="reason"
                  required
                  autoFocus
                  placeholder="e.g. Wrong item rung up"
                  className={inputCls}
                />
              </div>
              {state.error && (
                <p key={state.error} role="alert" className="animate-shake text-sm text-red-600">
                  {state.error}
                </p>
              )}
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} disabled={pending} className={btnSecondary}>
                  Cancel
                </button>
                <button className={btnDanger} disabled={pending}>
                  {pending && <Spinner />}
                  Void sale
                </button>
              </div>
            </form>
          </DialogPanel>
        </div>
      )}
    </>
  );
}
