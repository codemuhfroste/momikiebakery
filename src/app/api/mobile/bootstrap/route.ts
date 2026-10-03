import { readBatch, stmt } from "@/lib/db";
import { json, preflight, withMobileSession } from "@/lib/mobileAuth";

// GET /api/mobile/bootstrap — everything the app keeps on the phone so the
// register works with no connection: products (with stock and SRP), credit
// customers (with balances), and the signed-in person. Re-fetched after each
// successful sync.
export async function GET(request: Request) {
  return withMobileSession(request, async (session) => {
    const [products, customers, [clock]] = await readBatch<
      [Record<string, unknown>[], Record<string, unknown>[], { now: string }[]]
    >([
      stmt`SELECT p.id, p.name, p.sku, p.barcode, p.srp, p.stock_qty, p.reorder_level, p.photo_version,
                  c.name AS category_name
           FROM products p LEFT JOIN categories c ON c.id = p.category_id
           WHERE p.is_active = 1 ORDER BY p.name COLLATE NOCASE`,
      stmt`SELECT c.id, c.name, c.phone, c.credit_limit,
                  COALESCE((SELECT SUM(amount) FROM credit_ledger l WHERE l.customer_id = c.id), 0) AS balance
           FROM customers c WHERE c.is_active = 1 ORDER BY c.name COLLATE NOCASE`,
      stmt`SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AS now`,
    ]);
    return json({
      me: { name: session.name, role: session.role },
      products,
      customers,
      serverTime: clock.now,
    });
  });
}

export const OPTIONS = preflight;
