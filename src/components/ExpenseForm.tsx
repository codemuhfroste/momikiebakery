"use client";

import { useActionState, useState } from "react";
import { createExpenseAction, updateExpenseAction } from "@/app/expenses/actions";
import type { ActionState } from "@/lib/actionState";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_HINTS, EXPENSE_METHODS, type Expense } from "@/lib/expenseTypes";
import { Spinner, btnPrimary, btnSecondary, hintCls, inputCls, labelCls } from "./ui";

// Add or change an expense. Shown in a dialog on the Expenses page.
export default function ExpenseForm({
  expense,
  today,
  onSaved,
  onCancel,
}: {
  expense?: Expense;
  today: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState(async (prev: ActionState, fd: FormData) => {
    const result = await (expense ? updateExpenseAction : createExpenseAction)(prev, fd);
    if (result?.ok) onSaved();
    return result;
  }, {} as ActionState);
  const [category, setCategory] = useState(expense?.category ?? "Ingredients");
  const [method, setMethod] = useState(expense?.payment_method ?? "Cash");

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {expense && <input type="hidden" name="id" value={expense.id} />}
      <div className="sm:col-span-2">
        <label className={labelCls} htmlFor="description">What was it for?</label>
        <input
          id="description"
          name="description"
          required
          autoFocus
          maxLength={120}
          defaultValue={expense?.description}
          placeholder='e.g. "2 sacks of flour (25 kg)"'
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls} htmlFor="amount">Amount paid (₱)</label>
        <input
          id="amount"
          name="amount"
          type="number"
          inputMode="decimal"
          step="0.01"
          min={0.01}
          required
          defaultValue={expense?.amount}
          placeholder="0.00"
          className={`${inputCls} tabular-nums`}
        />
      </div>
      <div>
        <label className={labelCls} htmlFor="spent_on">Date paid</label>
        <input id="spent_on" name="spent_on" type="date" required max={today} defaultValue={expense?.spent_on ?? today} className={inputCls} />
      </div>
      <div>
        <label className={labelCls} htmlFor="category">Category</label>
        <select id="category" name="category" value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <p className={hintCls}>{EXPENSE_CATEGORY_HINTS[category]}</p>
      </div>
      <div>
        <label className={labelCls} htmlFor="supplier">Bought from (optional)</label>
        <input id="supplier" name="supplier" maxLength={80} defaultValue={expense?.supplier ?? ""} placeholder="Store or supplier" className={inputCls} />
      </div>
      <div className="sm:col-span-2">
        <span className={labelCls}>Paid by</span>
        <div role="radiogroup" aria-label="Paid by" className="flex flex-wrap gap-1.5">
          {EXPENSE_METHODS.map((m) => (
            <label
              key={m}
              className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm font-medium transition ${
                method === m ? "border-brand bg-brand text-white" : "border-line bg-white text-ink hover:bg-slate-50"
              }`}
            >
              <input type="radio" name="payment_method" value={m} checked={method === m} onChange={() => setMethod(m)} className="sr-only" />
              {m}
            </label>
          ))}
        </div>
        {method === "Cash" && (
          <label className="mt-3 flex items-start gap-2 text-sm">
            <input type="checkbox" name="from_drawer" defaultChecked={expense ? !!expense.from_drawer : true} className="mt-0.5" />
            <span>
              Paid with cash from the register drawer
              <span className="block text-xs text-muted">End of Day takes it off the cash that should be in the drawer.</span>
            </span>
          </label>
        )}
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls} htmlFor="notes">Notes (optional)</label>
        <textarea id="notes" name="notes" rows={2} maxLength={300} defaultValue={expense?.notes ?? ""} className={inputCls} />
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button className={btnPrimary} disabled={pending}>
          {pending && <Spinner />}
          {expense ? "Save changes" : "Save expense"}
        </button>
        <button type="button" onClick={onCancel} className={btnSecondary}>
          Cancel
        </button>
        {state.error && (
          <span key={state.error} role="alert" className="inline-block animate-shake text-sm text-red-600">
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}
