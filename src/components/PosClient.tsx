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
import { Badge, btnPrimary, btnSecondary, inputCls, labelCls } from "./ui";

export interface PosProduct {
  id: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  category_name: string | null;
  srp: number;
  stock_qty: number;
}

interface CartLine {
  product: PosProduct;
  qty: number;
  unitPrice: number;
  barcode: string | null;
}

export default function PosClient({ products }: { products: PosProduct[] }) {
  const router = useRouter();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [discount, setDiscount] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>("Cash");
  const [tendered, setTendered] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [unknownCode, setUnknownCode] = useState<string | null>(null);
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
      setNotice({ tone: "err", text: "Tap a product from the list." });
    }
  }
  useBarcodeScanner(handleCode);

  const subtotal = round2(cart.reduce((s, l) => s + l.unitPrice * l.qty, 0));
  const discountValue = Math.min(Math.max(discount || 0, 0), subtotal);
  const total = round2(subtotal - discountValue);
  const tenderedValue = method === "Cash" ? Number(tendered) || 0 : total;
  const change = round2(tenderedValue - total);
  const canPay = cart.length > 0 && tenderedValue >= total;
  const overrides = cart.filter((l) => Math.abs(l.unitPrice - l.product.srp) > 0.004).length;

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
      });
      if ("error" in result) setError(result.error);
      else router.push(`/sales/${result.saleId}?new=1`);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
      {/* Product picker */}
      <section className="min-w-0">
        <div className="mb-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSearchEnter();
              }
            }}
            placeholder="Search by name, or scan a barcode…"
            autoFocus
            ref={searchRef}
            className={`${inputCls} py-3 text-base`}
          />
          <div className="mt-2 h-5 text-sm">
            {notice && (
              <span className={notice.tone === "ok" ? "text-emerald-700" : "text-red-600"}>
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
                className="flex flex-col rounded-2xl border border-line bg-surface p-3 text-left shadow-sm transition hover:border-brand hover:shadow disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="text-xs text-muted">{p.category_name ?? "Uncategorized"}</span>
                <span className="mt-0.5 line-clamp-2 min-h-10 text-sm font-medium text-ink">{p.name}</span>
                <span className="mt-2 flex items-center justify-between">
                  <span className="font-semibold text-brand">{formatCurrency(p.srp)}</span>
                  <span className={`text-xs ${out ? "text-red-600" : "text-muted"}`}>
                    {out ? "Out" : `${formatQty(p.stock_qty)} left`}
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

      {/* Cart */}
      <aside className="flex h-fit flex-col rounded-2xl border border-line bg-surface shadow-sm lg:sticky lg:top-8">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-semibold text-ink">Current sale</h2>
          {cart.length > 0 && (
            <button type="button" onClick={() => setCart([])} className="text-sm text-muted hover:text-red-600">
              Clear
            </button>
          )}
        </div>

        <div className="max-h-[42vh] divide-y divide-line overflow-y-auto">
          {cart.length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-muted">Scan or tap an item to begin.</p>
          )}
          {cart.map((l) => {
            const changed = Math.abs(l.unitPrice - l.product.srp) > 0.004;
            return (
              <div key={l.product.id} className="px-5 py-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium text-ink">{l.product.name}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${l.product.name}`}
                    onClick={() => setCart((prev) => prev.filter((x) => x !== l))}
                    className="text-muted hover:text-red-600"
                  >
                    ×
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex items-center rounded-lg border border-line">
                    <button
                      type="button"
                      className="px-2 py-1 text-muted hover:text-ink"
                      onClick={() => updateLine(l.product.id, { qty: Math.max(1, l.qty - 1) })}
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-sm">{formatQty(l.qty)}</span>
                    <button
                      type="button"
                      className="px-2 py-1 text-muted hover:text-ink"
                      onClick={() => updateLine(l.product.id, { qty: Math.min(l.product.stock_qty, l.qty + 1) })}
                    >
                      +
                    </button>
                  </div>
                  <span className="text-muted">×</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={l.unitPrice}
                    onChange={(e) => updateLine(l.product.id, { unitPrice: Number(e.target.value) })}
                    className={`w-24 rounded-lg border px-2 py-1 text-sm ${
                      changed ? "border-amber-400 bg-amber-50" : "border-line"
                    }`}
                  />
                  <span className="ml-auto text-sm font-semibold">{formatCurrency(l.unitPrice * l.qty)}</span>
                </div>
                {changed && (
                  <div className="mt-1.5 flex items-center gap-2 text-xs text-amber-700">
                    <Badge tone="warn">Price override</Badge>
                    SRP {formatCurrency(l.product.srp)} ·{" "}
                    <button
                      type="button"
                      className="underline"
                      onClick={() => updateLine(l.product.id, { unitPrice: l.product.srp })}
                    >
                      reset
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="space-y-3 border-t border-line px-5 py-4">
          {overrides > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {overrides} line{overrides > 1 ? "s are" : " is"} priced differently from SRP. This will be
              recorded in the audit log.
            </p>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-muted">Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted">Discount (₱)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={discount || ""}
              onChange={(e) => setDiscount(Number(e.target.value))}
              className="w-28 rounded-lg border border-line px-2 py-1 text-right text-sm"
            />
          </div>
          <div className="flex justify-between text-xl font-semibold text-ink">
            <span>Total</span>
            <span>{formatCurrency(total)}</span>
          </div>

          <div>
            <span className={labelCls}>Payment</span>
            <div className="grid grid-cols-4 gap-1.5">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
                    method === m
                      ? "border-brand bg-brand text-white"
                      : "border-line bg-white text-ink hover:bg-brand-soft"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {method === "Cash" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Tendered</label>
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
                <div className={`py-2 text-lg font-semibold ${change < 0 ? "text-red-600" : "text-emerald-700"}`}>
                  {formatCurrency(Math.max(change, 0))}
                </div>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button type="button" disabled={!canPay || pending} onClick={checkout} className={`${btnPrimary} w-full py-3 text-base`}>
            {pending ? "Processing…" : `Charge ${formatCurrency(total)}`}
          </button>
          {method === "Cash" && (
            <button type="button" className={`${btnSecondary} w-full`} onClick={() => setTendered(String(total))}>
              Exact amount
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl">
        <h2 className="text-lg font-semibold">Barcode not registered</h2>
        <p className="mt-1 text-sm text-muted">
          <span className="font-mono text-ink">{code}</span> isn&apos;t linked to a product yet. Link it to an
          existing product, or add a new one.
        </p>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search product to link…"
          className={`${inputCls} mt-4`}
        />
        <ul className="mt-2 max-h-56 divide-y divide-line overflow-y-auto rounded-lg border border-line">
          {matches.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() => attach(p)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-brand-soft disabled:opacity-50"
              >
                <span>{p.name}</span>
                <span className="text-xs text-muted">{p.barcode ? "has barcode" : "no barcode"}</span>
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
