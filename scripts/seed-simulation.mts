// Demo simulation: fills an EMPTY database with a realistic two weeks of store
// activity so the whole system can be demonstrated — catalog, credit
// customers, daily bread deliveries, cash/e-wallet/card/credit sales, price
// overrides, credit payments, voids, spoilage, a supplier price increase, and
// some items running low by the end.
//
// Everything goes through the app's real business logic (checkout, voids,
// credit payments, stock adjustments), so stock, balances, receipts and the
// audit log are all consistent. After each simulated day, that day's rows are
// re-dated to the store hours of that day and its receipts renumbered for it.
//
//   npm run seed:simulation -- --yes        (refuses if any sales exist)
//
// To clear it out before going live:  npm run db:reset -- --yes-delete-everything
import { processCheckout, processVoid, type Actor } from "../src/lib/checkout";
import { createCustomer, recordCreditPayment } from "../src/lib/credit";
import { adjustStock } from "../src/lib/inventory";
import { auditStmt } from "../src/lib/audit";
import { readBatch, runBatch, stmt, type Statement } from "../src/lib/db";
import { getOpenCreditSales, listCustomers } from "../src/lib/queries";
import type { PaymentMethod, Product } from "../src/lib/types";

if (!process.argv.includes("--yes")) {
  console.error("This adds two weeks of demo activity. Run with --yes to confirm.");
  process.exit(1);
}

const DAYS = 14; // including today
const OWNER: Actor = { name: "Owner", role: "owner" };
const CASHIER: Actor = { name: "Cashier", role: "cashier" };

// Deterministic randomness, so every run produces the same story.
let seed = 20261001;
function rand() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
const chance = (p: number) => rand() < p;
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

// ---------------------------------------------------------------- catalog
// [name, category, srp, cost, opening stock, reorder level, barcode?, popularity, daily bake?]
type Item = [string, string, number, number, number, number, string | null, number, boolean?];
const CATALOG: Item[] = [
  ["Pandesal (per piece)", "Bread & Pastries", 3, 1.5, 300, 60, null, 10, true],
  ["Spanish Bread", "Bread & Pastries", 8, 4, 60, 15, null, 5, true],
  ["Cheese Roll", "Bread & Pastries", 15, 8, 40, 10, null, 4, true],
  ["Ensaymada", "Bread & Pastries", 25, 14, 30, 8, null, 4, true],
  ["Monay", "Bread & Pastries", 6, 3, 50, 12, null, 3, true],
  ["Ube Loaf", "Bread & Pastries", 85, 50, 12, 4, null, 2, true],
  ["Tasty Bread Loaf", "Bread & Pastries", 72, 55, 15, 5, "4800016644580", 3],
  ["Bottled Water 500ml", "Beverages", 15, 9, 60, 15, "4800049720114", 6],
  ["Coke Mismo 290ml", "Beverages", 20, 15, 48, 12, "4801981116225", 6],
  ["Kopiko 3-in-1 Sachet", "Beverages", 9, 6.5, 120, 30, "8996001600146", 6],
  ["Milo 22g Sachet", "Beverages", 10, 7.5, 100, 25, "4800361339209", 5],
  ["C2 Green Tea 230ml", "Beverages", 25, 19, 24, 8, "4800016022227", 3],
  ["Chippy 27g", "Snacks", 12, 8.5, 60, 15, "4800016033384", 4],
  ["Piattos 40g", "Snacks", 22, 16, 36, 10, "4800016551208", 3],
  ["Skyflakes 25g", "Snacks", 8, 5.5, 80, 20, "4800092330018", 4],
  ["Lucky Me Pancit Canton", "Noodles", 18, 14, 72, 20, "4807770270017", 5],
  ["Lucky Me Beef Noodles", "Noodles", 12, 9, 60, 15, "4807770271328", 3],
  ["Ligo Sardines 155g", "Canned Goods", 28, 22, 48, 12, "4800024500016", 4],
  ["Corned Beef 150g", "Canned Goods", 45, 36, 24, 8, "4800110012342", 2],
  ["Meat Loaf 150g", "Canned Goods", 30, 23, 24, 8, "4800110012359", 2],
  ["Soy Sauce 200ml", "Condiments", 18, 13, 24, 6, "4800110072018", 2],
  ["Cane Vinegar 200ml", "Condiments", 15, 11, 24, 6, "4800110072025", 2],
  ["White Sugar 1/4 kg", "Condiments", 22, 17, 30, 8, null, 3],
  ["Cooking Oil 250ml", "Condiments", 35, 27, 24, 6, "4800361001014", 2],
  ["Dishwashing Liquid 250ml", "Household", 45, 33, 18, 5, "4800888141010", 1],
  ["Bath Soap 135g", "Household", 38, 29, 24, 6, "4800888193026", 2],
  ["Laundry Powder 70g", "Household", 12, 9, 60, 15, "4800888600357", 3],
];

const CUSTOMERS: [string, string, number | null, string][] = [
  ["Aling Nena Santos", "0917 123 4567", 1500, "Sari-sari store owner, buys bread daily"],
  ["Mang Jose Reyes", "0918 765 4321", null, "Longtime suki"],
  ["Ate Liza Cruz", "0927 555 0142", 1000, "Pays every Friday"],
  ["Kuya Ben Garcia", "0915 222 8890", 500, ""],
  ["Lola Remy Dizon", "0906 314 1592", 800, "Prefers pandesal and coffee"],
  ["Mario Villanueva", "0939 808 1234", 300, "Tricycle driver"],
];

// ---------------------------------------------------------------- helpers
const MANILA_MS = 8 * 3600_000;
const dayKey = (d: Date) => new Date(d.getTime() + MANILA_MS).toISOString().slice(0, 10);
const manilaTime = (date: string, hh: number, mm = 0) =>
  new Date(`${date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+08:00`);
const julian = (d: Date) => d.getTime() / 86400000 + 2440587.5;
const round2 = (n: number) => Math.round(n * 100) / 100;

async function dbNow(): Promise<string> {
  const [[r]] = await readBatch<[{ now: string }[]]>([stmt`SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AS now`]);
  return r.now;
}

const DATED_TABLES = ["sales", "stock_movements", "credit_ledger", "credit_allocations", "audit_log", "price_history"];

async function marks(): Promise<Record<string, number>> {
  const rows = await readBatch<{ m: number | null }[][]>(
    DATED_TABLES.map((t) => ({ sql: `SELECT MAX(id) AS m FROM ${t}`, args: [] }))
  );
  return Object.fromEntries(DATED_TABLES.map((t, i) => [t, rows[i][0].m ?? 0]));
}

// Spreads everything written between runStart and runEnd across the store
// hours [open, close] of the simulated day (keeping order and spacing), and
// renames today's receipt numbers to that day's.
async function redate(m: Record<string, number>, runStart: string, runEnd: string, open: Date, close: Date, date: string) {
  const span = Math.max(new Date(runEnd).getTime() - new Date(runStart).getTime(), 1);
  const factor = (close.getTime() - open.getTime()) / span;
  const startJd = julian(new Date(runStart));
  const openJd = julian(open);
  const mapped = (col: string) =>
    `strftime('%Y-%m-%dT%H:%M:%fZ', ${openJd} + (julianday(${col}) - ${startJd}) * ${factor})`;

  const batch: Statement[] = DATED_TABLES.map((t) => ({
    sql: `UPDATE ${t} SET created_at = ${mapped("created_at")} WHERE id > ?`,
    args: [m[t]],
  }));
  batch.push({ sql: `UPDATE sales SET voided_at = ${mapped("voided_at")} WHERE id > ? AND voided_at IS NOT NULL`, args: [m.sales] });

  const todayPrefix = `MOM-${dayKey(new Date()).replace(/-/g, "")}-`;
  const dayPrefix = `MOM-${date.replace(/-/g, "")}-`;
  if (todayPrefix !== dayPrefix) {
    batch.push(
      stmt`UPDATE sales SET receipt_no = replace(receipt_no, ${todayPrefix}, ${dayPrefix}) WHERE id > ${m.sales}`,
      stmt`UPDATE audit_log SET summary = replace(summary, ${todayPrefix}, ${dayPrefix}),
             details = replace(details, ${todayPrefix}, ${dayPrefix}) WHERE id > ${m.audit_log}`
    );
  }
  await runBatch(batch);
}

async function products(): Promise<Product[]> {
  const [rows] = await readBatch<[Product[]]>([stmt`SELECT * FROM products WHERE is_active = 1 ORDER BY id`]);
  return rows;
}

// A supplier price increase: same writes as the product edit form.
async function changeSrp(p: Product, newSrp: number) {
  await runBatch([
    stmt`UPDATE products SET srp = ${newSrp} WHERE id = ${p.id}`,
    stmt`INSERT INTO price_history (product_id, old_srp, new_srp, actor_name) VALUES (${p.id}, ${p.srp}, ${newSrp}, ${OWNER.name})`,
    auditStmt({
      actorName: OWNER.name,
      actorRole: OWNER.role,
      action: "price.srp_change",
      summary: `SRP of ${p.name} changed ₱${p.srp.toFixed(2)} → ₱${newSrp.toFixed(2)}`,
      details: { productId: p.id, name: p.name, oldSrp: p.srp, newSrp },
    }),
  ]);
}

function cashTendered(total: number) {
  for (const note of [20, 50, 100, 200, 500, 1000]) if (note >= total && chance(0.6)) return note;
  return Math.ceil(total / 100) * 100;
}

// ---------------------------------------------------------------- go
const [[{ n: existingSales }]] = await readBatch<[{ n: number }[]]>([stmt`SELECT COUNT(*) AS n FROM sales`]);
const [[{ n: existingProducts }]] = await readBatch<[{ n: number }[]]>([stmt`SELECT COUNT(*) AS n FROM products`]);
if (existingSales > 0 || existingProducts > 0) {
  console.error(
    `This database already has ${existingProducts} products and ${existingSales} sales. The simulation only runs on an empty database.\n` +
      `Clear it first with: npm run db:reset -- --yes-delete-everything`
  );
  process.exit(1);
}

const today = dayKey(new Date());
const firstDay = dayKey(new Date(Date.now() - (DAYS - 1) * 86400_000));
const t0 = Date.now();
console.log(`Simulating ${firstDay} → ${today} against ${process.env.TURSO_DATABASE_URL?.replace(/\?.*/, "")}`);

// Catalog + customers, dated the morning before the first day.
const categories = [...new Set(CATALOG.map((c) => c[1]))];
await runBatch([
  ...categories.map((c) => stmt`INSERT INTO categories (name) VALUES (${c})`),
  ...CATALOG.map(
    ([name, cat, srp, cost, stockQty, reorder, barcode]) =>
      stmt`INSERT INTO products (name, category_id, srp, cost, stock_qty, reorder_level, barcode)
           VALUES (${name}, (SELECT id FROM categories WHERE name = ${cat}), ${srp}, ${cost}, ${stockQty}, ${reorder}, ${barcode})`
  ),
  stmt`INSERT INTO price_history (product_id, old_srp, new_srp, actor_name) SELECT id, NULL, srp, 'Owner' FROM products`,
  auditStmt({ actorName: OWNER.name, actorRole: OWNER.role, action: "product.create", summary: `Added ${CATALOG.length} products to the catalog` }),
]);
for (const [name, phone, limit, notes] of CUSTOMERS) {
  await createCustomer(OWNER, { name, phone, creditLimit: limit, notes });
}
const setupAt = manilaTime(firstDay, 5, 30).toISOString();
await runBatch([
  stmt`UPDATE categories SET created_at = ${setupAt}`,
  stmt`UPDATE products SET created_at = ${setupAt}, updated_at = ${setupAt}`,
  stmt`UPDATE customers SET created_at = ${setupAt}, updated_at = ${setupAt}`,
  stmt`UPDATE price_history SET created_at = ${setupAt}`,
  stmt`UPDATE audit_log SET created_at = ${setupAt}`,
]);
console.log(`  catalog: ${CATALOG.length} products in ${categories.length} categories, ${CUSTOMERS.length} credit customers`);

const popularity = new Map(CATALOG.map((c) => [c[0], c[7]]));
const bakeTarget = new Map(CATALOG.filter((c) => c[8]).map((c) => [c[0], c[4]]));
// Shelf goods the owner "forgets" to reorder in the last week, so the demo
// ends with a few low/out-of-stock items to show.
const letRunLow = new Set(["Corned Beef 150g", "Piattos 40g", "C2 Green Tea 230ml"]);
const totals = { sales: 0, credit: 0, voids: 0, payments: 0, skipped: 0 };

for (let d = 0; d < DAYS; d++) {
  const date = dayKey(new Date(Date.now() - (DAYS - 1 - d) * 86400_000));
  const isToday = date === today;
  const m = await marks();
  const runStart = await dbNow();

  // 06:00 — fresh bread delivered from the bakery, topped back up to target.
  for (const p of await products()) {
    const target = bakeTarget.get(p.name);
    if (target && p.stock_qty < target) await adjustStock(OWNER, p.id, "restock", target - p.stock_qty, "Morning bake");
  }
  // Every 4th day — shelf goods delivery for anything at/below its reorder level.
  if (d % 4 === 2) {
    for (const p of await products()) {
      if (bakeTarget.has(p.name) || p.stock_qty > p.reorder_level) continue;
      if (letRunLow.has(p.name) && d > DAYS - 8) continue;
      const opening = CATALOG.find((c) => c[0] === p.name)![4];
      await adjustStock(OWNER, p.id, "restock", opening - p.stock_qty, "Supplier delivery");
    }
  }
  // Day 6 — supplier price increase on two items.
  if (d === 6) {
    const ps = await products();
    await changeSrp(ps.find((p) => p.name === "Ligo Sardines 155g")!, 30);
    await changeSrp(ps.find((p) => p.name === "Coke Mismo 290ml")!, 22);
  }

  // Sales through the day.
  const salesToday = isToday ? between(5, 8) : between(8, 14);
  const daySaleIds: number[] = [];
  for (let s = 0; s < salesToday; s++) {
    const stock = (await products()).filter((p) => p.stock_qty > 0);
    const weighted = stock.flatMap((p) => Array(popularity.get(p.name) ?? 1).fill(p) as Product[]);
    const lines = new Map<number, { p: Product; qty: number; price: number }>();
    for (let i = between(1, 4); i > 0; i--) {
      const p = pick(weighted);
      const qty = p.name.startsWith("Pandesal") ? between(5, 20) : p.srp < 15 ? between(1, 4) : between(1, 2);
      if (lines.has(p.id) || qty > p.stock_qty) continue;
      let price = p.srp;
      // Occasional price overrides: bulk pandesal, or a suki discount.
      if (p.name.startsWith("Pandesal") && qty >= 15 && chance(0.4)) price = 2.75;
      else if (p.srp >= 25 && chance(0.06)) price = p.srp - pick([1, 2]);
      lines.set(p.id, { p, qty, price });
    }
    if (lines.size === 0) continue;
    const items = [...lines.values()].map((l) => ({ productId: l.p.id, qty: l.qty, unitPrice: l.price }));
    const total = round2(items.reduce((t, i) => t + i.qty * i.unitPrice, 0));
    const discount = total >= 150 && chance(0.1) ? 5 : 0;
    const due = total - discount;

    const roll = rand();
    let method: PaymentMethod = roll < 0.6 ? "Cash" : roll < 0.73 ? "GCash" : roll < 0.77 ? "Maya" : roll < 0.81 ? "Card" : "Credit";
    let customerId: number | null = null;
    let tendered = due;
    if (method === "Credit") {
      const eligible = (await listCustomers({ activeOnly: true })).filter(
        (c) => c.credit_limit == null || c.balance + due <= c.credit_limit
      );
      if (eligible.length === 0) method = "Cash";
      else {
        customerId = pick(eligible).id;
        tendered = chance(0.25) && due > 40 ? Math.floor(due / 2 / 10) * 10 : 0; // sometimes a down payment
      }
    }
    if (method === "Cash") tendered = cashTendered(due);

    const r = await processCheckout(chance(0.85) ? CASHIER : OWNER, {
      items, discount, paymentMethod: method, amountTendered: tendered, customerId,
    });
    if ("error" in r) { totals.skipped++; continue; }
    totals.sales++;
    if (method === "Credit") totals.credit++;
    else if (method === "Cash") daySaleIds.push(r.saleId);

    // Mid-day: customers with a balance sometimes come in to pay.
    if (s === Math.floor(salesToday / 2)) {
      for (const c of await listCustomers({ activeOnly: true })) {
        if (c.balance <= 0 || !chance(0.3)) continue;
        const open = await getOpenCreditSales(c.id);
        const chosen = open.slice(0, between(1, Math.min(2, open.length)));
        const owed = round2(chosen.reduce((t, o) => t + o.outstanding, 0));
        const amount = chance(0.65) ? owed : Math.max(10, Math.floor(owed / 2 / 10) * 10);
        const pr = await recordCreditPayment(CASHIER, c.id, Math.min(amount, owed), pick(["Cash", "Cash", "GCash"]), chosen.map((o) => o.id));
        if (pr.ok) totals.payments++;
      }
    }
  }

  // Now and then a cash sale gets voided.
  if (d % 4 === 1 && daySaleIds.length > 0) {
    const v = await processVoid(OWNER, pick(daySaleIds), pick(["Customer changed their mind", "Wrong item rung up", "Duplicate entry"]));
    if (v.ok) totals.voids++;
  }
  // Evening — some unsold bread is written off.
  if (!isToday) {
    for (const p of await products()) {
      if (!bakeTarget.has(p.name) || p.stock_qty <= 0 || !chance(0.35)) continue;
      const qty = Math.min(p.stock_qty, between(1, Math.max(1, Math.floor(p.stock_qty / 6))));
      await adjustStock(OWNER, p.id, "spoilage", qty, "Unsold at closing");
    }
  }
  // One count correction partway through.
  if (d === 9) {
    const chippy = (await products()).find((p) => p.name === "Chippy 27g")!;
    if (chippy.stock_qty >= 2) await adjustStock(OWNER, chippy.id, "correction", -2, "Shelf count was 2 short");
  }

  const runEnd = await dbNow();
  const open = manilaTime(date, 6, 0);
  const close = isToday
    ? new Date(Math.min(Date.now() - 2 * 60_000, manilaTime(date, 19, 45).getTime()))
    : manilaTime(date, 19, 45);
  await redate(m, runStart, runEnd, open, close > open ? close : new Date(open.getTime() + 3600_000), date);
  console.log(`  ${date}${isToday ? " (today)" : ""}: ${salesToday} sales attempted`);
}

const [[sum], [owed], [low]] = await readBatch<[{ n: number; total: number }[], { owed: number }[], { n: number }[]]>([
  stmt`SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS total FROM sales WHERE voided_at IS NULL`,
  stmt`SELECT COALESCE(SUM(amount), 0) AS owed FROM credit_ledger`,
  stmt`SELECT COUNT(*) AS n FROM products WHERE stock_qty <= reorder_level`,
]);
console.log(
  `\nDone in ${Math.round((Date.now() - t0) / 1000)}s: ${sum.n} sales (₱${sum.total.toFixed(2)}), ${totals.credit} on credit, ` +
    `${totals.payments} credit payments, ${totals.voids} voids, ₱${owed.owed.toFixed(2)} still owed, ${low.n} products low/out of stock.`
);
