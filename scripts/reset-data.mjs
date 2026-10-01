// Deletes ALL data (products, customers, sales, credit, stock history, audit
// log) but keeps the tables, so the database is empty and ready for real use
// or a fresh demo. Cannot be undone. Run with:
//   npm run db:reset -- --yes-delete-everything
import { createClient } from "@libsql/client";

if (!process.argv.includes("--yes-delete-everything")) {
  console.error("This permanently deletes every product, customer, sale and log entry.");
  console.error("Run with --yes-delete-everything to confirm.");
  process.exit(1);
}

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || (!authToken && !url.startsWith("file:"))) {
  console.error("TURSO_DATABASE_URL and/or TURSO_AUTH_TOKEN are not set. Add them to .env.local first.");
  process.exit(1);
}
const db = createClient({ url, authToken });

// Children before parents, so foreign keys never point at a deleted row.
const tables = [
  "credit_allocations",
  "credit_ledger",
  "stock_movements",
  "sale_items",
  "sales",
  "price_history",
  "product_photos",
  "products",
  "categories",
  "customers",
  "audit_log",
  "login_attempts",
];
let before = 0;
for (const t of tables) before += Number((await db.execute(`SELECT COUNT(*) AS n FROM ${t}`)).rows[0].n);
// sqlite_sequence resets the id counters so receipts/ids start from 1 again.
await db.batch([...tables.map((t) => `DELETE FROM ${t}`), "DELETE FROM sqlite_sequence"], "write");
console.log(`Deleted ${before} rows from ${url.replace(/\?.*/, "")}. The database is now empty.`);
