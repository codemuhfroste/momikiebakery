"use client";

import { useActionState, useState } from "react";
import { addStaffAction, updateStaffAction } from "@/app/staff/actions";
import type { ActionState } from "@/lib/actionState";
import type { StaffMember } from "@/lib/staff";
import { formatDateTime } from "@/lib/format";
import { Badge, Card, CardHeader, Spinner, btnPrimary, btnSecondary, hintCls, inputCls, labelCls, tableCls } from "./ui";

const pinInput = (name: string, label: string, id: string) => (
  <div>
    <label className={labelCls} htmlFor={id}>
      {label}
    </label>
    <input id={id} name={name} type="password" inputMode="numeric" autoComplete="new-password" required className={inputCls} />
  </div>
);

export default function StaffManager({ staff }: { staff: StaffMember[] }) {
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
      <Card>
        <CardHeader title="Staff" description="Each person signs in at /login with their own PIN." />
        {staff.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">
            No staff added yet. Until you add some, staff sign in with the shared cashier PIN.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className={tableCls}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Last signed in</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <StaffRow key={s.id} member={s} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card className="h-fit">
        <CardHeader title="Add staff member" />
        <div className="p-5">
          <AddStaffForm />
        </div>
      </Card>
    </div>
  );
}

function AddStaffForm() {
  const [key, setKey] = useState(0);
  const [state, action, pending] = useActionState(async (prev: ActionState, fd: FormData) => {
    const r = await addStaffAction(prev, fd);
    if (r.ok) setKey((k) => k + 1); // clear the form
    return r;
  }, {} as ActionState);
  return (
    <form key={key} action={action} className="space-y-3">
      <div>
        <label className={labelCls} htmlFor="staff-name">
          Name
        </label>
        <input id="staff-name" name="name" required maxLength={40} placeholder="e.g. Ana" className={inputCls} />
        <p className={hintCls}>Shown on receipts and in the Audit Log.</p>
      </div>
      {pinInput("pin", "PIN", "staff-pin")}
      {pinInput("pin_confirm", "PIN again", "staff-pin2")}
      <p className={hintCls}>At least 6 digits, not a date or a run like 123456. Each person needs a different PIN.</p>
      <button className={`${btnPrimary} w-full`} disabled={pending}>
        {pending && <Spinner />}
        Add staff member
      </button>
      {state.error && <p key={state.error} role="alert" className="animate-shake text-sm text-red-600">{state.error}</p>}
      {state.ok && <p key={state.ok} className="animate-slide-down text-sm text-emerald-700">{state.ok}</p>}
    </form>
  );
}

function StaffRow({ member }: { member: StaffMember }) {
  const [mode, setMode] = useState<"view" | "rename" | "pin">("view");
  const [state, action, pending] = useActionState(async (prev: ActionState, fd: FormData) => {
    const r = await updateStaffAction(prev, fd);
    if (r.ok) setMode("view");
    return r;
  }, {} as ActionState);

  return (
    <>
      <tr className={member.is_active ? "" : "text-muted"}>
        <td className="font-medium">{member.name}</td>
        <td>{member.is_active ? <Badge tone="good">Can sign in</Badge> : <Badge>Deactivated</Badge>}</td>
        <td className="text-muted">{member.last_login_at ? formatDateTime(member.last_login_at) : "Never"}</td>
        <td className="whitespace-nowrap text-right">
          <form action={action} className="inline-flex items-center gap-3 text-sm">
            <input type="hidden" name="id" value={member.id} />
            <button type="button" onClick={() => setMode(mode === "rename" ? "view" : "rename")} className="font-medium text-brand hover:underline">
              Rename
            </button>
            <button type="button" onClick={() => setMode(mode === "pin" ? "view" : "pin")} className="font-medium text-brand hover:underline">
              Change PIN
            </button>
            <button
              name="op"
              value={member.is_active ? "deactivate" : "activate"}
              disabled={pending}
              className={`font-medium hover:underline ${member.is_active ? "text-red-600" : "text-emerald-700"}`}
            >
              {member.is_active ? "Deactivate" : "Re-activate"}
            </button>
          </form>
        </td>
      </tr>
      {(mode !== "view" || state.error) && (
        <tr className="bg-slate-50 hover:!bg-slate-50">
          <td colSpan={4}>
            {mode === "rename" && (
              <form action={action} className="flex animate-slide-down flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={member.id} />
                <input type="hidden" name="op" value="rename" />
                <div className="min-w-[200px] flex-1">
                  <label className={labelCls} htmlFor={`rn-${member.id}`}>
                    New name
                  </label>
                  <input id={`rn-${member.id}`} name="name" defaultValue={member.name} autoFocus required maxLength={40} className={inputCls} />
                </div>
                <button className={btnPrimary} disabled={pending}>
                  {pending && <Spinner />}Save
                </button>
                <button type="button" className={btnSecondary} onClick={() => setMode("view")}>
                  Cancel
                </button>
              </form>
            )}
            {mode === "pin" && (
              <form action={action} className="grid animate-slide-down items-end gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
                <input type="hidden" name="id" value={member.id} />
                <input type="hidden" name="op" value="pin" />
                {pinInput("pin", `New PIN for ${member.name}`, `pin-${member.id}`)}
                {pinInput("pin_confirm", "New PIN again", `pin2-${member.id}`)}
                <button className={btnPrimary} disabled={pending}>
                  {pending && <Spinner />}Save PIN
                </button>
                <button type="button" className={btnSecondary} onClick={() => setMode("view")}>
                  Cancel
                </button>
              </form>
            )}
            {state.error && (
              <p key={state.error} role="alert" className="mt-2 animate-shake text-sm text-red-600">
                {state.error}
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
