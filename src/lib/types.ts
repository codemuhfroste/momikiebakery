export type PaymentMethod = "Cash" | "GCash" | "Maya" | "Card";
export const PAYMENT_METHODS: PaymentMethod[] = ["Cash", "GCash", "Maya", "Card"];

export interface Category {
  id: number;
  name: string;
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
}

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
