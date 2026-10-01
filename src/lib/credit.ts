// Customer and credit-account logic, kept free of Next.js request APIs (see
// checkout.ts). The server actions in src/app/customers/actions.ts wrap these.
import { getDb } from "./db";
import { getOpenCreditSales } from "./queries";
import { logAudit } from "./audit";
import { formatCurrency, round2 } from "./format";
import type { Actor } from "./checkout";
import { CREDIT_PAYMENT_METHODS, type CreditPaymentMethod, type Customer } from "./types";

export interface CustomerInput {
  name: string;
  phone?: string | null;
  address?: string | null;
  creditLimit?: number | null; // null/undefined = no limit
  notes?: string | null;
  isActive?: boolean;
}

function clean(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

function validLimit(limit: number | null | undefined): number | null | "invalid" {
  if (limit == null) return null;
  if (!Number.isFinite(limit) || limit < 0) return "invalid";
  return round2(limit);
}

export async function createCustomer(
  actor: Actor,
  input: CustomerInput
): Promise<{ error: string } | { id: number }> {
  const name = clean(input.name);
  if (!name) return { error: "Name is required." };
  const limit = validLimit(input.creditLimit);
  if (limit === "invalid") return { error: "Credit limit must be zero or more." };

  const sql = getDb();
  const [{ id }] = await sql<{ id: number }[]>`
    INSERT INTO customers (name, phone, address, credit_limit, notes)
    VALUES (${name}, ${clean(input.phone)}, ${clean(input.address)}, ${limit}, ${clean(input.notes)})
    RETURNING id`;
  await logAudit({
    actorName: actor.name,
    actorRole: actor.role,
    action: "customer.create",
    summary: `Added credit customer ${name}${limit != null ? ` (limit ${formatCurrency(limit)})` : " (no limit)"}`,
    details: { customerId: id },
  });
  return { id };
}

export async function updateCustomer(
  actor: Actor,
  id: number,
  input: CustomerInput
): Promise<{ error?: string; ok?: string }> {
  const name = clean(input.name);
  if (!name) return { error: "Name is required." };
  const limit = validLimit(input.creditLimit);
  if (limit === "invalid") return { error: "Credit limit must be zero or more." };

  const sql = getDb();
  const [before] = await sql<Customer[]>`SELECT * FROM customers WHERE id = ${id}`;
  if (!before) return { error: "Customer not found." };

  await sql`UPDATE customers SET name = ${name}, phone = ${clean(input.phone)},
      address = ${clean(input.address)}, credit_limit = ${limit}, notes = ${clean(input.notes)},
      is_active = ${input.isActive === false ? 0 : 1},
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ${id}`;

  const fmt = (v: number | null) => (v == null ? "no limit" : formatCurrency(v));
  if (before.credit_limit !== limit) {
    await logAudit({
      actorName: actor.name,
      actorRole: actor.role,
      action: "credit.limit_change",
      summary: `Credit limit of ${name} changed ${fmt(before.credit_limit)} → ${fmt(limit)}`,
      details: { customerId: id, oldLimit: before.credit_limit, newLimit: limit },
    });
  }
  if (before.name !== name || !!before.is_active !== (input.isActive !== false)) {
    await logAudit({
      actorName: actor.name,
      actorRole: actor.role,
      action: "customer.update",
      summary: `Updated customer ${name}${input.isActive === false ? " (deactivated)" : ""}`,
      details: { customerId: id },
    });
  }
  return { ok: "Saved." };
}

// A payment toward specific credit receipts. The amount is applied to the
// chosen receipts oldest first, so a partial payment clears the oldest one
// before starting on the next. It can't exceed what those receipts still
// owe, so an accidental extra zero can't leave a negative balance.
export async function recordCreditPayment(
  actor: Actor,
  customerId: number,
  amount: number,
  method: CreditPaymentMethod,
  saleIds: number[],
  note?: string | null
): Promise<{ error?: string; ok?: string }> {
  amount = round2(Number(amount));
  if (!(amount > 0)) return { error: "Enter an amount greater than zero." };
  if (!CREDIT_PAYMENT_METHODS.includes(method)) return { error: "Choose how they paid." };
  const ids = [...new Set(saleIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length === 0) return { error: "Select the receipt(s) being paid." };

  const sql = getDb();
  const [customer] = await sql<Customer[]>`
    SELECT c.*, COALESCE((SELECT SUM(amount) FROM credit_ledger l WHERE l.customer_id = c.id), 0) AS balance
    FROM customers c WHERE c.id = ${customerId}`;
  if (!customer) return { error: "Customer not found." };

  try {
    const applied = await sql.begin(async (tx) => {
      const open = (await getOpenCreditSales(customerId, tx)).filter((s) => ids.includes(s.id));
      if (open.length !== ids.length) {
        throw new Error("One of the selected receipts is already paid, voided, or belongs to someone else.");
      }
      const due = round2(open.reduce((sum, s) => sum + s.outstanding, 0));
      if (amount > due + 0.004) {
        throw new Error(`That's more than the ${formatCurrency(due)} still owed on the selected receipts.`);
      }

      const [{ id: paymentId }] = await tx<{ id: number }[]>`
        INSERT INTO credit_ledger (customer_id, entry_type, amount, payment_method, note, actor_name)
        VALUES (${customerId}, 'payment', ${-amount}, ${method}, ${clean(note)}, ${actor.name})
        RETURNING id`;

      let left = amount;
      const allocations: { receiptNo: string; amount: number }[] = [];
      for (const s of open) {
        if (left <= 0.004) break;
        const part = round2(Math.min(left, s.outstanding));
        await tx`INSERT INTO credit_allocations (payment_id, sale_id, amount)
                 VALUES (${paymentId}, ${s.id}, ${part})`;
        allocations.push({ receiptNo: s.receipt_no, amount: part });
        left = round2(left - part);
      }
      return allocations;
    });

    const remaining = round2(customer.balance - amount);
    await logAudit({
      actorName: actor.name,
      actorRole: actor.role,
      action: "credit.payment",
      summary: `${customer.name} paid ${formatCurrency(amount)} (${method}) on ${applied
        .map((a) => a.receiptNo)
        .join(", ")}; balance now ${formatCurrency(remaining)}`,
      details: { customerId, amount, method, remaining, allocations: applied },
    });
    return {
      ok:
        remaining <= 0.004
          ? "Payment recorded. The account is fully paid."
          : `Payment recorded. Remaining balance: ${formatCurrency(remaining)}.`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not record the payment." };
  }
}
