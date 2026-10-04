// Figures for the Reports pages (end of day, sales over a date range) and
// their CSV exports. Days are Philippine calendar days: created_at is stored
// in UTC, so "+8 hours" turns it into the local date.
import { readBatch, stmt } from "./db";
import { manilaDayRange, round2 } from "./format";
import { INVOICE_THRESHOLD, needsOwnInvoice } from "./invoiceRules";

const MANILA_DAY = `strftime('%Y-%m-%d', created_at, '+8 hours')`;

export function rangeBounds(from: string, to: string): [string, string] {
  return [manilaDayRange(from)[0], manilaDayRange(to)[1]];
}

export interface MethodLine {
  method: string;
  count: number;
  total: number;
}

export interface DaySummary {
  date: string;
  salesCount: number;
  grossSales: number; // non-voided totals
  discounts: number;
  itemsSold: number;
  costOfGoods: number;
  priceOverrides: number;
  byMethod: MethodLine[]; // sales by how they were paid
  creditCharged: number; // put on customers' accounts
  creditDownPayments: number; // cash taken at the counter on credit sales
  creditPayments: MethodLine[]; // payments received toward balances, by method
  voids: { count: number; total: number };
  cashExpected: number; // what should be in the drawer from today's activity
  expensesFromDrawer: number; // cash taken out of the drawer to pay expenses
  expensesTotal: number; // every expense dated today, however paid
  // For the store's BIR-registered invoice booklet (see invoiceRules.ts).
  invoicing: {
    bigSales: { id: number; receipt_no: string; created_at: string; total: number; payment_method: string; customer_name: string | null }[];
    smallCount: number;
    smallTotal: number;
    summaryNeeded: boolean; // the small sales add up to more than the threshold
  };
  firstSaleAt: string | null;
  lastSaleAt: string | null;
}

export async function getDaySummary(date: string): Promise<DaySummary> {
  const [start, end] = manilaDayRange(date);
  const [[totals], byMethod, [credit], payments, [voids]] = await readBatch<
    [
      { n: number; gross: number; discounts: number; first: string | null; last: string | null }[],
      MethodLine[],
      { charged: number; down: number }[],
      MethodLine[],
      { n: number; total: number }[],
    ]
  >([
    stmt`SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS gross, COALESCE(SUM(discount), 0) AS discounts,
                MIN(created_at) AS first, MAX(created_at) AS last
         FROM sales WHERE voided_at IS NULL AND created_at >= ${start} AND created_at < ${end}`,
    stmt`SELECT payment_method AS method, COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
         FROM sales WHERE voided_at IS NULL AND created_at >= ${start} AND created_at < ${end}
         GROUP BY payment_method ORDER BY total DESC`,
    stmt`SELECT COALESCE(SUM(credit_amount), 0) AS charged,
                COALESCE(SUM(CASE WHEN payment_method = 'Credit' THEN amount_tendered ELSE 0 END), 0) AS down
         FROM sales WHERE voided_at IS NULL AND created_at >= ${start} AND created_at < ${end}`,
    stmt`SELECT payment_method AS method, COUNT(*) AS count, COALESCE(-SUM(amount), 0) AS total
         FROM credit_ledger WHERE entry_type = 'payment' AND created_at >= ${start} AND created_at < ${end}
         GROUP BY payment_method ORDER BY total DESC`,
    stmt`SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS total
         FROM sales WHERE voided_at >= ${start} AND voided_at < ${end}`,
  ]);
  const [[items]] = await readBatch<[{ qty: number; cost: number; overrides: number }[]]>([
    stmt`SELECT COALESCE(SUM(CASE WHEN i.unit = 'kg' AND i.packs IS NULL THEN 1 ELSE i.qty END), 0) AS qty, COALESCE(SUM(i.unit_cost * i.qty), 0) AS cost,
                COALESCE(SUM(CASE WHEN ABS(i.unit_price - i.srp) > 0.004 THEN 1 ELSE 0 END), 0) AS overrides
         FROM sale_items i JOIN sales s ON s.id = i.sale_id
         WHERE s.voided_at IS NULL AND s.created_at >= ${start} AND s.created_at < ${end}`,
  ]);

  const [[spent]] = await readBatch<[{ total: number; drawer: number }[]]>([
    stmt`SELECT COALESCE(SUM(amount), 0) AS total, COALESCE(SUM(CASE WHEN from_drawer = 1 THEN amount ELSE 0 END), 0) AS drawer
         FROM expenses WHERE spent_on = ${date}`,
  ]);

  const [daySales] = await readBatch<[DaySummary["invoicing"]["bigSales"]]>([
    stmt`SELECT s.id, s.receipt_no, s.created_at, s.total, s.payment_method, c.name AS customer_name
         FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
         WHERE s.voided_at IS NULL AND s.created_at >= ${start} AND s.created_at < ${end}
         ORDER BY s.created_at`,
  ]);
  const bigSales = daySales.filter((x) => needsOwnInvoice(x.total));
  const small = daySales.filter((x) => !needsOwnInvoice(x.total));
  const smallTotal = round2(small.reduce((t, x) => t + x.total, 0));

  const cashSales = byMethod.find((m) => m.method === "Cash")?.total ?? 0;
  const cashPayments = payments.find((m) => m.method === "Cash")?.total ?? 0;
  return {
    date,
    salesCount: totals.n,
    grossSales: round2(totals.gross),
    discounts: round2(totals.discounts),
    itemsSold: items.qty,
    costOfGoods: round2(items.cost),
    priceOverrides: items.overrides,
    byMethod,
    creditCharged: round2(credit.charged),
    creditDownPayments: round2(credit.down),
    creditPayments: payments,
    voids: { count: voids.n, total: round2(voids.total) },
    // Cash sales are recorded at their total (change already handed back),
    // plus cash taken as credit down payments and cash credit payments,
    // less cash taken out of the drawer to pay expenses.
    cashExpected: round2(cashSales + credit.down + cashPayments - spent.drawer),
    expensesFromDrawer: round2(spent.drawer),
    expensesTotal: round2(spent.total),
    invoicing: {
      bigSales,
      smallCount: small.length,
      smallTotal,
      summaryNeeded: smallTotal > INVOICE_THRESHOLD + 0.004,
    },
    firstSaleAt: totals.first,
    lastSaleAt: totals.last,
  };
}

export interface SalesReport {
  from: string;
  to: string;
  totals: { count: number; revenue: number; cost: number; discounts: number; credit: number; voids: number };
  byDay: { day: string; count: number; revenue: number; cost: number }[];
  byMethod: MethodLine[];
  byPriceType: { type: "retail" | "wholesale"; count: number; revenue: number; cost: number }[];
  byCategory: { category: string; qty: number; revenue: number; cost: number }[];
  topProducts: { name: string; qty: number; revenue: number; cost: number }[];
  expenses: { total: number; count: number; byCategory: { category: string; count: number; total: number }[] };
}

export async function getSalesReport(from: string, to: string): Promise<SalesReport> {
  const [start, end] = rangeBounds(from, to);
  const [[totals], [voids], byDay, byMethod, byCategory, topProducts] = await readBatch<
    [
      { count: number; revenue: number; discounts: number; credit: number }[],
      { n: number }[],
      { day: string; count: number; revenue: number }[],
      MethodLine[],
      { category: string; qty: number; revenue: number; cost: number }[],
      { name: string; qty: number; revenue: number; cost: number }[],
    ]
  >([
    stmt`SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS revenue, COALESCE(SUM(discount), 0) AS discounts,
                COALESCE(SUM(credit_amount), 0) AS credit
         FROM sales WHERE voided_at IS NULL AND created_at >= ${start} AND created_at < ${end}`,
    stmt`SELECT COUNT(*) AS n FROM sales WHERE voided_at IS NOT NULL AND created_at >= ${start} AND created_at < ${end}`,
    {
      sql: `SELECT ${MANILA_DAY} AS day, COUNT(*) AS count, COALESCE(SUM(total), 0) AS revenue
            FROM sales WHERE voided_at IS NULL AND created_at >= ? AND created_at < ?
            GROUP BY day ORDER BY day`,
      args: [start, end],
    },
    stmt`SELECT payment_method AS method, COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
         FROM sales WHERE voided_at IS NULL AND created_at >= ${start} AND created_at < ${end}
         GROUP BY payment_method ORDER BY total DESC`,
    stmt`SELECT COALESCE(c.name, 'Uncategorized') AS category, SUM(i.qty) AS qty,
                SUM(i.line_total) AS revenue, SUM(i.unit_cost * i.qty) AS cost
         FROM sale_items i JOIN sales s ON s.id = i.sale_id
         LEFT JOIN products p ON p.id = i.product_id LEFT JOIN categories c ON c.id = p.category_id
         WHERE s.voided_at IS NULL AND s.created_at >= ${start} AND s.created_at < ${end}
         GROUP BY category ORDER BY revenue DESC`,
    stmt`SELECT i.name, SUM(i.qty) AS qty, SUM(i.line_total) AS revenue, SUM(i.unit_cost * i.qty) AS cost
         FROM sale_items i JOIN sales s ON s.id = i.sale_id
         WHERE s.voided_at IS NULL AND s.created_at >= ${start} AND s.created_at < ${end}
         GROUP BY i.name ORDER BY revenue DESC LIMIT 15`,
  ]);
  // Cost per day needs the line items; done separately to keep the day query simple.
  const [dayCost] = await readBatch<[{ day: string; cost: number }[]]>([
    {
      sql: `SELECT strftime('%Y-%m-%d', s.created_at, '+8 hours') AS day, SUM(i.unit_cost * i.qty) AS cost
            FROM sale_items i JOIN sales s ON s.id = i.sale_id
            WHERE s.voided_at IS NULL AND s.created_at >= ? AND s.created_at < ?
            GROUP BY day`,
      args: [start, end],
    },
  ]);
  const costByDay = new Map(dayCost.map((d) => [d.day, d.cost]));
  const cost = dayCost.reduce((s, d) => s + d.cost, 0);
  // Retail vs wholesale.
  const [byPriceType] = await readBatch<[SalesReport["byPriceType"]]>([
    stmt`SELECT COALESCE(s.price_type, 'retail') AS type, COUNT(*) AS count, COALESCE(SUM(s.total), 0) AS revenue,
                COALESCE(SUM((SELECT SUM(i.unit_cost * i.qty) FROM sale_items i WHERE i.sale_id = s.id)), 0) AS cost
         FROM sales s WHERE s.voided_at IS NULL AND s.created_at >= ${start} AND s.created_at < ${end}
         GROUP BY type ORDER BY type DESC`,
  ]);

  const [[spent], spentByCategory] = await readBatch<
    [{ total: number; count: number }[], { category: string; count: number; total: number }[]]
  >([
    stmt`SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count FROM expenses WHERE spent_on >= ${from} AND spent_on <= ${to}`,
    stmt`SELECT category, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total
         FROM expenses WHERE spent_on >= ${from} AND spent_on <= ${to} GROUP BY category ORDER BY total DESC`,
  ]);

  return {
    from,
    to,
    expenses: {
      total: round2(spent.total),
      count: spent.count,
      byCategory: spentByCategory.map((c) => ({ ...c, total: round2(c.total) })),
    },
    totals: {
      count: totals.count,
      revenue: round2(totals.revenue),
      cost: round2(cost),
      discounts: round2(totals.discounts),
      credit: round2(totals.credit),
      voids: voids.n,
    },
    byDay: byDay.map((d) => ({ ...d, cost: round2(costByDay.get(d.day) ?? 0) })),
    byMethod,
    byPriceType: byPriceType.map((t) => ({ ...t, revenue: round2(t.revenue), cost: round2(t.cost) })),
    byCategory,
    topProducts,
  };
}

// Rows for the CSV export: one per sale, or one per item sold.
export async function getSalesExportRows(from: string, to: string, kind: "sales" | "items") {
  const [start, end] = rangeBounds(from, to);
  if (kind === "items") {
    const [rows] = await readBatch<[Record<string, unknown>[]]>([
      stmt`SELECT s.receipt_no, s.created_at, s.voided_at, i.name, COALESCE(c.name, 'Uncategorized') AS category,
                  i.barcode, i.qty, i.srp, i.unit_price, i.line_total, i.unit_cost,
                  i.packs, i.pack_name, i.pack_size, i.pack_price, i.unit, s.price_type
           FROM sale_items i JOIN sales s ON s.id = i.sale_id
           LEFT JOIN products p ON p.id = i.product_id LEFT JOIN categories c ON c.id = p.category_id
           WHERE s.created_at >= ${start} AND s.created_at < ${end}
           ORDER BY s.created_at, s.id, i.id`,
    ]);
    return rows;
  }
  const [rows] = await readBatch<[Record<string, unknown>[]]>([
    stmt`SELECT s.receipt_no, s.created_at, s.cashier_name, cu.name AS customer, s.payment_method,
                s.subtotal, s.discount, s.total, s.amount_tendered, s.credit_amount, s.voided_at, s.void_reason,
                s.source, s.sync_note, s.price_type,
                (SELECT GROUP_CONCAT(CASE WHEN packs IS NOT NULL THEN printf('%g %s x %s', packs, pack_name, name)
                                          WHEN unit = 'kg' THEN printf('%g kg %s', qty, name)
                                          ELSE printf('%g x %s', qty, name) END, '; ')
                 FROM sale_items WHERE sale_id = s.id) AS items
         FROM sales s LEFT JOIN customers cu ON cu.id = s.customer_id
         WHERE s.created_at >= ${start} AND s.created_at < ${end}
         ORDER BY s.created_at, s.id`,
  ]);
  return rows;
}

// Fills in days with no sales so the axis is continuous.
export function fillDays(from: string, to: string, rows: { day: string; revenue: number; count: number }[]): { day: string; revenue: number; count: number }[] {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const out: { day: string; revenue: number; count: number }[] = [];
  for (let t = new Date(`${from}T00:00:00Z`); t <= new Date(`${to}T00:00:00Z`); t = new Date(t.getTime() + 86400_000)) {
    const day = t.toISOString().slice(0, 10);
    const r = byDay.get(day);
    out.push({ day, revenue: r?.revenue ?? 0, count: r?.count ?? 0 });
  }
  return out;
}
