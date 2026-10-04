import { listSalesBetween } from "@/lib/queries";
import { manilaDayRange, manilaToday } from "@/lib/format";
import { json, preflight, withMobileSession } from "@/lib/mobileAuth";

// GET /api/mobile/sales?date=YYYY-MM-DD — that day's recorded sales (default
// today, Manila time), for the app's Sales tab alongside its unsynced ones.
export async function GET(request: Request) {
  return withMobileSession(request, async () => {
    const param = new URL(request.url).searchParams.get("date") ?? "";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : manilaToday();
    const [start, end] = manilaDayRange(date);
    const rows = await listSalesBetween(start, end);
    return json({
      date,
      sales: rows.map((s) => ({
        id: s.id,
        receiptNo: s.receipt_no,
        createdAt: s.created_at,
        total: s.total,
        paymentMethod: s.payment_method,
        customerName: s.customer_name,
        creditAmount: s.credit_amount,
        creditPaid: s.credit_paid,
        priceType: s.price_type ?? "retail",
        overrideCount: s.override_count,
        itemCount: s.item_count,
        cashierName: s.cashier_name,
        voided: s.voided_at != null,
        source: s.source ?? "web",
        syncNote: s.sync_note ?? null,
      })),
    });
  });
}

export const OPTIONS = preflight;
