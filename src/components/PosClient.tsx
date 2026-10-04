"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { checkoutAction } from "@/app/pos/actions";
import { attachBarcodeAction } from "@/app/products/actions";
import { MIN_BARCODE_LENGTH, normalizeBarcode } from "@/lib/barcode";
import { formatCurrency, formatQty, round2 } from "@/lib/format";
import { useBarcodeScanner } from "@/lib/useBarcodeScanner";
import { PAYMENT_METHODS, hasWholesale, packLabel, unitSuffix, type PaymentMethod, type PriceType } from "@/lib/types";
import { Badge, Spinner, btnPrimary, btnSecondary, inputCls, labelCls } from "./ui";
import DialogPanel from "./DialogPanel";
import ProductThumb from "./ProductThumb";

export interface PosProduct {
  id: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  category_name: string | null;
  srp: number;
  pack_name: string | null;
  pack_size: number | null;
  wholesale_price: number | null;
  unit: string; // "kg": sold by weight — SRP per kg, stock in kg
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

// A line is sold by the piece, or (wholesale) by the product's pack — then
// qty counts packs and unitPrice is per pack. A sale can mix both.
interface CartLine {
  product: PosProduct;
  byPack: boolean;
  qty: number;
  unitPrice: number;
  barcode: string | null;
}

const lineKey = (l: CartLine) => `${l.product.id}:${l.byPack ? "pack" : "piece"}`;
const listPrice = (p: PosProduct, byPack: boolean) => (byPack ? p.wholesale_price! : p.srp);
const piecesOf = (l: CartLine) => (l.byPack ? l.qty * l.product.pack_size! : l.qty);
// A line weighed on the scale: qty is in kg.
const isWeighed = (l: CartLine) => l.product.unit === "kg" && !l.byPack;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

// Changes a line's unit (piece ↔ pack), keeping the count and resetting the
// price to the list price for the new unit; merges with a line already in
// that unit.
function switchUnit(cart: CartLine[], target: CartLine, byPack: boolean): CartLine[] {
  if (target.byPack === byPack || (byPack && !hasWholesale(target.product))) return cart;
  const moved: CartLine = { ...target, byPack, unitPrice: listPrice(target.product, byPack) };
  const same = cart.find((l) => l !== target && lineKey(l) === lineKey(moved));
  return cart
    .filter((l) => l !== target)
    .map((l) => (l === same ? { ...l, qty: l.qty + moved.qty } : l))
    .concat(same ? [] : [moved]);
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
  // Retail or wholesale, chosen per sale by the cashier.
  const [priceType, setPriceType] = useState<PriceType>("retail");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [unknownCode, setUnknownCode] = useState<string | null>(null);
  // A product sold by weight waiting for its kg (or peso amount).
  const [weighing, setWeighing] = useState<{ product: PosProduct; barcode: string | null } | null>(null);
  // The sale just rung up. The register clears itself for the next customer
  // instead of navigating to the receipt, so this carries the one thing the
  // cashier still needs from it: the change to hand back.
  const [lastSale, setLastSale] = useState<{
    saleId: number;
    receiptNo: string;
    method: PaymentMethod;
    change: number;
    creditAmount: number;
    customerName: string | null;
  } | null>(null);
  // Bumped on every add so the tile flash and notice animation replay even
  // when the same product is added twice in a row.
  const [flash, setFlash] = useState<{ id: number; n: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const cashRef = useRef<HTMLInputElement>(null);

  const q = query.trim().toLowerCase();
  const results = (q
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.barcode?.includes(q)
      )
    : products
  ).slice(0, 48);

  // Adds one of the product (or one pack). A product sold by weight first
  // asks for its kg — then this returns false and the weight prompt adds it.
  function addProduct(product: PosProduct, barcode: string | null = null, kg?: number): boolean {
    // Wholesale: products with a pack are added by the pack.
    const byPack = priceType === "wholesale" && hasWholesale(product);
    if (product.unit === "kg" && !byPack && kg == null) {
      setWeighing({ product, barcode });
      return false;
    }
    setNotice(null);
    setLastSale(null);
    setFlash((f) => ({ id: product.id, n: (f?.n ?? 0) + 1 }));
    const add = byPack || kg == null ? 1 : kg;
    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === product.id && l.byPack === byPack);
      if (existing) {
        return prev.map((l) => (l === existing ? { ...l, qty: round3(l.qty + add) } : l));
      }
      return [...prev, { product, byPack, qty: add, unitPrice: listPrice(product, byPack), barcode }];
    });
    return true;
  }

  // Switching the whole sale: lines that can be sold by the pack follow.
  function choosePriceType(next: PriceType) {
    setPriceType(next);
    setCart((prev) => {
      let lines = prev;
      for (const l of prev) {
        const current = lines.find((x) => lineKey(x) === lineKey(l)); // may have merged into another
        if (current) lines = switchUnit(lines, current, next === "wholesale");
      }
      return lines;
    });
  }

  // Scanner and the search box's Enter key both resolve through here. A code
  // that matches no product opens the "register this barcode" prompt.
  function handleCode(raw: string) {
    const code = normalizeBarcode(raw);
    const hit = products.find((p) => p.barcode === code || p.sku === code);
    if (hit) {
      if (addProduct(hit, code)) setNotice({ tone: "ok", text: `Added ${hit.name}` });
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
      if (addProduct(results[0])) setNotice({ tone: "ok", text: `Added ${results[0].name}` });
      setQuery("");
    } else if (/^\d+$/.test(q) && q.length >= MIN_BARCODE_LENGTH) {
      setUnknownCode(q);
    } else {
      setNotice({ tone: "err", text: "Select a product from the list." });
    }
  }
  useBarcodeScanner(handleCode);

  const subtotal = round2(cart.reduce((s, l) => s + round2(l.unitPrice * l.qty), 0));
  const discountValue = Math.min(Math.max(discount || 0, 0), subtotal);
  const total = round2(subtotal - discountValue);
  const isCredit = method === "Credit";
  const cashIn = Number(tendered) || 0;
  const tenderedValue = method === "Cash" || isCredit ? cashIn : total;
  const change = round2(tenderedValue - total);
  const overrides = cart.filter((l) => Math.abs(l.unitPrice - listPrice(l.product, l.byPack)) > 0.004).length;

  const customer = customers.find((c) => c.id === customerId) ?? null;
  const creditAmount = isCredit ? round2(total - cashIn) : 0;
  const available = customer?.credit_limit == null ? null : round2(customer.credit_limit - customer.balance);
  const overLimit = isCredit && available != null && creditAmount > available + 0.004;

  // A weighed line over the stock left (the stepper can't go over; a typed
  // weight can).
  const overStock = cart.filter((l) => isWeighed(l) && l.qty > maxQty(l) + 0.0005);
  const canPay =
    cart.length > 0 &&
    cart.every((l) => l.qty > 0) &&
    overStock.length === 0 &&
    (isCredit ? customer != null && cashIn < total && !overLimit : tenderedValue >= total);

  function selectMethod(m: PaymentMethod) {
    setMethod(m);
    setTendered("");
    setError(null);
  }

  function updateLine(line: CartLine, patch: Partial<CartLine>) {
    setCart((prev) => prev.map((l) => (lineKey(l) === lineKey(line) ? { ...l, ...patch } : l)));
  }

  // The most of this line the stock allows, given the product's other lines.
  function maxQty(line: CartLine) {
    const otherPieces = cart.filter((l) => l.product.id === line.product.id && l !== line).reduce((n, l) => n + piecesOf(l), 0);
    const free = line.product.stock_qty - otherPieces;
    return line.byPack ? Math.floor(free / line.product.pack_size!) : free;
  }

  function checkout() {
    setError(null);
    startTransition(async () => {
      const result = await checkoutAction({
        items: cart.map((l) => ({
          productId: l.product.id,
          qty: piecesOf(l),
          packs: l.byPack ? l.qty : null,
          unitPrice: l.unitPrice,
          barcode: l.barcode,
        })),
        priceType,
        discount: discountValue,
        paymentMethod: method,
        amountTendered: tenderedValue,
        customerId: isCredit ? customerId : null,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setLastSale({
        saleId: result.saleId,
        receiptNo: result.receiptNo,
        method,
        change: isCredit ? 0 : change,
        creditAmount,
        customerName: customer?.name ?? null,
      });
      // Clear down for the next customer in line.
      setCart([]);
      setDiscount(0);
      setMethod("Cash");
      setTendered("");
      setCustomerId(null);
      setPriceType("retail");
      setQuery("");
      setNotice(null);
      setError(null);
      searchRef.current?.focus();
      // Stock just changed, so refresh the figures the next sale is based on.
      router.refresh();
    });
  }

  // Keyboard shortcuts for a cashier at a keyboard: F2 search, F4 cash
  // received, F9 complete the sale. Off while the unknown-barcode prompt is up.
  const onShortcut = useEffectEvent((e: KeyboardEvent) => {
    if (unknownCode || weighing || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "F2") {
      e.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    } else if (e.key === "F4") {
      e.preventDefault();
      if (method !== "Cash") selectMethod("Cash");
      // The cash field appears once Cash is selected; focus it after render.
      setTimeout(() => {
        cashRef.current?.focus();
        cashRef.current?.select();
      }, 0);
    } else if (e.key === "F9") {
      e.preventDefault();
      if (canPay && !pending) checkout();
    }
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onShortcut(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  // A weighed line counts as one item, whatever it weighs.
  const itemCount = cart.reduce((n, l) => n + (isWeighed(l) ? 1 : l.qty), 0);
  const wholesale = priceType === "wholesale";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_25rem]">
      {/* Product picker */}
      <section className={`min-w-0 ${cart.length > 0 ? "pb-16 lg:pb-0" : ""}`}>
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
              } else if (e.key === "Escape" && query) {
                e.preventDefault();
                setQuery("");
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
                <span className="mt-2 flex flex-wrap items-center justify-between gap-x-2">
                  <span className="font-semibold tabular-nums text-ink">
                    {wholesale && hasWholesale(p) ? (
                      <>
                        {formatCurrency(p.wholesale_price!)}
                        <span className="text-xs font-normal text-muted"> / {p.pack_name}</span>
                      </>
                    ) : (
                      <>
                        {formatCurrency(p.srp)}
                        {p.unit === "kg" && <span className="text-xs font-normal text-muted"> / kg</span>}
                      </>
                    )}
                  </span>
                  <span className={`whitespace-nowrap text-xs ${out ? "font-medium text-red-600" : "text-muted"}`}>
                    {out ? "Out of stock" : `${formatQty(p.stock_qty)}${unitSuffix(p.unit)} in stock`}
                  </span>
                </span>
                {wholesale && hasWholesale(p) && (
                  <span className="mt-0.5 text-xs text-muted">{packLabel(p.pack_name!, p.pack_size!)}</span>
                )}
              </button>
            );
          })}
          {results.length === 0 && (
            <p className="col-span-full py-10 text-center text-sm text-muted">No matching products.</p>
          )}
        </div>
      </section>

      {/* Order summary */}
      <aside id="pos-cart" className="flex h-fit scroll-mt-28 flex-col rounded-lg border border-line bg-surface shadow-sm lg:sticky lg:top-[calc(var(--banner-h)+1.5rem)]">
        {lastSale && (
          <div role="status" className="animate-slide-down rounded-t-lg border-b border-emerald-200 bg-emerald-50 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-emerald-900">Sale complete</p>
                <p className="text-xs text-emerald-800">Receipt {lastSale.receiptNo}</p>
              </div>
              <button
                type="button"
                onClick={() => setLastSale(null)}
                aria-label="Dismiss"
                className="-mr-2 -mt-1 rounded p-1.5 text-emerald-700 transition hover:bg-emerald-100"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            {lastSale.method === "Cash" && lastSale.change > 0.004 && (
              <p className="mt-2 flex items-baseline gap-2 text-emerald-900">
                <span className="text-sm">Give change</span>
                <span className="text-2xl font-bold tabular-nums">{formatCurrency(lastSale.change)}</span>
              </p>
            )}
            {lastSale.creditAmount > 0.004 && (
              <p className="mt-2 text-sm text-emerald-900">
                <strong className="tabular-nums">{formatCurrency(lastSale.creditAmount)}</strong> charged to{" "}
                {lastSale.customerName}&apos;s account.
              </p>
            )}
            <p className="mt-2 text-xs text-emerald-800">
              Ready for the next customer ·{" "}
              <Link href={`/sales/${lastSale.saleId}`} className="font-medium underline">
                Open receipt
              </Link>
            </p>
          </div>
        )}
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
        <div className="border-b border-line px-5 py-3">
          <div role="radiogroup" aria-label="Price type" className="grid grid-cols-2 gap-1 rounded-md bg-slate-100 p-1">
            {(["retail", "wholesale"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={priceType === t}
                onClick={() => choosePriceType(t)}
                className={`rounded px-3 py-1.5 text-sm font-medium transition ${
                  priceType === t ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"
                }`}
              >
                {t === "retail" ? "Retail" : "Wholesale"}
              </button>
            ))}
          </div>
          {wholesale && (
            <p className="mt-2 text-xs text-muted">
              Products with a wholesale pack are sold by the pack at the wholesale price; others at their SRP.
            </p>
          )}
        </div>

        <div className="max-h-[36vh] divide-y divide-line overflow-y-auto">
          {cart.length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-muted">Scan or select a product to start a sale.</p>
          )}
          {cart.map((l) => {
            const list = listPrice(l.product, l.byPack);
            const changed = Math.abs(l.unitPrice - list) > 0.004;
            const packable = hasWholesale(l.product);
            const weighed = isWeighed(l);
            const kg = l.product.unit === "kg";
            return (
              <div key={lineKey(l)} className="animate-slide-in px-5 py-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex items-center gap-2.5 text-sm font-medium text-ink">
                    <ProductThumb product={l.product} className="h-9 w-9" textClass="text-[10px]" />
                    <span>
                      {l.product.name}
                      {packable && (
                        <span className="mt-0.5 flex items-center gap-1 text-xs font-normal">
                          {[false, true].map((byPack) => (
                            <button
                              key={String(byPack)}
                              type="button"
                              onClick={() => setCart((prev) => switchUnit(prev, l, byPack))}
                              className={`rounded px-1.5 py-0.5 transition ${
                                l.byPack === byPack ? "bg-brand-soft font-medium text-brand" : "text-muted hover:text-ink"
                              }`}
                            >
                              {byPack ? `By ${l.product.pack_name}` : kg ? "By kg" : "By piece"}
                            </button>
                          ))}
                          {l.byPack && (
                            <span className="text-muted">
                              · {packLabel(l.product.pack_name!, l.product.pack_size!)} = {formatQty(piecesOf(l))} {kg ? "kg" : "pcs"}
                            </span>
                          )}
                        </span>
                      )}
                    </span>
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
                  {weighed ? (
                    <span className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0.001}
                        step="0.001"
                        inputMode="decimal"
                        aria-label={`Weight of ${l.product.name} in kg`}
                        value={l.qty}
                        onChange={(e) => updateLine(l, { qty: round3(Math.max(0, Number(e.target.value) || 0)) })}
                        className={`w-20 rounded-md border px-2 py-1 text-sm tabular-nums ${
                          l.qty <= 0 || l.qty > maxQty(l) + 0.0005 ? "border-red-400 bg-red-50" : "border-line"
                        }`}
                      />
                      <span className="text-xs text-muted">kg</span>
                    </span>
                  ) : (
                  <div className="flex items-center rounded-md border border-line">
                    <button
                      type="button"
                      aria-label="Decrease quantity"
                      className="px-2.5 py-1 text-muted hover:text-ink"
                      onClick={() => updateLine(l, { qty: Math.max(1, l.qty - 1) })}
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-sm tabular-nums">{formatQty(l.qty)}</span>
                    <button
                      type="button"
                      aria-label="Increase quantity"
                      className="px-2.5 py-1 text-muted hover:text-ink"
                      onClick={() => updateLine(l, { qty: Math.max(l.qty, Math.min(maxQty(l), l.qty + 1)) })}
                    >
                      +
                    </button>
                  </div>
                  )}
                  <span className="text-xs text-muted">at ₱</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    aria-label={l.byPack ? `Price per ${l.product.pack_name}` : weighed ? "Price per kg" : "Unit price"}
                    value={l.unitPrice}
                    onChange={(e) => updateLine(l, { unitPrice: Number(e.target.value) })}
                    className={`w-20 rounded-md border px-2 py-1 text-sm tabular-nums transition-colors duration-200 ${
                      changed ? "border-amber-400 bg-amber-50" : "border-line"
                    }`}
                  />
                  {l.byPack && <span className="text-xs text-muted">/ {l.product.pack_name}</span>}
                  {weighed && <span className="text-xs text-muted">/ kg</span>}
                  <span className="ml-auto text-sm font-semibold tabular-nums">
                    {formatCurrency(l.unitPrice * l.qty)}
                  </span>
                </div>
                {changed && (
                  <div className="mt-1.5 flex animate-slide-down items-center gap-2 text-xs text-amber-800">
                    <Badge tone="warn">{l.byPack ? "Not wholesale price" : "Not SRP"}</Badge>
                    {l.byPack
                      ? `Wholesale is ${formatCurrency(list)} / ${l.product.pack_name}.`
                      : `SRP is ${formatCurrency(list)}${weighed ? " / kg" : ""}.`}
                    <button type="button" className="underline" onClick={() => updateLine(l, { unitPrice: list })}>
                      {l.byPack ? "Use wholesale price" : "Use SRP"}
                    </button>
                  </div>
                )}
                {weighed && l.qty > maxQty(l) + 0.0005 && (
                  <p className="mt-1.5 text-xs text-red-600">Only {formatQty(Math.max(0, maxQty(l)))} kg in stock.</p>
                )}
              </div>
            );
          })}
        </div>

        <div className="space-y-3 border-t border-line px-5 py-4">
          {overrides > 0 && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {overrides} item{overrides > 1 ? "s are" : " is"} priced differently from the{" "}
              {wholesale ? "SRP or wholesale price" : "SRP"}. This will be recorded in the Audit Log.
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
                <label className={labelCls} htmlFor="pos-cash">
                  Cash received
                </label>
                <input
                  id="pos-cash"
                  ref={cashRef}
                  type="number"
                  inputMode="decimal"
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
          <p className="hidden text-center text-xs text-muted lg:block">
            Shortcuts: <Kbd>F2</Kbd> search · <Kbd>F4</Kbd> cash received · <Kbd>F9</Kbd> complete sale · <Kbd>Esc</Kbd> clear search
          </p>
        </div>
      </aside>

      {/* Phones: the order panel sits below the products, so keep the total in
          reach with a button that jumps down to it. */}
      {cart.length > 0 && (
        <a
          href="#pos-cart"
          className="fixed inset-x-4 bottom-4 z-20 flex animate-slide-down items-center justify-between rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white shadow-lg active:scale-[0.98] lg:hidden print:hidden"
        >
          <span>
            View sale · {formatQty(itemCount)} item{itemCount === 1 ? "" : "s"}
          </span>
          <span className="tabular-nums">{formatCurrency(total)}</span>
        </a>
      )}

      {unknownCode && (
        <UnknownBarcodeModal
          code={unknownCode}
          products={products}
          onClose={() => setUnknownCode(null)}
          onAttached={(product) => {
            if (addProduct(product, unknownCode)) setNotice({ tone: "ok", text: `Registered barcode and added ${product.name}` });
            setUnknownCode(null);
            setQuery("");
            router.refresh();
          }}
        />
      )}

      {weighing && (
        <WeightModal
          product={weighing.product}
          inStock={round3(
            weighing.product.stock_qty -
              cart.filter((l) => l.product.id === weighing.product.id).reduce((n, l) => n + piecesOf(l), 0)
          )}
          onClose={() => {
            setWeighing(null);
            searchRef.current?.focus();
          }}
          onAdd={(kg) => {
            const { product, barcode } = weighing;
            setWeighing(null);
            addProduct(product, barcode, kg);
            setNotice({ tone: "ok", text: `Added ${formatQty(kg)} kg ${product.name}` });
            setQuery("");
            searchRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}

// Weight prompt for a product sold by the kilo: type what the scale shows,
// or the peso amount the customer wants (it works out the kg).
function WeightModal({
  product,
  inStock,
  onClose,
  onAdd,
}: {
  product: PosProduct;
  inStock: number;
  onClose: () => void;
  onAdd: (kg: number) => void;
}) {
  const [mode, setMode] = useState<"kg" | "amount">("kg");
  const [value, setValue] = useState("");
  const n = Number(value);
  const kg = !value || !(n > 0) ? 0 : mode === "kg" ? round3(n) : product.srp > 0 ? round3(n / product.srp) : 0;
  const total = round2(kg * product.srp);
  const tooMuch = kg > inStock + 0.0005;
  const ok = kg > 0 && !tooMuch;

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-slate-900/50 p-4">
      <DialogPanel label={`Weigh ${product.name}`} className="w-full max-w-sm animate-scale-in rounded-lg bg-surface p-6 shadow-xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (ok) onAdd(kg);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
        >
          <div className="flex items-center gap-3">
            <ProductThumb product={product} className="h-12 w-12" textClass="text-xs" />
            <div>
              <h2 className="text-lg font-semibold leading-tight">{product.name}</h2>
              <p className="text-sm text-muted">
                {formatCurrency(product.srp)} / kg · {formatQty(Math.max(0, inStock))} kg in stock
              </p>
            </div>
          </div>
          <div role="radiogroup" aria-label="Enter by" className="mt-4 grid grid-cols-2 gap-1 rounded-md bg-slate-100 p-1 text-sm">
            {(["kg", "amount"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => {
                  setMode(m);
                  setValue("");
                }}
                className={`rounded px-3 py-1.5 transition ${mode === m ? "bg-surface font-medium text-ink shadow-sm" : "text-muted hover:text-ink"}`}
              >
                {m === "kg" ? "Weight (kg)" : "Amount (₱)"}
              </button>
            ))}
          </div>
          <label className={`${labelCls} mt-4`} htmlFor="weigh-value">
            {mode === "kg" ? "Weight from the scale" : "How much the customer wants to buy"}
          </label>
          <div className="relative">
            <input
              id="weigh-value"
              key={mode}
              autoFocus
              type="number"
              inputMode="decimal"
              min={0}
              step={mode === "kg" ? "0.001" : "0.01"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={mode === "kg" ? "e.g. 0.350" : "e.g. 50.00"}
              className={`${inputCls} pr-12 text-lg tabular-nums`}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">
              {mode === "kg" ? "kg" : "₱"}
            </span>
          </div>
          <p className="mt-3 min-h-5 text-sm tabular-nums" aria-live="polite">
            {kg > 0 &&
              (tooMuch ? (
                <span className="text-red-600">Only {formatQty(Math.max(0, inStock))} kg in stock.</span>
              ) : (
                <>
                  {formatQty(kg)} kg × {formatCurrency(product.srp)} ={" "}
                  <span className="font-semibold text-ink">{formatCurrency(total)}</span>
                </>
              ))}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={onClose} className={btnSecondary}>
              Cancel
            </button>
            <button type="submit" disabled={!ok} className={btnPrimary}>
              Add to sale
            </button>
          </div>
        </form>
      </DialogPanel>
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
      <DialogPanel label="Barcode not registered" className="w-full max-w-md animate-scale-in rounded-lg bg-surface p-6 shadow-xl">
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
      </DialogPanel>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-line bg-slate-50 px-1 py-px font-mono text-[10px] text-ink">{children}</kbd>;
}
