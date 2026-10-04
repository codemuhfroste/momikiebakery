import { createCustomer } from "@/lib/credit";
import { json, preflight, withMobileSession } from "@/lib/mobileAuth";

// POST /api/mobile/customers — adds a credit customer from the tablet app
// (Credit Accounts, or the Register's credit customer picker).
// Body: { name, phone?, address?, notes?, creditLimit? (null = no limit) }.
export async function POST(request: Request) {
  return withMobileSession(request, async (session) => {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return json({ error: "Nothing to save." }, 400);
    const text = (v: unknown) => (typeof v === "string" ? v : "");
    const limit = body.creditLimit == null || body.creditLimit === "" ? null : Number(body.creditLimit);
    const result = await createCustomer(session, {
      name: text(body.name),
      phone: text(body.phone),
      address: text(body.address),
      notes: text(body.notes),
      creditLimit: limit,
      isActive: true,
    });
    if ("error" in result) return json(result, 400);
    return json({ id: result.id });
  });
}

export const OPTIONS = preflight;
