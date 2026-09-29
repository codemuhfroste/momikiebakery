// Creates the schema on a fresh Turso (libSQL/SQLite) database. Safe to
// re-run. Run with:
//   node --env-file=.env.local scripts/setup-db-turso.mjs
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || (!authToken && !url.startsWith("file:"))) {
  console.error("TURSO_DATABASE_URL and/or TURSO_AUTH_TOKEN are not set. Add them to .env.local first.");
  process.exit(1);
}

const db = createClient({ url, authToken });

// SQLite has no boolean/timestamptz types — booleans are INTEGER 0/1 and
// timestamps are ISO-8601 TEXT. Money is REAL in pesos.
const NOW = `(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

const statements = [
  `CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT ${NOW}
  )`,
  `CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT UNIQUE,
    barcode TEXT UNIQUE,
    name TEXT NOT NULL,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    srp REAL NOT NULL DEFAULT 0,
    cost REAL NOT NULL DEFAULT 0,
    stock_qty REAL NOT NULL DEFAULT 0,
    reorder_level REAL NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT ${NOW},
    updated_at TEXT NOT NULL DEFAULT ${NOW}
  )`,
  `CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id)`,
  // Every change to a product's SRP (suggested retail price), old -> new.
  `CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    old_srp REAL,
    new_srp REAL NOT NULL,
    actor_name TEXT,
    created_at TEXT NOT NULL DEFAULT ${NOW}
  )`,
  `CREATE INDEX IF NOT EXISTS idx_price_history_product ON price_history(product_id)`,
  // One row per completed checkout. `receipt_no` is assigned once at sale
  // time. A voided sale keeps its row (voided_at set) so the audit trail and
  // receipt numbering stay intact.
  `CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_no TEXT NOT NULL UNIQUE,
    subtotal REAL NOT NULL,
    discount REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'Cash',
    amount_tendered REAL NOT NULL DEFAULT 0,
    cashier_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT ${NOW},
    voided_at TEXT,
    voided_by TEXT,
    void_reason TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at)`,
  // name/srp/unit_price/unit_cost are snapshots so old receipts don't change
  // when a product is renamed or repriced. unit_price is what was actually
  // charged; when it differs from srp the line is a price override.
  // barcode is the code the item was scanned with, if any.
  `CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    barcode TEXT,
    qty REAL NOT NULL,
    srp REAL NOT NULL,
    unit_price REAL NOT NULL,
    unit_cost REAL NOT NULL DEFAULT 0,
    line_total REAL NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id)`,
  // Every change to stock_qty gets a row: sale, void, restock, adjustment.
  `CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    change_qty REAL NOT NULL,
    reason TEXT NOT NULL,
    sale_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
    note TEXT,
    actor_name TEXT,
    created_at TEXT NOT NULL DEFAULT ${NOW}
  )`,
  `CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id)`,
  `CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_name TEXT,
    actor_role TEXT NOT NULL,
    action TEXT NOT NULL,
    summary TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT ${NOW}
  )`,
  `CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC)`,
  // Backs the login lockout in loginThrottle.ts — one row per identifier
  // (e.g. "login:203.0.113.1"), reset on a successful login.
  `CREATE TABLE IF NOT EXISTS login_attempts (
    identifier TEXT PRIMARY KEY,
    failed_count INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT
  )`,
];

for (const statement of statements) {
  await db.execute(statement);
}

console.log("Turso schema is up to date.");
