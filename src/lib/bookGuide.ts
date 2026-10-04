// The Report Guide: what to write by hand in the store's BIR-registered
// invoice booklet and books of accounts, worked out from the system's
// sales, utang payments and expenses. It is a guide to copy from, never the
// booklet or the books themselves (this system is not BIR-registered; see
// invoiceRules.ts). Booklet invoice numbers are left blank: only the paper
// booklet assigns them.
import { readBatch, stmt } from "./db";
import { manilaDayRange, round2 } from "./format";
import { INVOICE_THRESHOLD, needsOwnInvoice } from "./invoiceRules";

export interface GuideSale {
  id: number;
  receipt_no: string;
  created_at: string;
  day: string;
  total: number;
  discount: number;
  payment_method: string;
  amount_tendered: number;
  credit_amount: number;
  customer_name: string | null;
}

export interface GuideLine {
  sale_id: number;
  qty: number;
  unit: string;
  description: string;
  unit_price: number;
  amount: number;
}

export interface GuideDay {
  day: string;
  bigSales: (GuideSale & { lines: GuideLine[]; received: number })[];
  small: { count: number; total: number; onCredit: number; byMethod: Record<string, number> };
  summaryNeeded: boolean;
}

export interface CrjRow {
  day: string;
  ref: string;
  particulars: string;
  via: string;
  cash: number;
  sales: number;
  receivable: number;
}

export interface GjRow {
  day: string;
  customer: string;
  amount: number;
  explanation: string;
}

export interface CdjRow {
  day: string;
  paidTo: string;
  particulars: string;
  via: string;
  amount: number;
  account: string;
}

export interface BookGuide {
  days: GuideDay[];
  crj: CrjRow[];
  gj: GjRow[];
  cdj: CdjRow[];
  totals: {
    crjCash: number;
    crjSales: number;
    crjReceivable: number;
    gj: number;
    cdj: number;
    cdjByAccount: { account: string; amount: number }[];
  };
}

// Expense categories → the ledger account they are posted to. Ingredients and
// stock bought for resale are both "Purchases"; the bookkeeper may prefer
// other names.
export function accountFor(category: string): string {
  if (category === "Ingredients" || category === "Stock for resale") return "Purchases";
  if (category === "Other") return "Miscellaneous expense";
  return `${category} expense`;
}

const MANILA_DAY = (col: string) => `strftime('%Y-%m-%d', ${col}, '+8 hours')`;

// The money actually received when the sale was made (a credit sale's down
// payment; the whole total otherwise).
const receivedOf = (s: GuideSale) => round2(s.payment_method === "Credit" ? Math.min(s.amount_tendered, s.total) : s.total);

export async function getBookGuide(from: string, to: string): Promise<BookGuide> {
  const start = manilaDayRange(from)[0];
  const end = manilaDayRange(to)[1];
  const bigFloor = INVOICE_THRESHOLD - 0.005; // needsOwnInvoice() decides exactly; this only narrows the item query
  const [sales, items, payments, expenses] = await readBatch<
    [
      GuideSale[],
      (GuideLine & { packs: number | null; pack_name: string | null; pack_price: number | null; item_unit: string | null })[],
      { day: string; customer: string; amount: number; payment_method: string | null }[],
      { spent_on: string; category: string; description: string; amount: number; payment_method: string; from_drawer: number; supplier: string | null }[],
    ]
  >([
    {
      sql: `SELECT s.id, s.receipt_no, s.created_at, ${MANILA_DAY("s.created_at")} AS day, s.total, s.discount,
                   s.payment_method, s.amount_tendered, s.credit_amount, c.name AS customer_name
            FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
            WHERE s.voided_at IS NULL AND s.created_at >= ? AND s.created_at < ?
            ORDER BY s.created_at`,
      args: [start, end],
    },
    stmt`SELECT i.sale_id, i.qty, i.name AS description, i.unit_price, i.line_total AS amount,
                i.packs, i.pack_name, i.pack_price, i.unit AS item_unit, '' AS unit
         FROM sale_items i JOIN sales s ON s.id = i.sale_id
         WHERE s.voided_at IS NULL AND s.total >= ${bigFloor} AND s.created_at >= ${start} AND s.created_at < ${end}
         ORDER BY i.id`,
    {
      sql: `SELECT ${MANILA_DAY("l.created_at")} AS day, c.name AS customer, -l.amount AS amount, l.payment_method
            FROM credit_ledger l JOIN customers c ON c.id = l.customer_id
            WHERE l.entry_type = 'payment' AND l.created_at >= ? AND l.created_at < ?
            ORDER BY l.created_at`,
      args: [start, end],
    },
    stmt`SELECT spent_on, category, description, amount, payment_method, from_drawer, supplier
         FROM expenses WHERE spent_on >= ${from} AND spent_on <= ${to}
         ORDER BY spent_on, id`,
  ]);

  // Invoice lines as they'd be written: by the pack, by the kg, or by the piece.
  const linesBySale = new Map<number, GuideLine[]>();
  for (const i of items) {
    const line: GuideLine =
      i.packs != null && i.pack_name && i.pack_price != null
        ? { sale_id: i.sale_id, qty: i.packs, unit: i.pack_name, description: i.description, unit_price: i.pack_price, amount: i.amount }
        : { sale_id: i.sale_id, qty: i.qty, unit: i.item_unit === "kg" ? "kg" : "pc", description: i.description, unit_price: i.unit_price, amount: i.amount };
    linesBySale.set(i.sale_id, [...(linesBySale.get(i.sale_id) ?? []), line]);
  }

  const byDay = new Map<string, GuideSale[]>();
  for (const s of sales) byDay.set(s.day, [...(byDay.get(s.day) ?? []), s]);

  const days: GuideDay[] = [];
  const crj: CrjRow[] = [];
  const gj: GjRow[] = [];
  const paymentsByDay = new Map<string, typeof payments>();
  for (const p of payments) paymentsByDay.set(p.day, [...(paymentsByDay.get(p.day) ?? []), p]);
  const allDays = [...new Set([...byDay.keys(), ...paymentsByDay.keys()])].sort();

  for (const day of allDays) {
    const daySales = byDay.get(day) ?? [];
    const big = daySales.filter((s) => needsOwnInvoice(s.total));
    const small = daySales.filter((s) => !needsOwnInvoice(s.total));
    const smallTotal = round2(small.reduce((t, s) => t + s.total, 0));
    const byMethod: Record<string, number> = {};
    for (const s of small) {
      const received = receivedOf(s);
      if (received > 0) {
        const m = s.payment_method === "Credit" ? "Cash" : s.payment_method; // a credit sale's down payment is taken in cash
        byMethod[m] = round2((byMethod[m] ?? 0) + received);
      }
    }
    const summaryNeeded = smallTotal > INVOICE_THRESHOLD + 0.004;
    if (daySales.length) {
      days.push({
        day,
        bigSales: big.map((s) => ({ ...s, lines: linesBySale.get(s.id) ?? [], received: receivedOf(s) })),
        small: { count: small.length, total: smallTotal, onCredit: round2(small.reduce((t, s) => t + s.credit_amount, 0)), byMethod },
        summaryNeeded,
      });
    }

    // Cash receipts journal: money received that day.
    for (const s of big) {
      const received = receivedOf(s);
      if (received <= 0) continue;
      crj.push({
        day,
        ref: `Inv ____ (${s.receipt_no})`,
        particulars: s.customer_name ?? "Walk-in customer",
        via: s.payment_method === "Credit" ? "Cash (down payment)" : s.payment_method,
        cash: received,
        sales: received,
        receivable: 0,
      });
    }
    const smallReceived = round2(Object.values(byMethod).reduce((t, v) => t + v, 0));
    if (smallReceived > 0) {
      const methods = Object.entries(byMethod);
      crj.push({
        day,
        ref: summaryNeeded ? "Inv ____ (daily summary)" : "Daily sales",
        particulars: summaryNeeded ? "Various customers – daily summary" : "Various customers – under ₱500, no invoice needed",
        via: methods.length === 1 ? methods[0][0] : methods.map(([m, v]) => `${m} ${v.toFixed(2)}`).join(" · "),
        cash: smallReceived,
        sales: smallReceived,
        receivable: 0,
      });
    }
    for (const p of paymentsByDay.get(day) ?? []) {
      crj.push({
        day,
        ref: "Collection",
        particulars: `${p.customer} – paid on account`,
        via: p.payment_method ?? "Cash",
        cash: round2(p.amount),
        sales: 0,
        receivable: round2(p.amount),
      });
    }

    // General journal: what was sold on utang (no cash yet).
    for (const s of daySales) {
      if (s.credit_amount <= 0.004) continue;
      gj.push({
        day,
        customer: s.customer_name ?? "Customer",
        amount: round2(s.credit_amount),
        explanation: needsOwnInvoice(s.total)
          ? `To record sale on account, Inv ____ (${s.receipt_no})`
          : `To record sale on account, ${s.receipt_no} (part of the ${summaryNeeded ? "daily summary invoice" : "day's sales"})`,
      });
    }
  }

  // Cash disbursements journal: every expense.
  const cdj: CdjRow[] = expenses.map((e) => ({
    day: e.spent_on,
    paidTo: e.supplier ?? "—",
    particulars: e.description,
    via: e.payment_method === "Cash" && e.from_drawer ? "Cash (drawer)" : e.payment_method,
    amount: round2(e.amount),
    account: accountFor(e.category),
  }));
  const cdjByAccount = new Map<string, number>();
  for (const r of cdj) cdjByAccount.set(r.account, round2((cdjByAccount.get(r.account) ?? 0) + r.amount));

  const sum = (rows: { [k: string]: unknown }[], key: string) => round2(rows.reduce((t, r) => t + Number(r[key]), 0));
  return {
    days,
    crj,
    gj,
    cdj,
    totals: {
      crjCash: sum(crj as never, "cash"),
      crjSales: sum(crj as never, "sales"),
      crjReceivable: sum(crj as never, "receivable"),
      gj: sum(gj as never, "amount"),
      cdj: sum(cdj as never, "amount"),
      cdjByAccount: [...cdjByAccount].map(([account, amount]) => ({ account, amount })).sort((a, b) => b.amount - a.amount),
    },
  };
}
