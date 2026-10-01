# Momikie's POS

A point-of-sale system for **Momikie's General Merchandise** (Momikie's Bakery).
Runs locally on `localhost` with a local SQLite database file — no hosting needed.

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

Login is disabled for now: the app treats everyone as the owner (`src/lib/rbac.ts`).
The PIN/role code in `src/lib/auth.ts` is kept for when login comes back.

## Getting started

```bash
cp .env.example .env.local   # optional — auth is off, so no PINs needed
npm install
npm run db:setup             # creates/updates data/momikie.db (safe to re-run)
npm run seed:demo -- --yes   # optional sample products
npm run dev
```

Open http://localhost:3000. The database is the file `data/momikie.db`
(git-ignored); back it up by copying it.

## Layout

- `src/app/` — routes (`pos`, `sales`, `customers`, `products`, `inventory`, `audit-log`, `scanner`)
- `src/lib/` — `checkout.ts` (sales/voids) and `credit.ts` (customer accounts) hold the business logic; `db.ts` (SQL tag), `auth.ts`/`rbac.ts`, `audit.ts`, `queries.ts`, `barcode.ts`, `format.ts`, `types.ts`
- `scripts/` — `setup-db-turso.mjs` (schema), `seed-demo.mjs`
