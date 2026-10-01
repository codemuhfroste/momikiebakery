"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { checkoutAction } from "@/app/pos/actions";
import { attachBarcodeAction } from "@/app/products/actions";
import { MIN_BARCODE_LENGTH, normalizeBarcode } from "@/lib/barcode";
import { formatCurrency, formatQty, round2 } from "@/lib/format";
import { useBarcodeScanner } from "@/lib/useBarcodeScanner";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/types";
import { Badge, Spinner, btnPrimary, btnSecondary, inputCls, labelCls } from "./ui";
import ProductThumb from "./ProductThumb";

export interface PosProduct {
  id: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  category_name: string | null;
  srp: number;
  stock_qty: number;
  photo_version: string | null;
}

export interface PosCustomer {
  id: number;
  name: string;
  phone: string | null;
  balance: number;
  credit_limit: number | null;
}

interface CartLine {
  product: PosProduct;
  qty: number;
  unitPrice: number;
  barcode: string | null;
}

const METHOD_LABELS: Record<PaymentMethod, string> = {
  Cash: "Cash",
  GCash: "GCash",
  Maya: "Maya",
  Card: "Card",
  Credit: "Credit",
};

export default function PosClient({
  products,
  customers,
}: {
  products: PosProduct[];
  customers: PosCustomer[];
}) {
  const router = useRouter();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [discount, setDiscount] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>("Cash");
  const [tendered, setTendered] = useState("");
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [unknownCode, setUnknownCode] = useState<string | null>(null);
  // Bumped on every add so the tile flash and notice animation replay even
  // when the same product is added twice in a row.
  const [flash, setFlash] = useState<{ id: number; n: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const q = query.trim().toLowerCase();
  const results = (q
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.barcode?.includes(q)
      )
    : products
  ).slice(0, 48);

  function addProduct(product: PosProduct, barcode: string | null = null) {
    setNotice(null);
    setFlash((f) => ({ id: product.id, n: (f?.n ?? 0) + 1 }));
    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      if (existing) {
        return prev.map((l) => (l === existing ? { ...l, qty: l.qty + 1 } : l));
      }
      return [...prev, { product, qty: 1, unitPrice: product.srp, barcode }];
    });
  }

  // Scanner and the search box's Enter key both resolve through here. A code
  // that matches no product opens the "register this barcode" prompt.
  function handleCode(raw: string) {
    const code = normalizeBarcode(raw);
    const hit = products.find((p) => p.barcode === code || p.sku === code);
    if (hit) {
      addProduct(hit, code);
      setNotice({ tone: "ok", text: `Added ${hit.name}` });
      setQuery("");
      searchRef.current?.focus();
    } else {
      setUnknownCode(code);
    }
  }

  // Enter in the search box: an exact barcode/SKU wins, then a single search
  // result; digits-only input that matches nothing is treated as an unknown
  // barcode; anything else is just a search.
  function handleSearchEnter() {
    const q = query.trim();
    if (!q) return;
    if (products.some((p) => p.barcode === q || p.sku === q)) return handleCode(q);
    if (results.length === 1) {
      addProduct(results[0]);
      setNotice({ tone: "ok", text: `Added ${results[0].name}` });
      setQuery("");
    } else if (/^\d+$/.test(q) && q.length >= MIN_BARCODE_LENGTH) {
      setUnknownCode(q);
    } else {
      setNotice({ tone: "err", text: "Select a product from the list." });
    }
  }
  useBarcodeScanner(handleCode);

  const subtotal = round2(cart.reduce((s, l) => s + l.unitPrice * l.qty, 0));
  const discountValue = Math.min(Math.max(discount || 0, 0), subtotal);
  const total = round2(subtotal - discountValue);
  const isCredit = method === "Credit";
  const cashIn = Number(tendered) || 0;
  const tenderedValue = method === "Cash" || isCredit ? cashIn : total;
  const change = round2(tenderedValue - total);
  const overrides = cart.filter((l) => Math.abs(l.unitPrice - l.product.srp) > 0.004).length;

  const customer = customers.find((c) => c.id === customerId) ?? null;
  const creditAmount = isCredit ? round2(total - cashIn) : 0;
  const available = customer?.credit_limit == null ? null : round2(customer.credit_limit - customer.balance);
  const overLimit = isCredit && available != null && creditAmount > available + 0.004;

  const canPay =
    cart.length > 0 &&
    (isCredit ? customer != null && cashIn < total && !overLimit : tenderedValue >= total);

  function selectMethod(m: PaymentMethod) {
    setMethod(m);
    setTendered("");
    setError(null);
  }

  function updateLine(id: number, patch: Partial<CartLine>) {
    setCart((prev) => prev.map((l) => (l.product.id === id ? { ...l, ...patch } : l)));
  }

  function checkout() {
    setError(null);
    startTransition(async () => {
      const result = await checkoutAction({
        items: cart.map((l) => ({
          productId: l.product.id,
          qty: l.qty,
          unitPrice: l.unitPrice,
          barcode: l.barcode,
        })),
        discount: discountValue,
        paymentMethod: method,
        amountTendered: tenderedValue,
        customerId: isCredit ? customerId : null,
      });
      if ("error" in result) setError(result.error);
      else router.push(`/sales/${result.saleId}?new=1`);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_25rem]">
      {/* Product picker */}
      <section className="min-w-0">
        <div className="mb-4">
          <label className={labelCls} htmlFor="pos-search">
            Find a product
          </label>
          <input
            id="pos-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSearchEnter();
              }
            }}
            placeholder="Type a product name, or scan its barcode"
            autoFocus
            ref={searchRef}
            className={`${inputCls} py-2.5 text-base`}
          />
          <div className="mt-1.5 h-5 text-sm">
            {notice && (
              <span
                key={`${notice.text}-${flash?.n ?? 0}`}
                className={`inline-block animate-slide-down ${notice.tone === "ok" ? "text-emerald-700" : "text-red-600"}`}
              >
                {notice.text}
              </span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {results.map((p) => {
            const out = p.stock_qty <= 0;
            return (
              <button
                key={p.id}
                type="button"
                disabled={out}
                onClick={() => addProduct(p)}
                className="relative flex flex-col rounded-lg border border-line bg-surface p-3 text-left shadow-sm transition duration-150 hover:-translate-y-0.5 hover:border-brand hover:shadow-md hover:ring-1 hover:ring-brand active:translate-y-0 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
              >
                {flash?.id === p.id && (
                  <span key={flash.n} aria-hidden className="pointer-events-none absolute inset-0 animate-flash rounded-lg" />
                )}
                <ProductThumb product={p} className="mb-2 aspect-square h-auto w-full" textClass="text-2xl" />
                <span className="text-xs text-muted">{p.category_name ?? "Uncategorized"}</span>
                <span className="mt-0.5 line-clamp-2 min-h-10 text-sm font-medium text-ink">{p.name}</span>
                <span className="mt-2 flex items-center justify-between">
                  <span className="font-semibold tabular-nums text-ink">{formatCurrency(p.srp)}</span>
                  <span className={`text-xs ${out ? "font-medium text-red-600" : "text-muted"}`}>
                    {out ? "Out of stock" : `${formatQty(p.stock_qty)} in stock`}
                  </span>
                </span>
              </button>
            );
          })}
          {results.length === 0 && (
            <p className="col-span-full py-10 text-center text-sm text-muted">No matching products.</p>
          )}
        </div>
      </section>

      {/* Order summary */}
      <aside className="flex h-fit flex-col rounded-lg border border-line bg-surface shadow-sm lg:sticky lg:top-6">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-sm font-semibold text-ink">
            Current sale{cart.length > 0 && <span className="font-normal text-muted"> · {cart.length} item(s)</span>}
          </h2>
          {cart.length > 0 && (
            <button type="button" onClick={() => setCart([])} className="text-sm text-muted hover:text-red-600">
              Clear all
            </button>
          )}
        </div>

        <div className="max-h-[36vh] divide-y divide-line overflow-y-auto">
          {cart.length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-muted">Scan or select a product to start a sale.</p>
          )}
          {cart.map((l) => {
            const changed = Math.abs(l.unitPrice - l.product.srp) > 0.004;
            return (
              <div key={l.product.id} className="animate-slide-in px-5 py-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex items-center gap-2.5 text-sm font-medium text-ink">
                    <ProductThumb product={l.product} className="h-9 w-9" textClass="text-[10px]" />
                    {l.product.name}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${l.product.name}`}
                    onClick={() => setCart((prev) => prev.filter((x) => x !== l))}
                    className="text-xs text-muted hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex items-center rounded-md border border-line">
                    <button
                      type="button"
                      aria-label="Decrease quantity"
                      className="px-2.5 py-1 text-muted hover:text-ink"
                      onClick={() => updateLine(l.product.id, { qty: Math.max(1, l.qty - 1) })}
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-sm tabular-nums">{formatQty(l.qty)}</span>
                    <button
                      type="button"
                      aria-label="Increase quantity"
                      className="px-2.5 py-1 text-muted hover:text-ink"
                      onClick={() => updateLine(l.product.id, { qty: Math.min(l.product.stock_qty, l.qty + 1) })}
                    >
                      +
                    </button>
                  </div>
                  <span className="text-xs text-muted">at ₱</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    aria-label="Unit price"
                    value={l.unitPrice}
                    onChange={(e) => updateLine(l.product.id, { unitPrice: Number(e.target.value) })}
                    className={`w-20 rounded-md border px-2 py-1 text-sm tabular-nums transition-colors duration-200 ${
                      changed ? "border-amber-400 bg-amber-50" : "border-line"
                    }`}
                  />
                  <span className="ml-auto text-sm font-semibold tabular-nums">
                    {formatCurrency(l.unitPrice * l.qty)}
                  </span>
                </div>
                {changed && (
                  <div className="mt-1.5 flex animate-slide-down items-center gap-2 text-xs text-amber-800">
                    <Badge tone="warn">Not SRP</Badge>
                    SRP is {formatCurrency(l.product.srp)}.
                    <button
                      type="button"
                      className="underline"
                      onClick={() => updateLine(l.product.id, { unitPrice: l.product.srp })}
                    >
                      Use SRP
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="space-y-3 border-t border-line px-5 py-4">
          {overrides > 0 && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {overrides} item{overrides > 1 ? "s are" : " is"} priced differently from the SRP. This will be
              recorded in the Audit Log.
            </p>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-muted">Subtotal</span>
            <span className="tabular-nums">{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted">Discount (₱)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={discount || ""}
              placeholder="0.00"
              onChange={(e) => setDiscount(Number(e.target.value))}
              className="w-28 rounded-md border border-line px-2 py-1 text-right text-sm tabular-nums"
            />
          </div>
          <div className="flex justify-between border-t border-line pt-3 text-xl font-semibold text-ink">
            <span>Total</span>
            <span key={total} className="inline-block animate-pop tabular-nums">
              {formatCurrency(total)}
            </span>
          </div>

          <div>
            <span className={labelCls}>Payment method</span>
            <div className="grid grid-cols-5 gap-1.5">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => selectMethod(m)}
                  className={`rounded-md border px-1 py-1.5 text-xs font-medium transition ${
                    method === m
                      ? "border-brand bg-brand text-white"
                      : "border-line bg-white text-ink hover:bg-slate-50"
                  }`}
                >
                  {METHOD_LABELS[m]}
                </button>
              ))}
            </div>
          </div>

          {method === "Cash" && (
            <div className="grid animate-slide-down grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Cash received</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={tendered}
                  onChange={(e) => setTendered(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <span className={labelCls}>Change</span>
                <div className={`py-2 text-lg font-semibold tabular-nums ${change < 0 ? "text-red-600" : "text-emerald-700"}`}>
                  {formatCurrency(Math.max(change, 0))}
                </div>
              </div>
            </div>
          )}

          {isCredit && (
            <CreditPanel
              customers={customers}
              customer={customer}
              onSelect={setCustomerId}
              downPayment={tendered}
              onDownPayment={setTendered}
              creditAmount={creditAmount}
              available={available}
              overLimit={overLimit}
              total={total}
            />
          )}

          {error && (
            <p key={error} role="alert" className="animate-shake text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={!canPay || pending}
            onClick={checkout}
            className={`${btnPrimary} w-full py-3 text-base`}
          >
            {pending
              ? (
                <>
                  <Spinner /> Processing…
                </>
              )
              : isCredit
                ? `Charge ${formatCurrency(Math.max(creditAmount, 0))} to account`
                : `Complete sale · ${formatCurrency(total)}`}
          </button>
          {method === "Cash" && (
            <button type="button" className={`${btnSecondary} w-full`} onClick={() => setTendered(String(total))}>
              Exact amount received
            </button>
          )}
        </div>
      </aside>

      {unknownCode && (
        <UnknownBarcodeModal
          code={unknownCode}
          products={products}
          onClose={() => setUnknownCode(null)}
          onAttached={(product) => {
            addProduct(product, unknownCode);
            setNotice({ tone: "ok", text: `Registered barcode and added ${product.name}` });
            setUnknownCode(null);
            setQuery("");
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function CreditPanel({
  customers,
  customer,
  onSelect,
  downPayment,
  onDownPayment,
  creditAmount,
  available,
  overLimit,
  total,
}: {
  customers: PosCustomer[];
  customer: PosCustomer | null;
  onSelect: (id: number | null) => void;
  downPayment: string;
  onDownPayment: (v: string) => void;
  creditAmount: number;
  available: number | null;
  overLimit: boolean;
  total: number;
}) {
  const [search, setSearch] = useState("");
  const s = search.trim().toLowerCase();
  const matches = customers
    .filter((c) => !s || c.name.toLowerCase().includes(s) || c.phone?.includes(s))
    .slice(0, 6);

  if (customers.length === 0) {
    return (
      <p className="rounded-md border border-line bg-slate-50 px-3 py-2 text-sm text-muted">
        No credit customers yet.{" "}
        <Link href="/customers/new" className="text-brand underline">
          Add one
        </Link>{" "}
        first.
      </p>
    );
  }

  return (
    <div className="animate-slide-down space-y-3 rounded-md border border-line bg-slate-50 p-3">
      {customer ? (
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-ink">{customer.name}</div>
            <div className="text-xs text-muted">
              Owes {formatCurrency(customer.balance)} ·{" "}
              {available == null ? "no credit limit" : `${formatCurrency(Math.max(available, 0))} available`}
            </div>
          </div>
          <button type="button" className="text-xs text-brand underline" onClick={() => onSelect(null)}>
            Change
          </button>
        </div>
      ) : (
        <div>
          <label className={labelCls}>Customer</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer name or mobile"
            className={inputCls}
          />
          <ul className="mt-1.5 max-h-40 divide-y divide-line overflow-y-auto rounded-md border border-line bg-white">
            {matches.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-brand-soft"
                >
                  <span>{c.name}</span>
                  <span className="text-xs tabular-nums text-muted">owes {formatCurrency(c.balance)}</span>
                </button>
              </li>
            ))}
            {matches.length === 0 && <li className="px-3 py-2 text-sm text-muted">No match.</li>}
          </ul>
        </div>
      )}

      <div>
        <label className={labelCls}>Down payment (optional)</label>
        <input
          type="number"
          min={0}
          step="0.01"
          value={downPayment}
          placeholder="0.00"
          onChange={(e) => onDownPayment(e.target.value)}
          className={inputCls}
        />
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-muted">Added to their balance</span>
        <span className="font-semibold tabular-nums">{formatCurrency(Math.max(creditAmount, 0))}</span>
      </div>
      {(Number(downPayment) || 0) >= total && total > 0 && (
        <p className="text-xs text-red-600">The down payment covers the whole total — use Cash instead.</p>
      )}
      {overLimit && customer && (
        <p className="text-xs text-red-600">
          This would put {customer.name} over their credit limit. Collect a larger down payment or remove items.
        </p>
      )}
    </div>
  );
}

function UnknownBarcodeModal({
  code,
  products,
  onClose,
  onAttached,
}: {
  code: string;
  products: PosProduct[];
  onClose: () => void;
  onAttached: (product: PosProduct) => void;
}) {
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Products that don't have a barcode yet come first — most likely matches.
  const matches = products
    .filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(!!a.barcode) - Number(!!b.barcode))
    .slice(0, 8);

  function attach(product: PosProduct) {
    setError(null);
    startTransition(async () => {
      const result = await attachBarcodeAction(product.id, code);
      if (result.error) setError(result.error);
      else onAttached(product);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md animate-scale-in rounded-lg bg-surface p-6 shadow-xl">
        <h2 className="text-lg font-semibold">Barcode not registered</h2>
        <p className="mt-1 text-sm text-muted">
          The barcode <span className="font-mono text-ink">{code}</span> is not linked to any product. Link it to
          an existing product, or add it as a new product.
        </p>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search product to link…"
          className={`${inputCls} mt-4`}
        />
        <ul className="mt-2 max-h-56 divide-y divide-line overflow-y-auto rounded-md border border-line">
          {matches.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() => attach(p)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-brand-soft disabled:opacity-50"
              >
                <span className="flex items-center gap-2.5">
                  <ProductThumb product={p} className="h-8 w-8" textClass="text-[10px]" />
                  {p.name}
                </span>
                <span className="text-xs text-muted">{p.barcode ? "has a barcode" : "no barcode yet"}</span>
              </button>
            </li>
          ))}
          {matches.length === 0 && <li className="px-3 py-3 text-sm text-muted">No matching products.</li>}
        </ul>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex items-center justify-between">
          <Link href={`/products/new?barcode=${encodeURIComponent(code)}`} className={btnPrimary}>
            + Add as new product
          </Link>
          <button type="button" onClick={onClose} className={btnSecondary}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
