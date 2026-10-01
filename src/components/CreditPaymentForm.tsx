"use client";

import { useActionState, useState } from "react";
import { recordPaymentAction } from "@/app/customers/actions";
import { formatCurrency, formatDate, round2 } from "@/lib/format";
import { CREDIT_PAYMENT_METHODS, type OpenCreditSale } from "@/lib/types";
import { btnPrimary, hintCls, inputCls, labelCls } from "./ui";

export default function CreditPaymentForm({
  customerId,
  openSales,
  itemSummaries = {},
}: {
  customerId: number;
  openSales: OpenCreditSale[];
  itemSummaries?: Record<number, string>; // sale id → "2 × Ensaymada, 1 × Sardines"
}) {
  const [state, action, pending] = useActionState(recordPaymentAction, {});
  const [selected, setSelected] = useState<number[]>([]);
  const [amount, setAmount] = useState("");

  if (openSales.length === 0) {
    return <p className="text-sm text-muted">No unpaid receipts. Nothing to collect.</p>;
  }

  const selectedDue = round2(
    openSales.filter((s) => selected.includes(s.id)).reduce((sum, s) => sum + s.outstanding, 0)
  );

  // Ticking a receipt fills in the full amount owed on everything ticked;
  // the amount can then be lowered for a partial payment.
  function toggle(id: number) {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    setSelected(next);
    const due = round2(openSales.filter((s) => next.includes(s.id)).reduce((sum, s) => sum + s.outstanding, 0));
    setAmount(due > 0 ? String(due) : "");
  }

  const allSelected = selected.length === openSales.length;
  function toggleAll() {
    const next = allSelected ? [] : openSales.map((s) => s.id);
    setSelected(next);
    const due = round2(openSales.filter((s) => next.includes(s.id)).reduce((sum, s) => sum + s.outstanding, 0));
    setAmount(due > 0 ? String(due) : "");
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="customer_id" value={customerId} />
      {selected.map((id) => (
        <input key={id} type="hidden" name="sale_id" value={id} />
      ))}

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className={labelCls + " !mb-0"}>Receipts being paid</span>
          <button type="button" onClick={toggleAll} className="text-xs text-brand hover:underline">
            {allSelected ? "Clear" : "Select all"}
          </button>
        </div>
        <ul className="divide-y divide-line rounded-md border border-line">
          {openSales.map((s) => (
            <li key={s.id}>
              <label className="flex cursor-pointer items-start gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                <input type="checkbox" className="mt-1" checked={selected.includes(s.id)} onChange={() => toggle(s.id)} />
                <span className="flex-1">
                  <span className="font-medium">{s.receipt_no}</span>
                  {itemSummaries[s.id] && (
                    <span className="block text-xs text-ink/80">{itemSummaries[s.id]}</span>
                  )}
                  <span className="block text-xs text-muted">
                    {formatDate(s.created_at.slice(0, 10))}
                    {s.paid > 0.004 && ` · ${formatCurrency(s.paid)} of ${formatCurrency(s.credit_amount)} paid`}
                  </span>
                </span>
                <span className="font-medium tabular-nums">{formatCurrency(s.outstanding)}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <label className={labelCls}>Amount received (₱)</label>
        <input
          name="amount"
          type="number"
          min={0.01}
          max={selectedDue || undefined}
          step="0.01"
          required
          disabled={selected.length === 0}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={inputCls}
        />
        <p className={hintCls}>
          {selected.length === 0
            ? "Tick at least one receipt above."
            : `Owed on the selected receipts: ${formatCurrency(selectedDue)}. Enter less for a partial payment — it is applied to the oldest receipt first.`}
        </p>
      </div>
      <div>
        <label className={labelCls}>Paid through</label>
        <select name="method" defaultValue="Cash" className={inputCls}>
          {CREDIT_PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls}>Note (optional)</label>
        <input name="note" placeholder="e.g. GCash ref. no." className={inputCls} />
      </div>
      <button className={`${btnPrimary} w-full`} disabled={pending || selected.length === 0}>
        Record payment
      </button>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.ok && <p className="text-sm text-emerald-700">{state.ok}</p>}
    </form>
  );
}
