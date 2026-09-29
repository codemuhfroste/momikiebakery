// Loads sample categories and products for local testing. Run with:
//   npm run seed:demo -- --yes
// Only inserts rows that don't already exist (matched on name/sku), so it is
// non-destructive, but still never run it against the production database.
import { createClient } from "@libsql/client";

if (!process.argv.includes("--yes")) {
  console.error("Pass --yes to confirm you want to load demo data into this database.");
  process.exit(1);
}

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || (!authToken && !url.startsWith("file:"))) {
  console.error("TURSO_DATABASE_URL and/or TURSO_AUTH_TOKEN are not set. Add them to .env.local first.");
  process.exit(1);
}

const db = createClient({ url, authToken });

const categories = ["Bread & Pastries", "Beverages", "Snacks", "Canned Goods", "Household"];

// [sku, name, category, srp, cost, stock, reorder level]
const products = [
  ["BRD-001", "Pandesal (per piece)", "Bread & Pastries", 3, 1.5, 200, 50],
  ["BRD-002", "Ensaymada", "Bread & Pastries", 25, 14, 30, 10],
  ["BEV-001", "Bottled Water 500ml", "Beverages", 15, 9, 48, 12],
  ["BEV-002", "3-in-1 Coffee Sachet", "Beverages", 8, 5, 100, 30],
  ["SNK-001", "Chippy 27g", "Snacks", 12, 8, 60, 20],
  ["CAN-001", "Sardines 155g", "Canned Goods", 28, 21, 36, 12],
  ["HSE-001", "Dishwashing Liquid 250ml", "Household", 45, 32, 20, 6],
];

for (const name of categories) {
  await db.execute({ sql: "INSERT OR IGNORE INTO categories (name) VALUES (?)", args: [name] });
}

// Barcodes are made-up and unique per product (real ones come from scanning).
// Clearing them first lets a re-run replace older demo barcodes without
// tripping the UNIQUE constraint.
await db.execute({
  sql: `UPDATE products SET barcode = NULL WHERE sku IN (${products.map(() => "?").join(",")})`,
  args: products.map((p) => p[0]),
});

for (const [index, [sku, name, category, srp, cost, stock, reorder]] of products.entries()) {
  const barcode = `4800000${String(index + 1).padStart(6, "0")}`;
  await db.execute({
    sql: `INSERT INTO products
            (sku, barcode, name, category_id, srp, cost, stock_qty, reorder_level)
          VALUES (?, ?, ?, (SELECT id FROM categories WHERE name = ?), ?, ?, ?, ?)
          ON CONFLICT(sku) DO UPDATE SET barcode = excluded.barcode`,
    args: [sku, barcode, name, category, srp, cost, stock, reorder],
  });
}

console.log(`Demo data loaded: ${categories.length} categories, ${products.length} products.`);
