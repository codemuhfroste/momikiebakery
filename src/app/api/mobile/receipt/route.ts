import { getSale } from "@/lib/queries";
import { json, preflight, withMobileSession } from "@/lib/mobileAuth";

// GET /api/mobile/receipt?id=123 — one sale with its lines, so the app can
// print (or reprint) it on the store's receipt printer.
export async function GET(request: Request) {
  return withMobileSession(request, async () => {
    const id = Number(new URL(request.url).searchParams.get("id"));
    const data = Number.isInteger(id) && id > 0 ? await getSale(id) : null;
    if (!data) return json({ error: "Receipt not found." }, 404);
    const { sale, items } = data;
    return json({
      sale: {
        id: sale.id,
        receiptNo: sale.receipt_no,
        createdAt: sale.created_at,
        cashierName: sale.cashier_name,
        customerName: sale.customer_name,
        priceType: sale.price_type ?? "retail",
        subtotal: sale.subtotal,
        discount: sale.discount,
        total: sale.total,
        paymentMethod: sale.payment_method,
        amountTendered: sale.amount_tendered,
        creditAmount: sale.credit_amount,
        voided: sale.voided_at != null,
      },
      items: items.map((i) => ({
        name: i.name,
        qty: i.qty,
        unitPrice: i.unit_price,
        lineTotal: i.line_total,
        packs: i.packs,
        packName: i.pack_name,
        packSize: i.pack_size,
        packPrice: i.pack_price,
      })),
    });
  });
}

export const OPTIONS = preflight;
