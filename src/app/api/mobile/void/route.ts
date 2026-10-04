import { processVoid } from "@/lib/checkout";
import { json, preflight, withMobileSession } from "@/lib/mobileAuth";

// POST /api/mobile/void — voids a recorded sale from the tablet app's
// Transactions list. Body: { saleId, reason }. Same rules as the website:
// a reason is required, items go back to stock, a credit charge is reversed,
// and a credit sale that has been (partly) paid can't be voided.
export async function POST(request: Request) {
  return withMobileSession(request, async (session) => {
    const body = (await request.json().catch(() => null)) as { saleId?: unknown; reason?: unknown } | null;
    const saleId = Number(body?.saleId);
    if (!Number.isInteger(saleId) || saleId <= 0) return json({ error: "Sale not found." }, 400);
    const result = await processVoid(session, saleId, typeof body?.reason === "string" ? body.reason : "");
    if (result.error) return json({ error: result.error }, 400);
    return json({ ok: true });
  });
}

export const OPTIONS = preflight;
