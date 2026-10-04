import { processCheckout } from "@/lib/checkout";
import { recordCreditPayment } from "@/lib/credit";
import { json, preflight, withMobileSession } from "@/lib/mobileAuth";
import { CREDIT_PAYMENT_METHODS, PAYMENT_METHODS, type CreditPaymentMethod, type PaymentMethod } from "@/lib/types";

// POST /api/mobile/sync — the app's outbox: sales and credit payments made on
// the phone (often while offline), sent once there is a connection.
//
// Each item carries a clientUuid made on the phone. Recording is idempotent:
// if the connection drops after the server saved an item but before the
// phone heard back, the phone re-sends it and gets the same receipt back
// instead of a second sale. Items are processed in the order sent (oldest
// first) and each gets its own result, so one problem doesn't hold up the
// rest:
//   { status: "ok", receiptNo, saleId, note }   recorded (note = owner should check something)
//   { status: "rejected", error }               can't be recorded as sent — the phone keeps it
//                                               and shows it for someone to sort out
const MAX_ITEMS = 200;
const UUID = /^[A-Za-z0-9-]{8,64}$/;

interface SaleIn {
  clientUuid?: unknown;
  recordedAt?: unknown;
  // packs set = sold by the pack (wholesale): unitPrice and srp are per pack.
  items?: { productId?: unknown; qty?: unknown; packs?: unknown; unitPrice?: unknown; srp?: unknown; barcode?: unknown }[];
  priceType?: unknown;
  discount?: unknown;
  paymentMethod?: unknown;
  amountTendered?: unknown;
  customerId?: unknown;
}

interface PaymentIn {
  clientUuid?: unknown;
  recordedAt?: unknown;
  customerId?: unknown;
  amount?: unknown;
  method?: unknown;
  note?: unknown;
}

export async function POST(request: Request) {
  return withMobileSession(request, async (session) => {
    const body = (await request.json().catch(() => null)) as { sales?: SaleIn[]; payments?: PaymentIn[] } | null;
    const sales = Array.isArray(body?.sales) ? body.sales : [];
    const payments = Array.isArray(body?.payments) ? body.payments : [];
    if (sales.length + payments.length > MAX_ITEMS) {
      return json({ error: `Send at most ${MAX_ITEMS} items at a time.` }, 413);
    }

    const saleResults = [];
    for (const s of sales) {
      const clientUuid = String(s.clientUuid ?? "");
      if (!UUID.test(clientUuid)) {
        saleResults.push({ clientUuid, status: "rejected", error: "Missing or invalid id." });
        continue;
      }
      const method = String(s.paymentMethod ?? "") as PaymentMethod;
      if (!PAYMENT_METHODS.includes(method)) {
        saleResults.push({ clientUuid, status: "rejected", error: "Unknown payment method." });
        continue;
      }
      const items = Array.isArray(s.items) ? s.items : [];
      const deviceSrp: Record<string, number> = {};
      const deviceWholesale: Record<string, number> = {};
      for (const i of items) {
        if (!Number.isFinite(Number(i.srp))) continue;
        (i.packs == null ? deviceSrp : deviceWholesale)[String(i.productId)] = Number(i.srp);
      }

      const result = await processCheckout(session, {
        items: items.map((i) => ({
          productId: Number(i.productId),
          qty: Number(i.qty),
          packs: i.packs == null ? null : Number(i.packs),
          unitPrice: Number(i.unitPrice),
          barcode: typeof i.barcode === "string" ? i.barcode : null,
        })),
        priceType: s.priceType === "wholesale" ? "wholesale" : s.priceType === "retail" ? "retail" : undefined,
        discount: Number(s.discount) || 0,
        paymentMethod: method,
        amountTendered: Number(s.amountTendered) || 0,
        customerId: s.customerId == null ? null : Number(s.customerId),
        offline: { clientUuid, recordedAt: String(s.recordedAt ?? ""), deviceSrp, deviceWholesale },
      });
      saleResults.push(
        "error" in result
          ? { clientUuid, status: "rejected", error: result.error }
          : { clientUuid, status: "ok", saleId: result.saleId, receiptNo: result.receiptNo, note: result.note ?? null }
      );
    }

    const paymentResults = [];
    for (const p of payments) {
      const clientUuid = String(p.clientUuid ?? "");
      if (!UUID.test(clientUuid)) {
        paymentResults.push({ clientUuid, status: "rejected", error: "Missing or invalid id." });
        continue;
      }
      const method = String(p.method ?? "") as CreditPaymentMethod;
      if (!CREDIT_PAYMENT_METHODS.includes(method)) {
        paymentResults.push({ clientUuid, status: "rejected", error: "Unknown payment method." });
        continue;
      }
      const result = await recordCreditPayment(
        session,
        Number(p.customerId),
        Number(p.amount),
        method,
        [], // the app doesn't pick receipts: applied to the oldest unpaid ones
        typeof p.note === "string" ? p.note : null,
        { clientUuid, recordedAt: String(p.recordedAt ?? "") }
      );
      paymentResults.push(
        result.error ? { clientUuid, status: "rejected", error: result.error } : { clientUuid, status: "ok", message: result.ok }
      );
    }

    return json({ sales: saleResults, payments: paymentResults });
  });
}

export const OPTIONS = preflight;
