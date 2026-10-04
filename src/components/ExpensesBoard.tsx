"use client";

import { useState, useTransition } from "react";
import { deleteExpenseAction } from "@/app/expenses/actions";
import type { Expense } from "@/lib/expenseTypes";
import { formatCurrency, formatDate } from "@/lib/format";
import { Badge, EmptyState, Spinner, btnPrimary, btnSecondary, tableCls } from "./ui";
import Modal from "./Modal";
import ExpenseForm from "./ExpenseForm";

// The "+ Add expense" button with its dialog.
export function AddExpenseButton({ today }: { today: string }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  return (
    <>
      <button type="button" className={btnPrimary} onClick={() => setOpen(true)}>
        + Add expense
      </button>
      {saved && (
        <span key={saved} role="status" className="inline-block animate-slide-down self-center text-sm text-emerald-700">
          {saved}
        </span>
      )}
      {open && (
        <Modal title="Add expense" description="Money paid out for the store — ingredients, supplies, bills…" onClose={() => setOpen(false)}>
          <ExpenseForm
            today={today}
            onSaved={() => {
              setOpen(false);
              setSaved("Expense saved.");
            }}
            onCancel={() => setOpen(false)}
          />
        </Modal>
      )}
    </>
  );
}

// The list of expenses. The owner can change or delete a row.
export default function ExpensesTable({ expenses, isOwner, today }: { expenses: Expense[]; isOwner: boolean; today: string }) {
  const [editing, setEditing] = useState<Expense | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (expenses.length === 0) {
    return <EmptyState>No expenses recorded for these dates. Tap &ldquo;+ Add expense&rdquo; to record one.</EmptyState>;
  }

  function remove(id: number) {
    setError(null);
    startTransition(async () => {
      const r = await deleteExpenseAction(id);
      if (r.error) setError(r.error);
      setConfirming(null);
    });
  }

  return (
    <>
      {error && <p role="alert" className="px-5 pt-3 text-sm text-red-600">{error}</p>}
      <div className="overflow-x-auto">
        <table className={tableCls}>
          <thead>
            <tr>
              <th>Date</th>
              <th>What for</th>
              <th>Category</th>
              <th>Paid by</th>
              <th>Recorded by</th>
              <th className="text-right">Amount</th>
              {isOwner && <th className="text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap">{formatDate(e.spent_on)}</td>
                <td className="min-w-48">
                  <span className="font-medium text-ink">{e.description}</span>
                  {(e.supplier || e.notes) && (
                    <span className="block text-xs text-muted">{[e.supplier && `From ${e.supplier}`, e.notes].filter(Boolean).join(" · ")}</span>
                  )}
                </td>
                <td className="whitespace-nowrap">
                  <Badge>{e.category}</Badge>
                </td>
                <td className="whitespace-nowrap">
                  {e.payment_method}
                  {e.from_drawer ? <span className="block text-xs text-muted">from the drawer</span> : null}
                </td>
                <td className="whitespace-nowrap text-muted">{e.recorded_by}</td>
                <td className="whitespace-nowrap text-right font-semibold tabular-nums">{formatCurrency(e.amount)}</td>
                {isOwner && (
                  <td className="whitespace-nowrap text-right">
                    {confirming === e.id ? (
                      <span className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => remove(e.id)}
                          className="inline-flex items-center gap-1 rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
                        >
                          {pending && <Spinner className="h-3 w-3" />}
                          Delete it
                        </button>
                        <button type="button" onClick={() => setConfirming(null)} className="text-xs text-muted hover:text-ink">
                          Keep
                        </button>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <button type="button" className={`${btnSecondary} !px-3 !py-1`} onClick={() => setEditing(e)}>
                          Edit
                        </button>
                        <button type="button" onClick={() => setConfirming(e.id)} className="text-xs text-red-600 hover:underline">
                          Delete
                        </button>
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <Modal title="Change expense" description={`Recorded by ${editing.recorded_by}. The change is saved in the Audit Log.`} onClose={() => setEditing(null)}>
          <ExpenseForm expense={editing} today={today} onSaved={() => setEditing(null)} onCancel={() => setEditing(null)} />
        </Modal>
      )}
    </>
  );
}
