"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { createCategoryAction, deleteCategoryAction, renameCategoryAction } from "@/app/products/actions";
import type { ActionState } from "@/lib/actionState";
import type { Category } from "@/lib/types";
import Modal from "./Modal";
import CategoryIcon, { categoryColor } from "./CategoryIcon";
import { Spinner, btnDanger, btnPrimary, btnSecondary, inputCls } from "./ui";

// "Manage categories" on the Products page: add, rename and delete product
// categories. Deleting keeps the products; they become Uncategorized.
export default function CategoriesButton({ categories, className }: { categories: Category[]; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        Manage categories
      </button>
      {open && (
        <Modal
          title="Categories"
          description="Group products so they're easier to find. Deleting a category keeps its products — they become Uncategorized."
          onClose={() => setOpen(false)}
        >
          <AddCategoryForm />
          <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-line">
            {categories.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">No categories yet.</li>}
            {categories.map((c) => (
              <CategoryRow key={c.id} category={c} />
            ))}
          </ul>
        </Modal>
      )}
    </>
  );
}

// Refreshes the page data after a successful change, so the list (and the
// product tables behind the dialog) update straight away.
function useCategoryAction(action: (prev: ActionState, fd: FormData) => Promise<ActionState>, onOk?: () => void) {
  const router = useRouter();
  return useActionState(async (prev: ActionState, fd: FormData) => {
    const result = await action(prev, fd);
    if (result.ok) {
      onOk?.();
      router.refresh();
    }
    return result;
  }, {} as ActionState);
}

function AddCategoryForm() {
  const [name, setName] = useState("");
  const [state, action, pending] = useCategoryAction(createCategoryAction, () => setName(""));
  return (
    <form action={action}>
      <label htmlFor="new-category" className="mb-1.5 block text-sm font-medium text-ink">
        Add a category
      </label>
      <div className="flex gap-2">
        <input
          id="new-category"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={40}
          placeholder="e.g. Frozen Goods"
          className={inputCls}
        />
        <button className={`${btnPrimary} shrink-0`} disabled={pending}>
          {pending && <Spinner />}
          Add
        </button>
      </div>
      {state.error && <p key={state.error} role="alert" className="mt-1.5 animate-shake text-sm text-red-600">{state.error}</p>}
      {state.ok && <p key={state.ok} className="mt-1.5 animate-slide-down text-sm text-emerald-700">{state.ok}</p>}
    </form>
  );
}

function CategoryRow({ category }: { category: Category }) {
  const [mode, setMode] = useState<"view" | "rename" | "delete">("view");
  const [renameState, rename, renaming] = useCategoryAction(renameCategoryAction, () => setMode("view"));
  const [deleteState, remove, deleting] = useCategoryAction(deleteCategoryAction);
  const count = category.product_count ?? 0;
  const color = categoryColor(category.name);
  const error = mode === "rename" ? renameState.error : mode === "delete" ? deleteState.error : undefined;

  return (
    <li className="px-4 py-3">
      {mode === "rename" ? (
        <form action={rename} className="flex gap-2">
          <input type="hidden" name="id" value={category.id} />
          <input name="name" defaultValue={category.name} autoFocus required maxLength={40} className={inputCls} aria-label="New name" />
          <button className={`${btnPrimary} shrink-0`} disabled={renaming}>
            {renaming && <Spinner />}
            Save
          </button>
          <button type="button" onClick={() => setMode("view")} className={`${btnSecondary} shrink-0`}>
            Cancel
          </button>
        </form>
      ) : (
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: `${color}22`, color }}>
            <CategoryIcon name={category.name} className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-medium text-ink">{category.name}</div>
            <div className="text-xs text-muted">
              {count} product{count === 1 ? "" : "s"}
            </div>
          </div>
          {mode === "view" && (
            <span className="flex items-center gap-3 text-sm">
              <button type="button" onClick={() => setMode("rename")} className="font-medium text-brand hover:underline">
                Rename
              </button>
              <button type="button" onClick={() => setMode("delete")} className="font-medium text-red-600 hover:underline">
                Delete
              </button>
            </span>
          )}
        </div>
      )}
      {mode === "delete" && (
        <form action={remove} className="mt-3 animate-slide-down rounded-md border border-red-200 bg-red-50 px-3 py-2.5">
          <input type="hidden" name="id" value={category.id} />
          <p className="text-sm text-red-900">
            Delete <strong>{category.name}</strong>?
            {count > 0 && ` Its ${count} product${count === 1 ? "" : "s"} will become Uncategorized.`}
          </p>
          <div className="mt-2 flex gap-2">
            <button className={btnDanger} disabled={deleting}>
              {deleting && <Spinner />}
              Delete category
            </button>
            <button type="button" onClick={() => setMode("view")} className={btnSecondary}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {error && <p key={error} role="alert" className="mt-1.5 animate-shake text-sm text-red-600">{error}</p>}
    </li>
  );
}
