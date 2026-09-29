import { getDb } from "./db";
import type {
  Category,
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
}

export async function listSalesBetween(start: string, end: string): Promise<SaleRow[]> {
  const sql = getDb();
  return sql<SaleRow[]>`
    SELECT s.*,
      (SELECT COALESCE(SUM(qty), 0) FROM sale_items i WHERE i.sale_id = s.id) AS item_count,
      (SELECT COUNT(*) FROM sale_items i
        WHERE i.sale_id = s.id AND ABS(i.unit_price - i.srp) > 0.004) AS override_count
    FROM sales s
    WHERE s.created_at >= ${start} AND s.created_at < ${end}
    ORDER BY s.id DESC`;
}

export async function getSale(id: number): Promise<{ sale: Sale; items: SaleItem[] } | null> {
  const sql = getDb();
  const sales = await sql<Sale[]>`SELECT * FROM sales WHERE id = ${id}`;
  if (!sales[0]) return null;
  const items = await sql<SaleItem[]>`SELECT * FROM sale_items WHERE sale_id = ${id} ORDER BY id`;
  return { sale: sales[0], items };
}

