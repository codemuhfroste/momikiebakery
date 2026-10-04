import { NextRequest, NextResponse } from "next/server";
import { canManage, getSession } from "@/lib/rbac";
import { getSalesExportRows, getSalesReport } from "@/lib/reports";
import { formatDate, manilaToday } from "@/lib/format";
import { packPlural } from "@/lib/types";
import { addBanner, addSubtext, addTable, manilaExcelDate, newWorkbook, stamp, workbookResponse, type Cell } from "@/lib/excel";

// GET /api/reports/export?from=YYYY-MM-DD&to=YYYY-MM-DD
// The Sales Report as a styled Excel workbook (same look as the RCMS
// exports): a Summary sheet, every Sale, and every Item sold.
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!canManage(session)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const p = request.nextUrl.searchParams;
  const today = manilaToday();
  let to = ISO.test(p.get("to") ?? "") ? p.get("to")! : today;
  let from = ISO.test(p.get("from") ?? "") ? p.get("from")! : to;
  if (from > to) [from, to] = [to, from];

  const [report, sales, items] = await Promise.all([
    getSalesReport(from, to),
    getSalesExportRows(from, to, "sales"),
    getSalesExportRows(from, to, "items"),
  ]);
  const period = from === to ? formatDate(from) : `${formatDate(from)} to ${formatDate(to)}`;
  const wb = newWorkbook();

  // ---- Summary ----
  const sum = wb.addWorksheet("Summary", { properties: { tabColor: { argb: "FF1D3A8A" } } });
  addBanner(sum, "Momikie's General Merchandise — Sales Report", 4);
  addSubtext(sum, `${period} · generated ${stamp()} by ${session.name}`, 4);
  sum.addRow([]);
  const t = report.totals;
  addTable(
    sum,
    [{ header: "Figure" }, { header: "Value", kind: "peso" }],
    [
      ["Total sales", t.revenue],
      ["Cost of items sold", t.cost],
      ["Gross profit", t.revenue - t.cost],
      ["Put on credit (utang)", t.credit],
      ["Discounts given", t.discounts],
    ],
    { freeze: false, filter: false }
  );
  sum.addRow(["Number of sales", t.count]);
  sum.addRow(["Voided sales", t.voids]);
  sum.addRow([]);

  addBanner(sum, "Day by day", 4, 11);
  addTable(
    sum,
    [{ header: "Date" }, { header: "Sales", kind: "int" }, { header: "Amount", kind: "peso" }, { header: "Profit", kind: "peso" }],
    report.byDay.map((d) => [formatDate(d.day), d.count, d.revenue, d.revenue - d.cost]),
    { totals: ["Sales", "Amount", "Profit"], freeze: false, filter: false }
  );
  sum.addRow([]);
  addBanner(sum, "By category", 4, 11);
  addTable(
    sum,
    [{ header: "Category" }, { header: "Items sold", kind: "qty" }, { header: "Amount", kind: "peso" }, { header: "Profit", kind: "peso" }],
    report.byCategory.map((c) => [c.category, c.qty, c.revenue, c.revenue - c.cost]),
    { totals: ["Items sold", "Amount", "Profit"], freeze: false, filter: false }
  );
  sum.addRow([]);
  addBanner(sum, "By payment method", 4, 11);
  addTable(
    sum,
    [{ header: "Method" }, { header: "Sales", kind: "int" }, { header: "Amount", kind: "peso" }],
    report.byMethod.map((m) => [m.method === "Credit" ? "Credit (utang)" : m.method, m.count, m.total]),
    { totals: ["Sales", "Amount"], freeze: false, filter: false }
  );
  sum.addRow([]);
  addBanner(sum, "Retail and wholesale", 4, 11);
  addTable(
    sum,
    [{ header: "Type" }, { header: "Sales", kind: "int" }, { header: "Amount", kind: "peso" }, { header: "Profit", kind: "peso" }],
    report.byPriceType.map((t) => [t.type === "wholesale" ? "Wholesale" : "Retail", t.count, t.revenue, t.revenue - t.cost]),
    { totals: ["Sales", "Amount", "Profit"], freeze: false, filter: false }
  );
  sum.addRow([]);
  addBanner(sum, "Best sellers (top 15)", 4, 11);
  addTable(
    sum,
    [{ header: "Product" }, { header: "Sold", kind: "qty" }, { header: "Amount", kind: "peso" }, { header: "Profit", kind: "peso" }],
    report.topProducts.map((x) => [x.name, x.qty, x.revenue, x.revenue - x.cost]),
    { freeze: false, filter: false }
  );
  sum.getColumn(1).width = Math.max(sum.getColumn(1).width ?? 0, 28);

  // ---- Sales ----
  const ss = wb.addWorksheet("Sales");
  const salesCols = [
    { header: "Receipt" }, { header: "Date & time", kind: "date" as const }, { header: "Cashier" }, { header: "Customer" },
    { header: "Retail / wholesale" }, { header: "Payment" }, { header: "Items", width: 48 }, { header: "Subtotal", kind: "peso" as const },
    { header: "Discount", kind: "peso" as const }, { header: "Total", kind: "peso" as const },
    { header: "Paid now", kind: "peso" as const }, { header: "On credit", kind: "peso" as const },
    { header: "Status" }, { header: "Void reason" }, { header: "Source" }, { header: "Note" },
  ];
  addBanner(ss, `Sales — ${period}`, salesCols.length);
  addSubtext(ss, "One row per sale. Voided sales are listed but not counted in the totals row.", salesCols.length);
  addTable(
    ss,
    salesCols,
    sales.map((r): Cell[] => [
      r.receipt_no as string, manilaExcelDate(r.created_at as string), r.cashier_name as string, r.customer as string,
      r.price_type === "wholesale" ? "Wholesale" : "Retail", r.payment_method as string, r.items as string, r.subtotal as number, r.discount as number,
      r.voided_at ? null : (r.total as number), r.amount_tendered as number, r.voided_at ? null : (r.credit_amount as number),
      r.voided_at ? "Voided" : "Completed", r.void_reason as string, r.source === "mobile" ? "Mobile app" : "Website", r.sync_note as string,
    ]),
    { totals: ["Total", "On credit"] }
  );

  // ---- Items sold ----
  const is = wb.addWorksheet("Items sold");
  const itemCols = [
    { header: "Receipt" }, { header: "Date & time", kind: "date" as const }, { header: "Product", width: 32 }, { header: "Category" },
    { header: "Barcode" }, { header: "Sold as" }, { header: "Qty (pieces)", kind: "qty" as const },
    { header: "List price", kind: "peso" as const }, { header: "Price charged", kind: "peso" as const }, { header: "Line total", kind: "peso" as const },
    { header: "Cost", kind: "peso" as const }, { header: "Profit", kind: "peso" as const }, { header: "Status" },
  ];
  addBanner(is, `Items sold — ${period}`, itemCols.length);
  addSubtext(is, "One row per item on every receipt. Use the filter buttons to look at one product or category.", itemCols.length);
  addTable(
    is,
    itemCols,
    items.map((r): Cell[] => {
      const line = Number(r.line_total);
      const cost = Number(r.unit_cost) * Number(r.qty);
      return [
        r.receipt_no as string, manilaExcelDate(r.created_at as string), r.name as string, r.category as string,
        r.barcode as string,
        r.packs != null ? `${r.packs} ${packPlural(String(r.pack_name), Number(r.packs))} of ${r.pack_size}` : "Piece",
        Number(r.qty),
        // Per pack for a pack line, per piece otherwise.
        r.packs != null ? Number(r.srp) * Number(r.pack_size) : Number(r.srp),
        r.packs != null ? Number(r.pack_price) : Number(r.unit_price),
        r.voided_at ? null : line,
        r.voided_at ? null : cost, r.voided_at ? null : Math.round((line - cost) * 100) / 100, r.voided_at ? "Voided" : "",
      ];
    }),
    { totals: ["Qty (pieces)", "Line total", "Cost", "Profit"] }
  );

  const name = `momikie-sales-${from}${from === to ? "" : `-to-${to}`}.xlsx`;
  return workbookResponse(wb, name);
}
