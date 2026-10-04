import { NextResponse } from "next/server";
import { getSession } from "@/lib/rbac";
import { readBatch, runBatch, type Statement } from "@/lib/db";
import { auditStmt } from "@/lib/audit";
import { manilaToday } from "@/lib/format";
import { GOLD, NAVY, addBanner, addSubtext, addTable, manilaExcelDate, newWorkbook, stamp, styleDataRow, workbookResponse, type Cell, type Column } from "@/lib/excel";

// GET /api/backup — owner only. Every record in the database as one Excel
// workbook, a sheet per table, for keeping a copy off the server. Product
// photos (images) and staff PIN hashes are left out.
const TABLES: { table: string; title: string; note: string }[] = [
  { table: "products", title: "Products", note: "Every product, active or not." },
  { table: "categories", title: "Categories", note: "Product categories." },
  { table: "sales", title: "Sales", note: "Every sale, including voided ones (voided_at is filled in)." },
  { table: "sale_items", title: "Sale items", note: "The products on each sale (sale_id links to Sales → id)." },
  { table: "customers", title: "Customers", note: "Credit (utang) customers." },
  { table: "credit_ledger", title: "Credit ledger", note: "Charges (+), payments (−) and reversals per customer. A customer's balance is the sum of amount." },
  { table: "credit_allocations", title: "Credit allocations", note: "Which receipts each credit payment paid off." },
  { table: "stock_movements", title: "Stock movements", note: "Every change to stock: sales, deliveries, spoilage, corrections." },
  { table: "price_history", title: "SRP history", note: "Every SRP set or changed." },
  { table: "expenses", title: "Expenses", note: "Money paid out for the store. from_drawer = 1: cash taken from the register drawer." },
  { table: "staff", title: "Staff", note: "Staff logins. PINs are not included." },
  { table: "audit_log", title: "Audit log", note: "Who did what and when." },
];
const HIDDEN = new Set(["pin_hash", "pin_salt"]);
const MONEY = new Set([
  "srp", "cost", "subtotal", "discount", "total", "amount_tendered", "change_due", "credit_amount", "unit_price",
  "unit_cost", "line_total", "amount", "old_srp", "new_srp", "credit_limit",
]);

type Row = Record<string, unknown>;

export async function GET() {
  const session = await getSession();
  if (session?.role !== "owner") return NextResponse.json({ error: "Only the owner can download a backup." }, { status: 403 });

  const statements: Statement[] = TABLES.flatMap(({ table }) => [
    { sql: `PRAGMA table_info(${table})`, args: [] },
    { sql: `SELECT * FROM ${table} ORDER BY rowid`, args: [] },
  ]);
  const results = await readBatch<Row[][]>(statements);

  const wb = newWorkbook();
  const contents = wb.addWorksheet("Contents", { properties: { tabColor: { argb: GOLD } } });
  addBanner(contents, "Momikie's General Merchandise — Full backup", 3);
  addSubtext(
    contents,
    `Downloaded ${stamp()} by ${session.name}. Times are Philippine time. Keep this file somewhere safe — it holds every sale and customer.`,
    3
  );
  contents.addRow([]);
  const counts: Cell[][] = [];

  TABLES.forEach(({ title, note }, i) => {
    const columns = (results[i * 2] as { name: string }[]).map((c) => c.name).filter((c) => !HIDDEN.has(c));
    const rows = results[i * 2 + 1];
    counts.push([title, rows.length, note]);

    const sheet = wb.addWorksheet(title, { properties: { tabColor: { argb: NAVY } } });
    addBanner(sheet, `${title} (${rows.length.toLocaleString("en-PH")})`, Math.max(columns.length, 2));
    addSubtext(sheet, note, Math.max(columns.length, 2));
    const cols: Column[] = columns.map((c) => ({
      header: c,
      kind: c.endsWith("_at") ? "date" : MONEY.has(c) ? "peso" : undefined,
      width: c === "summary" || c === "details" || c === "note" ? 60 : undefined,
    }));
    addTable(
      sheet,
      cols,
      rows.map((r) => columns.map((c): Cell => (c.endsWith("_at") ? manilaExcelDate(r[c] as string) : (r[c] as Cell)))),
      {}
    );
  });

  // Table of contents with row counts.
  addTable(contents, [{ header: "Sheet" }, { header: "Rows", kind: "int" }, { header: "What it holds", width: 90 }], counts, {
    freeze: false,
    filter: false,
  });
  contents.eachRow((row, n) => {
    if (n > 4) {
      row.getCell(1).value = { text: String(row.getCell(1).value), hyperlink: `#'${row.getCell(1).value}'!A1` };
      row.getCell(1).font = { color: { argb: NAVY }, underline: true };
      styleDataRow(row, 3, n % 2 === 0);
    }
  });

  await runBatch([
    auditStmt({ actorName: session.name, actorRole: session.role, action: "backup.download", summary: "Downloaded a full backup (Excel)" }),
  ]);
  return workbookResponse(wb, `momikie-backup-${manilaToday()}.xlsx`);
}
