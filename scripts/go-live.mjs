// Go-live: clears the demo data from the database in .env.local and checks
// the settings that must change before the store uses the system for real.
//
//   npm run go-live                          -> checklist only, changes nothing
//   npm run go-live -- --yes-delete-demo-data -> also empties every table
//
// Steps it can't do from here (Vercel settings, Turso token) are printed as a
// to-do list at the end.
import { createClient } from "@libsql/client";

const wipe = process.argv.includes("--yes-delete-demo-data");
const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || (!authToken && !url.startsWith("file:"))) {
  console.error("TURSO_DATABASE_URL and/or TURSO_AUTH_TOKEN are not set. Add them to .env.local first.");
  process.exit(1);
}
const db = createClient({ url, authToken });

const ok = (s) => console.log(`  ✔ ${s}`);
const warn = (s) => console.log(`  ✖ ${s}`);

// A PIN that someone who knows the owner could guess: a date (MMDDYY, DDMMYY,
// YYMMDD), repeated digits, or a straight run like 123456.
function weakPin(pin) {
  if (!pin) return "not set";
  if (pin.length < 6) return "shorter than 6 characters";
  if (/^(\d)\1+$/.test(pin)) return "all the same digit";
  if ("01234567890".includes(pin) || "09876543210".includes(pin)) return "a straight run of digits";
  if (/^\d{6}$/.test(pin)) {
    const [a, b, c] = [pin.slice(0, 2), pin.slice(2, 4), pin.slice(4, 6)].map(Number);
    const month = (m) => m >= 1 && m <= 12;
    const day = (d) => d >= 1 && d <= 31;
    if ((month(a) && day(b)) || (day(a) && month(b)) || (month(b) && day(c))) return "looks like a date (e.g. a birthday)";
  }
  return null;
}

console.log(`\nGo-live check for ${url.replace(/\?.*/, "")}\n`);

const tables = [
  "credit_allocations", "credit_ledger", "stock_movements", "sale_items", "sales", "price_history",
  "product_photos", "products", "categories", "customers", "audit_log", "login_attempts",
];
const counts = {};
for (const t of tables) counts[t] = Number((await db.execute(`SELECT COUNT(*) AS n FROM ${t}`)).rows[0].n);
const total = Object.values(counts).reduce((a, b) => a + b, 0);

if (wipe) {
  await db.batch([...tables.map((t) => `DELETE FROM ${t}`), "DELETE FROM sqlite_sequence"], "write");
  ok(`Demo data deleted (${total} rows: ${counts.sales} sales, ${counts.products} products, ${counts.customers} customers). The database is empty and ready.`);
} else if (total > 0) {
  warn(`Database still has demo data: ${counts.sales} sales, ${counts.products} products, ${counts.customers} customers.`);
  console.log("      Re-run with --yes-delete-demo-data to clear it (cannot be undone).");
} else {
  ok("Database is empty.");
}

for (const [label, env] of [["Owner PIN", "AUTH_OWNER_PIN"], ["Cashier PIN", "AUTH_CASHIER_PIN"]]) {
  const problem = weakPin(process.env[env]?.trim());
  if (problem) warn(`${label} (${env} in .env.local): ${problem}. Choose something harder to guess, and set the same value in Vercel.`);
  else ok(`${label} looks reasonable (check Vercel uses the same value).`);
}

console.log(`
Still to do in the Vercel dashboard (Project → Settings → Environment Variables):
  1. Add DEMO_MODE = off   — removes the demo banner and the cashier's access to owner tabs.
  2. Update AUTH_OWNER_PIN / AUTH_CASHIER_PIN if the check above flagged them.
  3. Redeploy (Deployments → ⋯ → Redeploy) so the new settings apply.

And in the Turso dashboard:
  4. Create a new database token, put it in Vercel (TURSO_AUTH_TOKEN) and .env.local,
     then revoke the old one — the old token was shared in a chat during setup.
`);
