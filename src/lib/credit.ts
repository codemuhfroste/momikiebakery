// Customer and credit-account logic, kept free of Next.js request APIs (see
// checkout.ts). The server actions in src/app/customers/actions.ts wrap these.
import { GUARD_CHANGED, isGuardFailure, isUniqueFailure, readBatch, runBatch, stmt, type Statement } from "./db";
import { openCreditSalesStmt } from "./queries";
import { auditStmt } from "./audit";
import { formatCurrency, round2 } from "./format";
import { clampRecordedAt, type Actor } from "./checkout";
import { CREDIT_PAYMENT_METHODS, type CreditPaymentMethod, type Customer, type OpenCreditSale } from "./types";

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

  // The SELECT runs right after the INSERT, so last_insert_rowid() is the
  // new customer; the audit entry goes in the same batch.
  const results = await runBatch([
    stmt`INSERT INTO customers (name, phone, address, credit_limit, notes)
         VALUES (${name}, ${clean(input.phone)}, ${clean(input.address)}, ${limit}, ${clean(input.notes)})`,
    stmt`SELECT last_insert_rowid() AS id`,
    auditStmt({
      actorName: actor.name,
      actorRole: actor.role,
      action: "customer.create",
      summary: `Added credit customer ${name}${limit != null ? ` (limit ${formatCurrency(limit)})` : " (no limit)"}`,
      details: { phone: clean(input.phone) },
    }),
  ]);
  return { id: Number((results[1][0] as { id: number }).id) };
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

  const [[before]] = await readBatch<[Customer[]]>([stmt`SELECT * FROM customers WHERE id = ${id}`]);
  if (!before) return { error: "Customer not found." };

  const batch: Statement[] = [
    stmt`UPDATE customers SET name = ${name}, phone = ${clean(input.phone)},
           address = ${clean(input.address)}, credit_limit = ${limit}, notes = ${clean(input.notes)},
           is_active = ${input.isActive === false ? 0 : 1},
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ${id}`,
  ];
  const fmt = (v: number | null) => (v == null ? "no limit" : formatCurrency(v));
  if (before.credit_limit !== limit) {
    batch.push(
      auditStmt({
        actorName: actor.name,
        actorRole: actor.role,
        action: "credit.limit_change",
        summary: `Credit limit of ${name} changed ${fmt(before.credit_limit)} → ${fmt(limit)}`,
        details: { customerId: id, oldLimit: before.credit_limit, newLimit: limit },
      })
    );
  }
  if (before.name !== name || !!before.is_active !== (input.isActive !== false)) {
    batch.push(
      auditStmt({
        actorName: actor.name,
        actorRole: actor.role,
        action: "customer.update",
        summary: `Updated customer ${name}${input.isActive === false ? " (deactivated)" : ""}`,
        details: { customerId: id },
      })
    );
  }
  await runBatch(batch);
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
  note?: string | null,
  // Payments taken on the mobile app (possibly offline) and sent later. With
  // no receipts chosen they apply to all of the customer's unpaid receipts,
  // oldest first; re-sending the same clientUuid records it only once.
  offline?: { clientUuid: string; recordedAt: string }
): Promise<{ error?: string; ok?: string; duplicate?: boolean }> {
  amount = round2(Number(amount));
  if (!(amount > 0)) return { error: "Enter an amount greater than zero." };
  if (!CREDIT_PAYMENT_METHODS.includes(method)) return { error: "Choose how they paid." };
  let ids = [...new Set(saleIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length === 0 && !offline) return { error: "Select the receipt(s) being paid." };

  const [[customer], openRows, [already]] = await readBatch<[Customer[], OpenCreditSale[], { id: number }[]]>([
    stmt`SELECT c.*, COALESCE((SELECT SUM(amount) FROM credit_ledger l WHERE l.customer_id = c.id), 0) AS balance
         FROM customers c WHERE c.id = ${customerId}`,
    openCreditSalesStmt(customerId),
    stmt`SELECT id FROM credit_ledger WHERE client_uuid = ${offline?.clientUuid ?? null}`,
  ]);
  if (offline && already) return { ok: "Payment already recorded.", duplicate: true };
  if (!customer) return { error: "Customer not found." };
  if (ids.length === 0) ids = openRows.map((s) => s.id);
  if (ids.length === 0) return { error: `${customer.name} has no unpaid receipts to apply this payment to.` };

  const open = openRows.filter((s) => ids.includes(s.id));
  if (open.length !== ids.length) {
    return { error: "One of the selected receipts is already paid, voided, or belongs to someone else." };
  }
  const due = round2(open.reduce((sum, s) => sum + s.outstanding, 0));
  if (amount > due + 0.004) {
    return { error: `That's more than the ${formatCurrency(due)} still owed on the selected receipts.` };
  }

  // Apply oldest first. Each allocation row is only written if that receipt
  // still owes at least that much at commit time (GUARD_CHANGED aborts the
  // batch otherwise), so two people recording the same payment can't
  // over-pay a receipt.
  const allocations: { saleId: number; receiptNo: string; amount: number }[] = [];
  let left = amount;
  for (const s of open) {
    if (left <= 0.004) break;
    const part = round2(Math.min(left, s.outstanding));
    allocations.push({ saleId: s.id, receiptNo: s.receipt_no, amount: part });
    left = round2(left - part);
  }
  const remaining = round2(customer.balance - amount);

  const batch: Statement[] = [
    stmt`INSERT INTO credit_ledger (customer_id, entry_type, amount, payment_method, note, actor_name, client_uuid, created_at)
         VALUES (${customerId}, 'payment', ${-amount}, ${method}, ${clean(note)}, ${actor.name},
                 ${offline?.clientUuid ?? null},
                 COALESCE(${offline ? clampRecordedAt(offline.recordedAt) : null}, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))`,
  ];
  allocations.forEach((a, i) => {
    // The first allocation follows the ledger insert, so last_insert_rowid()
    // is the payment; later ones follow an allocation, so read its payment_id.
    const paymentId =
      i === 0 ? "last_insert_rowid()" : "(SELECT payment_id FROM credit_allocations WHERE id = last_insert_rowid())";
    batch.push(
      {
        sql: `INSERT INTO credit_allocations (payment_id, sale_id, amount)
              SELECT ${paymentId}, ?, ?
              WHERE (SELECT s.credit_amount - COALESCE((SELECT SUM(x.amount) FROM credit_allocations x WHERE x.sale_id = s.id), 0)
                     FROM sales s WHERE s.id = ? AND s.customer_id = ? AND s.voided_at IS NULL) >= ? - 0.004`,
        args: [a.saleId, a.amount, a.saleId, customerId, a.amount],
      },
      GUARD_CHANGED
    );
  });
  batch.push(
    auditStmt({
      actorName: actor.name,
      actorRole: actor.role,
      action: "credit.payment",
      summary: `${customer.name} paid ${formatCurrency(amount)} (${method}) on ${allocations
        .map((a) => a.receiptNo)
        .join(", ")}; balance now ${formatCurrency(remaining)}`,
      details: { customerId, amount, method, remaining, allocations },
    })
  );

  try {
    await runBatch(batch);
  } catch (err) {
    if (isGuardFailure(err)) {
      return { error: "Those receipts changed while saving (paid or voided elsewhere). Refresh and try again." };
    }
    if (offline && isUniqueFailure(err, "client_uuid")) return { ok: "Payment already recorded.", duplicate: true };
    return { error: err instanceof Error ? err.message : "Could not record the payment." };
  }
  return {
    ok:
      remaining <= 0.004
        ? "Payment recorded. The account is fully paid."
        : `Payment recorded. Remaining balance: ${formatCurrency(remaining)}.`,
  };
}
