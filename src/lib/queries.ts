import { getDb, readBatch, stmt, type Statement } from "./db";
import type {
  Category,
  Customer,
  CreditItem,
  LedgerEntry,
  OpenCreditSale,
  PriceHistoryEntry,
  Product,
  Sale,
  SaleItem,
  StockMovement,
} from "./types";


export async function listCategories(): Promise<Category[]> {
  const sql = getDb();
  return sql<Category[]>`SELECT id, name FROM categories ORDER BY name`;
}

export async function listProducts(opts: { activeOnly?: boolean } = {}): Promise<Product[]> {
  const sql = getDb();
  return opts.activeOnly
    ? sql<Product[]>`SELECT p.*, c.name AS category_name FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.is_active = 1 ORDER BY p.name`
    : sql<Product[]>`SELECT p.*, c.name AS category_name FROM products p
        LEFT JOIN categories c ON c.id = p.category_id ORDER BY p.name`;
}

export async function getProduct(id: number): Promise<Product | null> {
  const sql = getDb();
  const rows = await sql<Product[]>`SELECT p.*, c.name AS category_name FROM products p
    LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ${id}`;
  return rows[0] ?? null;
}

export async function getProductByBarcode(code: string): Promise<Product | null> {
  const sql = getDb();
  const rows = await sql<Product[]>`SELECT p.*, c.name AS category_name FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.is_active = 1 AND (p.barcode = ${code} OR p.sku = ${code})`;
  return rows[0] ?? null;
}

export async function getPriceHistory(productId: number): Promise<PriceHistoryEntry[]> {
  const sql = getDb();
  return sql<PriceHistoryEntry[]>`SELECT id, old_srp, new_srp, actor_name, created_at
    FROM price_history WHERE product_id = ${productId} ORDER BY id DESC`;
}

export async function listStockMovements(limit = 30): Promise<StockMovement[]> {
  const sql = getDb();
  return sql<StockMovement[]>`
    SELECT m.id, m.product_id, p.name AS product_name, m.change_qty, m.reason,
           m.note, m.actor_name, m.created_at
    FROM stock_movements m JOIN products p ON p.id = m.product_id
    ORDER BY m.id DESC LIMIT ${limit}`;
}

export interface SaleRow extends Sale {
  item_count: number;
  override_count: number;
  customer_name: string | null;
  credit_paid: number;
}

export async function listSalesBetween(start: string, end: string): Promise<SaleRow[]> {
  const sql = getDb();
  return sql<SaleRow[]>`
    SELECT s.*,
      (SELECT COALESCE(SUM(qty), 0) FROM sale_items i WHERE i.sale_id = s.id) AS item_count,
      (SELECT COUNT(*) FROM sale_items i
        WHERE i.sale_id = s.id AND ABS(i.unit_price - i.srp) > 0.004) AS override_count,
      c.name AS customer_name,
      (SELECT COALESCE(SUM(a.amount), 0) FROM credit_allocations a WHERE a.sale_id = s.id) AS credit_paid
    FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
    WHERE s.created_at >= ${start} AND s.created_at < ${end}
    ORDER BY s.id DESC`;
}

export async function getSale(
  id: number
): Promise<{ sale: Sale & { customer_name: string | null }; items: SaleItem[] } | null> {
  const sql = getDb();
  const sales = await sql<(Sale & { customer_name: string | null })[]>`
    SELECT s.*, c.name AS customer_name
    FROM sales s LEFT JOIN customers c ON c.id = s.customer_id WHERE s.id = ${id}`;
  if (!sales[0]) return null;
  const items = await sql<SaleItem[]>`SELECT * FROM sale_items WHERE sale_id = ${id} ORDER BY id`;
  return { sale: sales[0], items };
}

export async function listCustomers(opts: { activeOnly?: boolean } = {}): Promise<Customer[]> {
  const sql = getDb();
  const rows = await sql<Customer[]>`
    SELECT c.*,
      COALESCE((SELECT SUM(amount) FROM credit_ledger l WHERE l.customer_id = c.id), 0) AS balance,
      (SELECT MAX(created_at) FROM credit_ledger l WHERE l.customer_id = c.id) AS last_activity
    FROM customers c ORDER BY c.name`;
  return opts.activeOnly ? rows.filter((c) => c.is_active) : rows;
}

export async function getCustomer(id: number): Promise<Customer | null> {
  const sql = getDb();
  const rows = await sql<Customer[]>`
    SELECT c.*,
      COALESCE((SELECT SUM(amount) FROM credit_ledger l WHERE l.customer_id = c.id), 0) AS balance,
      (SELECT MAX(created_at) FROM credit_ledger l WHERE l.customer_id = c.id) AS last_activity
    FROM customers c WHERE c.id = ${id}`;
  return rows[0] ?? null;
}

export async function getLedger(customerId: number): Promise<LedgerEntry[]> {
  const sql = getDb();
  return sql<LedgerEntry[]>`
    SELECT l.*, s.receipt_no,
      (SELECT GROUP_CONCAT(s2.receipt_no, ', ') FROM credit_allocations a
         JOIN sales s2 ON s2.id = a.sale_id WHERE a.payment_id = l.id) AS applied_to,
      s.total AS sale_total,
      s.amount_tendered AS sale_paid_now,
      (SELECT COALESCE(SUM(a.amount), 0) FROM credit_allocations a WHERE a.sale_id = l.sale_id) AS sale_credit_paid
    FROM credit_ledger l LEFT JOIN sales s ON s.id = l.sale_id
    WHERE l.customer_id = ${customerId}
    ORDER BY l.created_at DESC, l.id DESC`;
}

// A customer's credit sales that still have an unpaid amount, oldest first.
// The statement is exported so recordCreditPayment can read it in a batch.
export function openCreditSalesStmt(customerId: number): Statement {
  return stmt`
    SELECT * FROM (
      SELECT s.id, s.receipt_no, s.created_at, s.credit_amount,
        COALESCE((SELECT SUM(a.amount) FROM credit_allocations a WHERE a.sale_id = s.id), 0) AS paid,
        s.credit_amount - COALESCE((SELECT SUM(a.amount) FROM credit_allocations a WHERE a.sale_id = s.id), 0) AS outstanding
      FROM sales s
      WHERE s.customer_id = ${customerId} AND s.credit_amount > 0 AND s.voided_at IS NULL
    ) WHERE outstanding > 0.004
    ORDER BY created_at, id`;
}

export async function getOpenCreditSales(customerId: number): Promise<OpenCreditSale[]> {
  const [rows] = await readBatch<[OpenCreditSale[]]>([openCreditSalesStmt(customerId)]);
  return rows;
}

// Every product line on a customer's credit purchases, newest sale first.
export async function getCreditItems(customerId: number): Promise<CreditItem[]> {
  const sql = getDb();
  return sql<CreditItem[]>`
    SELECT i.id AS item_id, s.id AS sale_id, s.receipt_no, s.created_at AS sale_date,
      (s.voided_at IS NOT NULL) AS voided, s.credit_amount,
      (SELECT COALESCE(SUM(a.amount), 0) FROM credit_allocations a WHERE a.sale_id = s.id) AS credit_paid,
      i.name, i.qty, i.unit_price, i.line_total
    FROM sale_items i JOIN sales s ON s.id = i.sale_id
    WHERE s.customer_id = ${customerId} AND s.credit_amount > 0
    ORDER BY s.created_at DESC, s.id DESC, i.id`;
}

// Payments applied to one credit sale, oldest first.
export async function getSaleCreditPayments(
  saleId: number
): Promise<{ id: number; amount: number; payment_method: string | null; created_at: string }[]> {
  const sql = getDb();
  return sql`
    SELECT a.id, a.amount, l.payment_method, l.created_at
    FROM credit_allocations a JOIN credit_ledger l ON l.id = a.payment_id
    WHERE a.sale_id = ${saleId} ORDER BY l.created_at, a.id`;
}

// Total owed by all customers, and payments received on a given day.
export async function getCreditSummary(start: string, end: string) {
  const sql = getDb();
  const [row] = await sql<{ receivable: number; debtors: number; collected: number }[]>`
    SELECT
      (SELECT COALESCE(SUM(amount), 0) FROM credit_ledger) AS receivable,
      (SELECT COUNT(*) FROM (SELECT customer_id FROM credit_ledger
         GROUP BY customer_id HAVING SUM(amount) > 0.004)) AS debtors,
      (SELECT COALESCE(-SUM(amount), 0) FROM credit_ledger
         WHERE entry_type = 'payment' AND created_at >= ${start} AND created_at < ${end}) AS collected`;
  return row;
}

