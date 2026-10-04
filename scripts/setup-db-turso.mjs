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
  // One photo per product, kept out of the products table so product lists
  // stay small. `data` is base64 of a small (~30-50 KB) image resized in the
  // browser before upload. products.photo_version changes on every new
  // photo, so the image URL changes and browsers fetch the new one.
  `CREATE TABLE IF NOT EXISTS product_photos (
    product_id INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
    mime TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT ${NOW}
  )`,
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
  // Customers who can buy on credit ("utang"). credit_limit NULL = no limit.
  `CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    credit_limit REAL,
    notes TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT ${NOW},
    updated_at TEXT NOT NULL DEFAULT ${NOW}
  )`,
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
    void_reason TEXT,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    credit_amount REAL NOT NULL DEFAULT 0
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
  // Credit account ledger. A customer's balance is SUM(amount):
  //   charge  (+) part of a sale put on credit
  //   payment (-) money the customer paid toward their balance
  //   void    (-) reverses the charge of a voided sale
  // Rows are never edited or deleted, so the history always adds up.
  `CREATE TABLE IF NOT EXISTS credit_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    entry_type TEXT NOT NULL,
    amount REAL NOT NULL,
    sale_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
    payment_method TEXT,
    note TEXT,
    actor_name TEXT,
    created_at TEXT NOT NULL DEFAULT ${NOW}
  )`,
  `CREATE INDEX IF NOT EXISTS idx_credit_ledger_customer ON credit_ledger(customer_id)`,
  // Which receipts each credit payment paid off. A payment can cover several
  // receipts, and a receipt can be paid over several payments. A credit
  // sale's outstanding amount = credit_amount - SUM(its allocations).
  `CREATE TABLE IF NOT EXISTS credit_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_id INTEGER NOT NULL REFERENCES credit_ledger(id) ON DELETE CASCADE,
    sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    amount REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT ${NOW}
  )`,
  `CREATE INDEX IF NOT EXISTS idx_credit_allocations_sale ON credit_allocations(sale_id)`,
  `CREATE INDEX IF NOT EXISTS idx_credit_allocations_payment ON credit_allocations(payment_id)`,
  // Named staff logins (Staff page). PINs are stored only as salted PBKDF2
  // hashes; see src/lib/staff.ts.
  `CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    pin_salt TEXT NOT NULL,
    pin_hash TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    last_login_at TEXT,
    created_at TEXT NOT NULL DEFAULT ${NOW}
  )`,
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

// Columns added after a table was first created. CREATE TABLE IF NOT EXISTS
// won't add them to an existing table, so add each one unless it's there.
const addedColumns = [
  ["sales", "customer_id", "INTEGER REFERENCES customers(id) ON DELETE SET NULL"],
  ["sales", "credit_amount", "REAL NOT NULL DEFAULT 0"],
  ["products", "photo_version", "TEXT"],
  // Mobile app (offline) sales and payments: a unique id from the phone so a
  // re-sent item is recorded once, where it came from, and anything the
  // owner should look at (stock ran out / over credit limit while offline).
  ["sales", "client_uuid", "TEXT"],
  ["sales", "source", "TEXT NOT NULL DEFAULT 'web'"],
  ["sales", "sync_note", "TEXT"],
  ["credit_ledger", "client_uuid", "TEXT"],
  // Wholesale: a product's pack (box, case, dozen, tray…), pieces per pack
  // and price per pack; each sale is retail or wholesale; a line sold by the
  // pack keeps how many packs at what price (its qty is still in pieces).
  ["products", "pack_name", "TEXT"],
  ["products", "pack_size", "REAL"],
  ["products", "wholesale_price", "REAL"],
  ["sales", "price_type", "TEXT NOT NULL DEFAULT 'retail'"],
  ["sale_items", "packs", "REAL"],
  ["sale_items", "pack_name", "TEXT"],
  ["sale_items", "pack_size", "REAL"],
  ["sale_items", "pack_price", "REAL"],
  // Sold by weight: 'kg' products (vegetables, meat…) are rung up by the kilo
  // — stock, quantities and SRP are then in kg / per kg. 'piece' otherwise.
  ["products", "unit", "TEXT NOT NULL DEFAULT 'piece'"],
  ["sale_items", "unit", "TEXT"],
];
for (const [table, column, type] of addedColumns) {
  const { rows } = await db.execute(`PRAGMA table_info(${table})`);
  if (!rows.some((r) => r.name === column)) {
    await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

// Indexes on columns added above (they must exist first).
for (const statement of [
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_client_uuid ON sales(client_uuid)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_ledger_client_uuid ON credit_ledger(client_uuid)`,
]) {
  await db.execute(statement);
}

console.log("Turso schema is up to date.");
