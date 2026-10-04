# Momikie's POS

A point-of-sale system for **Momikie's General Merchandise** (Momikie's Bakery).
Runs on `localhost`; data lives in a hosted [Turso](https://turso.tech) database
(or a local SQLite file for development).

Built with Next.js (App Router) + TypeScript + Tailwind CSS, storing data in
SQLite via [libSQL](https://github.com/tursodatabase/libsql-client-ts). Scaffolded
after the Gemellus Cashflow repo.

## Features

- **Register** (`/pos`) — product grid + search, cart, discount, Cash/GCash/Maya/Card/Credit,
  change calculation, printable receipt. Prices default to the product's **SRP**.
- **Credit Accounts** (`/customers`) — customers who buy now and pay later (utang).
  Pick **Credit** at the register, choose the customer, optionally take a down
  payment; the rest is added to their balance. Optional per-customer credit limit
  (enforced at checkout). Each account has a statement (purchases, payments,
  voids, running balance) and a "Record payment" form. Payments are applied to
  the receipts you tick (oldest first for partial payments), so every credit
  receipt shows Unpaid / Partially paid / Paid. Voiding an unpaid credit sale
  reverses its charge; one with payments on it can't be voided. Balances are the
  sum of an append-only `credit_ledger`; `credit_allocations` records which
  receipts each payment covered.
- **Price control against SRP** — a cashier can change a line's price, but the
  line is flagged "Price override", stored with the SRP at the time of sale, and
  written to the audit log (`price.override`). Owner SRP edits are logged too
  (`price.srp_change`) and kept in each product's SRP history.
- **Transaction History** (`/sales`) — by day, with filters for price overrides
  and voids; receipt view; owner can void (stock is restored).
- **Inventory** (`/inventory`) — stock levels with low/out status, restock,
  spoilage and count corrections; every change is a stock movement.
- **Products** (`/products`) — catalog with barcode, SKU, cost, SRP, margin.
- **Retail and wholesale** — a product can also be sold by its wholesale pack
  (box, case, dozen, tray… of N pieces) at a wholesale price per pack. At the
  Register the cashier switches the sale to **Wholesale**: products with a pack
  are added by the pack, others at their SRP, and any line can be switched
  between piece and pack. Stock stays counted in pieces (1 box of 24 takes 24
  off), so stock, cost and profit work the same. A wholesale line is only
  flagged as a price change if charged other than the wholesale price. Receipts
  show "2 boxes of 24 × ₱240.00"; Transactions mark wholesale sales; the Sales
  Report and its Excel file split retail and wholesale.
- **Sold by weight (kg)** — a product can be sold by the piece (the default) or
  by weight. For a kg product (vegetables, meat…) the SRP and cost are per kg
  and stock is counted in kg. At the Register, tapping or scanning it asks for
  the weight from the scale, or a peso amount ("₱50 worth") that works out the
  kg; the cart line then holds the kg, to the gram. Receipts show
  "0.35 kg × ₱80.00/kg". Things sold by count (calamansi, eggs) stay by the
  piece. Set it on the product form or the Excel sheet's "Sold by" column.
- **Expenses** (`/expenses`) — money paid out for the store: flour and other
  ingredients, supplies, utilities, rent, wages. Owner and staff record them
  (what for, amount, date, category, how paid, supplier); only the owner edits
  or deletes, and every change is in the Audit Log. Totals by category for any
  dates. Cash marked "from the register drawer" comes off End of Day's expected
  cash; the Sales Report and its Excel file show net profit after expenses.
- **Import from Excel** (`/products/import`) — download the product sheet (every
  product plus blank rows, with category and Yes/No dropdowns), edit it in Excel or
  Google Sheets, upload it, check the preview (new / updated / skipped rows), then
  save. Rows match existing products by exact name, then barcode, then SKU; new
  categories are created; SRP changes go to the SRP history and Audit Log. Stock
  of existing products is never changed by an import (use Inventory).
- **Audit Log** (`/audit-log`) — filter by price changes, sales & voids, credit,
  stock, sign-ins.
- **Full backup** (Audit Log page, owner only) — every table as a sheet in one
  Excel file (no product photos, no PIN hashes). Each download is logged.
- **Phones and tablets** — below laptop width the sidebar becomes a ☰ menu, and the
  Register shows a "View sale" button that jumps to the order. The site can be
  added to a home screen (web app manifest, gold "M" icon).
- **Register shortcuts** — F2 search, F4 cash received, F9 complete sale, Esc clear search.

## Reports, staff and statements

- **End of Day** (`/reports`) — closing summary: sales by payment method, cash that
  should be in the drawer (cash sales + cash down payments + cash credit payments)
  with a counted-cash over/short check, credit put on accounts and payments received,
  voids, discounts, profit. Printable.
- **Sales Report** (`/reports/sales`) — any date range (presets: today, 7/14/30 days,
  this month): totals, a day-by-day chart, by category, best sellers, by payment
  method; **Download Excel report** — one styled workbook (navy title banners,
  totals rows, peso formatting) with a Summary sheet, every sale, and every item sold.
- **Dashboard** — adds a 14-day sales chart.
- **Credit aging** — "Owed for" on Credit Accounts (amber past 30 days, red past 60),
  and a printable **statement of account** per customer (`/customers/[id]/statement`)
  with 0–30 / 31–60 / 61–90 / 90+ day buckets.
- **Receipts** print on 58 mm or 80 mm thermal rolls, or A4 (choice remembered per device).
- **Staff** (`/staff`, owner only) — named staff logins: each person signs in at
  `/login` with their own PIN (stored only as a salted hash; PINs must be unique and
  not guessable), so receipts and the Audit Log show who did what. The shared
  cashier PIN still works.
- **Audit Log** search by words and date range.

## Mobile app (offline)

`mobile/` is a Flutter app for phones and tablets that keeps selling during
blackouts and syncs when the connection returns. See [mobile/README.md](mobile/README.md).
It uses the website's `/api/mobile/*` routes (`auth`, `bootstrap`, `sync`, `sales`),
signed in with the same PINs. Offline sales are recorded once each (a phone-made id
per sale), dated when they happened, and flagged for the owner if they ran past
stock or a credit limit while offline.

## Barcode scanning

Codes are matched on a product's `barcode` (or `sku`). Today, USB/Bluetooth
scanners in keyboard-wedge mode work at the register with no setup
(`src/lib/useBarcodeScanner.ts`). Everything funnels through one `onScan(code)`
callback, so a camera or vendor-API scanner later only needs to call it.
`GET /api/scan?code=…` already resolves a code to a product for such integrations.

## Access

PIN login, two roles, each with its own PIN in `.env.local`:

- **Cashier** — signs in at `/login`; Register, Transactions and Credit Accounts
  (can record credit payments).
- **Owner** — signs in at the unlisted `/owner`; everything, including Products,
  Inventory, the Dashboard, voids, customer limits and the Audit Log.

On the live site PINs must be at least 6 characters and 5 wrong tries lock that
network out for an hour; local `npm run dev` skips both. The login page's brand
panel plays `public/vidbg.mp4` (set by `LOGIN_VIDEO_SRC` in
`src/components/LoginScreen.tsx`).

## Getting started

```bash
cp .env.example .env.local   # then set AUTH_CASHIER_PIN and AUTH_OWNER_PIN
npm install
npm run db:setup             # creates/updates data/momikie.db (safe to re-run)
npm run seed:demo -- --yes   # optional sample products
npm run dev
```

Open http://localhost:3000.

### Database

`.env.local` decides which database is used:

- **Turso (live data):** `TURSO_DATABASE_URL=libsql://…turso.io` plus
  `TURSO_AUTH_TOKEN`. Run `npm run db:setup` once against it to create the tables.
  Do **not** run `seed:demo` against it — that adds sample products.
- **Local file (development):** `TURSO_DATABASE_URL=file:data/momikie.db`, no token.

### Demo data

```bash
npm run seed:simulation -- --yes             # two weeks of realistic store activity
npm run db:reset -- --yes-delete-everything  # empty every table (keeps the schema)
```

`seed:simulation` only runs on an empty database. It creates a 27-item catalog
and 6 credit customers, then plays out 14 days (ending today) through the app's
own checkout, credit, void and stock logic: morning bread deliveries, cash /
GCash / Maya / card / credit sales, down payments, credit payments, price
overrides, voids, spoilage, a supplier price increase, and a few items left
low on stock. Each day's records are dated to that day's store hours.
**Before the store uses the system for real, run `npm run go-live` (see below).**

### Demo mode and going live

`DEMO_MODE=on` shows the "FOR DEMO PURPOSES ONLY" banner on the website and the app,
for showing the system with sample data. Unset (the default), there is no banner.

Staff logins use every page except the Audit Log and Staff accounts, which are
the owner's (as are voiding sales and the full backup).

Going live:

```bash
npm run go-live                            # checklist only; changes nothing
npm run go-live -- --yes-delete-demo-data  # also empties every table
```

It checks the database and flags guessable PINs (dates, 123456…), then lists the
dashboard steps: make sure `DEMO_MODE` isn't `on`, set any new PINs in Vercel,
redeploy, and rotate the Turso token.

## Layout

- `src/app/` — routes (`pos`, `sales`, `customers`, `products`, `inventory`, `audit-log`, `scanner`)
- `src/lib/` — `checkout.ts` (sales/voids) and `credit.ts` (customer accounts) hold the business logic; `db.ts` (SQL tag), `auth.ts`/`rbac.ts`, `audit.ts`, `queries.ts`, `barcode.ts`, `format.ts`, `types.ts`
- `scripts/` — `setup-db-turso.mjs` (schema), `seed-demo.mjs`
