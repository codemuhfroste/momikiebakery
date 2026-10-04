import { readBatch, stmt } from "@/lib/db";
import { json, preflight, withMobileSession } from "@/lib/mobileAuth";
import { manilaDayRange, manilaToday } from "@/lib/format";
import { SHOW_DEMO_BANNER } from "@/lib/demo";

// GET /api/mobile/bootstrap — everything the app keeps on the phone so the
// register works with no connection: products (with stock and SRP), credit
// customers (with balances), and the signed-in person. Re-fetched after each
// successful sync.
export async function GET(request: Request) {
  return withMobileSession(request, async (session) => {
    const [start, end] = manilaDayRange(manilaToday());
    const [products, customers, [clock], [today]] = await readBatch<
      [Record<string, unknown>[], Record<string, unknown>[], { now: string }[], { collected: number }[]]
    >([
      stmt`SELECT p.id, p.name, p.sku, p.barcode, p.srp, p.stock_qty, p.reorder_level, p.photo_version,
                  p.pack_name, p.pack_size, p.wholesale_price, p.unit,
                  c.name AS category_name
           FROM products p LEFT JOIN categories c ON c.id = p.category_id
           WHERE p.is_active = 1 ORDER BY p.name COLLATE NOCASE`,
      // Same figures as the website's Credit Accounts table.
      stmt`SELECT c.id, c.name, c.phone, c.address, c.credit_limit,
                  COALESCE((SELECT SUM(amount) FROM credit_ledger l WHERE l.customer_id = c.id), 0) AS balance,
                  (SELECT MAX(created_at) FROM credit_ledger l WHERE l.customer_id = c.id) AS last_activity,
                  (SELECT MIN(s.created_at) FROM sales s
                    WHERE s.customer_id = c.id AND s.credit_amount > 0 AND s.voided_at IS NULL
                      AND s.credit_amount - COALESCE((SELECT SUM(a.amount) FROM credit_allocations a WHERE a.sale_id = s.id), 0) > 0.004
                  ) AS oldest_unpaid
           FROM customers c WHERE c.is_active = 1 ORDER BY c.name COLLATE NOCASE`,
      stmt`SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AS now`,
      stmt`SELECT COALESCE(-SUM(amount), 0) AS collected FROM credit_ledger
           WHERE entry_type = 'payment' AND created_at >= ${start} AND created_at < ${end}`,
    ]);
    return json({
      me: { name: session.name, role: session.role },
      products,
      customers,
      serverTime: clock.now,
      // Lets the app show the same "for demo purposes only" banner as the site.
      demo: SHOW_DEMO_BANNER,
      paymentsToday: today.collected,
    });
  });
}

export const OPTIONS = preflight;
