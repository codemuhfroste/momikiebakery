export type PaymentMethod = "Cash" | "GCash" | "Maya" | "Card" | "Credit";
export const PAYMENT_METHODS: PaymentMethod[] = ["Cash", "GCash", "Maya", "Card", "Credit"];

// Ways a customer can pay down a credit balance.
export type CreditPaymentMethod = Exclude<PaymentMethod, "Credit">;
export const CREDIT_PAYMENT_METHODS: CreditPaymentMethod[] = ["Cash", "GCash", "Maya", "Card"];

export interface Category {
  id: number;
  name: string;
  product_count?: number;
}

// `srp` is the suggested retail price — the reference price every sale is
// compared against. A sale line charged at anything else is a price override.
export interface Product {
  id: number;
  sku: string | null;
  barcode: string | null;
  name: string;
  category_id: number | null;
  category_name: string | null;
  srp: number;
  cost: number;
  stock_qty: number;
  reorder_level: number;
  is_active: number; // 0/1
  photo_version: string | null; // null = no photo
}

// URL of a product's photo, or null if it has none. The version is in the URL
// so a new photo gets a new URL (old one can be cached forever).
export function productPhotoUrl(p: { id: number; photo_version: string | null }): string | null {
  return p.photo_version ? `/api/products/${p.id}/photo?v=${p.photo_version}` : null;
}

export interface Sale {
  id: number;
  receipt_no: string;
  subtotal: number;
  discount: number;
  total: number;
  payment_method: PaymentMethod;
  amount_tendered: number;
  cashier_name: string;
  created_at: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  customer_id: number | null;
  credit_amount: number; // part of the total charged to the customer's account
  source?: "web" | "mobile";
  sync_note?: string | null; // mobile sales: something the owner should check (stock ran out offline, etc.)
}

// A customer who can buy on credit ("utang").
export interface Customer {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  credit_limit: number | null; // null = no limit
  notes: string | null;
  is_active: number; // 0/1
  balance: number; // SUM of their credit_ledger rows
  last_activity: string | null;
  oldest_unpaid?: string | null; // when their oldest unpaid credit receipt was made
}

export type LedgerEntryType = "charge" | "payment" | "void";

export interface LedgerEntry {
  id: number;
  customer_id: number;
  entry_type: LedgerEntryType;
  amount: number; // + increases what they owe, - decreases it
  sale_id: number | null;
  receipt_no: string | null;
  payment_method: string | null;
  note: string | null;
  actor_name: string | null;
  created_at: string;
  applied_to: string | null; // payments: receipt numbers this payment paid, comma-separated
  // charges: the sale behind it
  sale_total: number | null;
  sale_paid_now: number | null; // down payment at the register
  sale_credit_paid: number | null; // payments applied to this receipt so far
}

// One product line from a customer's credit purchase.
export interface CreditItem {
  item_id: number;
  sale_id: number;
  receipt_no: string;
  sale_date: string;
  voided: number; // 0/1
  credit_amount: number;
  credit_paid: number;
  name: string;
  qty: number;
  unit_price: number;
  line_total: number;
}

// A credit sale that still has something left to pay.
export interface OpenCreditSale {
  id: number;
  receipt_no: string;
  created_at: string;
  credit_amount: number;
  paid: number;
  outstanding: number;
}

export type CreditPaymentStatus = "unpaid" | "partial" | "paid";

export function creditPaymentStatus(creditAmount: number, paid: number): CreditPaymentStatus {
  if (paid <= 0.004) return "unpaid";
  return paid >= creditAmount - 0.004 ? "paid" : "partial";
}

export const CREDIT_STATUS_LABELS: Record<CreditPaymentStatus, { label: string; tone: "bad" | "warn" | "good" }> = {
  unpaid: { label: "Unpaid", tone: "bad" },
  partial: { label: "Partially paid", tone: "warn" },
  paid: { label: "Paid", tone: "good" },
};

export interface SaleItem {
  id: number;
  sale_id: number;
  product_id: number | null;
  name: string; // snapshot at time of sale
  barcode: string | null;
  qty: number;
  srp: number; // SRP at time of sale
  unit_price: number; // what was actually charged
  unit_cost: number;
  line_total: number;
}

export interface StockMovement {
  id: number;
  product_id: number;
  product_name: string;
  change_qty: number;
  reason: string;
  note: string | null;
  actor_name: string | null;
  created_at: string;
}

export interface PriceHistoryEntry {
  id: number;
  old_srp: number | null;
  new_srp: number;
  actor_name: string | null;
  created_at: string;
}

export type StockStatus = "out" | "low" | "ok";

export function stockStatus(p: Pick<Product, "stock_qty" | "reorder_level">): StockStatus {
  if (p.stock_qty <= 0) return "out";
  if (p.stock_qty <= p.reorder_level) return "low";
  return "ok";
}

export function accountStatus(
  c: Pick<Customer, "is_active" | "credit_limit" | "balance">
): { tone: "good" | "warn" | "bad" | "neutral"; label: string } {
  if (!c.is_active) return { tone: "neutral", label: "Inactive" };
  if (c.credit_limit != null && c.balance > c.credit_limit + 0.004) return { tone: "bad", label: "Over limit" };
  if (c.balance > 0.004) return { tone: "warn", label: "Has balance" };
  return { tone: "good", label: "Paid up" };
}

// How long a credit balance has been owed, for the "aging" shown on credit
// accounts and statements.
export function daysSince(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  return Math.max(0, Math.floor((now - Date.parse(iso)) / 86400_000));
}

export function agingTone(days: number | null): { tone: "neutral" | "warn" | "bad"; label: string } | null {
  if (days == null) return null;
  if (days > 60) return { tone: "bad", label: `${days} days` };
  if (days > 30) return { tone: "warn", label: `${days} days` };
  return { tone: "neutral", label: days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"}` };
}
