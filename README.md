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
- **Audit Log** (`/audit-log`) — filter by price changes, sales & voids, credit,
  stock, sign-ins.

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

Demo mode is controlled by one setting, `DEMO_MODE`. Unset (the default) it shows
the "FOR DEMO PURPOSES ONLY" banner and lets the cashier login use every owner tab
except the Audit Log. `DEMO_MODE=off` turns both off — no code change needed.

Going live:

```bash
npm run go-live                            # checklist only; changes nothing
npm run go-live -- --yes-delete-demo-data  # also empties every table
```

It checks the database and flags guessable PINs (dates, 123456…), then lists the
dashboard steps: set `DEMO_MODE=off` and any new PINs in Vercel, redeploy, and
rotate the Turso token.

## Layout

- `src/app/` — routes (`pos`, `sales`, `customers`, `products`, `inventory`, `audit-log`, `scanner`)
- `src/lib/` — `checkout.ts` (sales/voids) and `credit.ts` (customer accounts) hold the business logic; `db.ts` (SQL tag), `auth.ts`/`rbac.ts`, `audit.ts`, `queries.ts`, `barcode.ts`, `format.ts`, `types.ts`
- `scripts/` — `setup-db-turso.mjs` (schema), `seed-demo.mjs`
