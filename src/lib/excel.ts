// Shared look for every Excel file the system produces (sales report, product
// template, backup), modelled on the RCMS cashflow exports: a navy banner
// title, an italic note line, grey bordered column headings, striped rows, a
// double-ruled totals row, peso formatting, and columns sized to their
// content. Colours are Momikie's navy and gold from the website.
import ExcelJS from "exceljs";

export const NAVY = "FF1D3A8A";
export const GOLD = "FFD4A62A";
export const WHITE = "FFFFFFFF";
export const INK = "FF1E293B";
export const MUTED = "FF64748B";
export const HEADER_GRAY = "FFE2E8F0";
export const BORDER_GRAY = "FFCBD5E1";
export const STRIPE_GRAY = "FFF8FAFC";
export const PESO = '"₱"#,##0.00';
export const QTY = "#,##0.##";

export type Cell = string | number | boolean | Date | null | undefined;

export function newWorkbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Momikie's POS";
  wb.created = new Date();
  return wb;
}

export function thinBorder(): Partial<ExcelJS.Borders> {
  const s = { style: "thin" as const, color: { argb: BORDER_GRAY } };
  return { top: s, left: s, bottom: s, right: s };
}

/** Full-width navy title row (sheet title or a section divider). */
export function addBanner(sheet: ExcelJS.Worksheet, text: string, span: number, size = 13) {
  const row = sheet.addRow([text]);
  sheet.mergeCells(row.number, 1, row.number, span);
  const cell = row.getCell(1);
  cell.font = { bold: true, size, color: { argb: WHITE } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  // A thin gold rule under the main title, like the website's accent.
  if (size > 12) cell.border = { bottom: { style: "medium", color: { argb: GOLD } } };
  row.height = size > 12 ? 28 : 20;
  return row;
}

export function addSubtext(sheet: ExcelJS.Worksheet, text: string, span: number) {
  const row = sheet.addRow([text]);
  sheet.mergeCells(row.number, 1, row.number, span);
  row.getCell(1).font = { italic: true, size: 9, color: { argb: MUTED } };
  row.getCell(1).alignment = { wrapText: true, vertical: "top" };
  return row;
}

export function styleHeaderRow(row: ExcelJS.Row, span: number) {
  for (let i = 1; i <= span; i++) {
    const cell = row.getCell(i);
    cell.font = { bold: true, color: { argb: INK } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_GRAY } };
    cell.border = thinBorder();
    cell.alignment = { vertical: "middle", wrapText: true };
  }
  row.height = 20;
}

export function styleDataRow(row: ExcelJS.Row, span: number, stripe: boolean) {
  for (let i = 1; i <= span; i++) {
    const cell = row.getCell(i);
    cell.border = thinBorder();
    cell.alignment = { vertical: "top", ...(cell.alignment ?? {}) };
    if (stripe) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: STRIPE_GRAY } };
  }
}

export function styleTotalRow(row: ExcelJS.Row, span: number) {
  for (let i = 1; i <= span; i++) {
    const cell = row.getCell(i);
    cell.font = { bold: true };
    cell.border = { ...thinBorder(), top: { style: "double", color: { argb: "FF334155" } } };
  }
}

export interface Column {
  header: string;
  /** "peso" and "qty" get number formats; "date" is shown as a date and time. */
  kind?: "text" | "peso" | "qty" | "int" | "date";
  width?: number;
}

function display(value: Cell, kind: Column["kind"]): string {
  if (value == null) return "";
  if (kind === "peso" && typeof value === "number") {
    return `₱${value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (value instanceof Date) return "2026-01-01 12:00 PM";
  return String(value);
}

/**
 * Writes a styled table: heading row, striped data rows, optional totals row
 * (sums of the peso/qty columns named in `totals`), number formats, frozen
 * heading, filter buttons, and content-sized columns. Returns the heading row
 * number.
 */
export function addTable(
  sheet: ExcelJS.Worksheet,
  columns: Column[],
  rows: Cell[][],
  opts: { totals?: string[]; totalLabel?: string; freeze?: boolean; filter?: boolean } = {}
): number {
  const span = columns.length;
  const header = sheet.addRow(columns.map((c) => c.header));
  styleHeaderRow(header, span);
  rows.forEach((values, i) => {
    const row = sheet.addRow(values);
    columns.forEach((c, j) => {
      const cell = row.getCell(j + 1);
      if (c.kind === "peso") cell.numFmt = PESO;
      if (c.kind === "qty") cell.numFmt = QTY;
      if (c.kind === "date") cell.numFmt = "mmm d, yyyy h:mm AM/PM";
    });
    styleDataRow(row, span, i % 2 === 1);
  });
  if (opts.totals?.length && rows.length) {
    const first = header.number + 1;
    const last = header.number + rows.length;
    const values: Cell[] = columns.map((c, j) => {
      if (j === 0) return opts.totalLabel ?? "Total";
      if (!opts.totals!.includes(c.header)) return null;
      const col = sheet.getColumn(j + 1).letter;
      return { formula: `SUM(${col}${first}:${col}${last})` } as unknown as Cell;
    });
    const total = sheet.addRow(values);
    columns.forEach((c, j) => {
      if (c.kind === "peso") total.getCell(j + 1).numFmt = PESO;
      if (c.kind === "qty") total.getCell(j + 1).numFmt = QTY;
    });
    styleTotalRow(total, span);
  }
  // Printing: one page wide (wide tables sideways), as many pages long as needed.
  sheet.pageSetup = { ...sheet.pageSetup, orientation: span > 6 ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  if (opts.freeze !== false) sheet.views = [{ state: "frozen", ySplit: header.number }];
  if (opts.filter !== false && rows.length) {
    sheet.autoFilter = { from: { row: header.number, column: 1 }, to: { row: header.number + rows.length, column: span } };
  }
  // Content-sized columns, measured on the text as Excel will show it.
  columns.forEach((c, j) => {
    let longest = c.header.length;
    for (const r of rows) longest = Math.max(longest, display(r[j], c.kind).length);
    const col = sheet.getColumn(j + 1);
    col.width = Math.max(col.width ?? 0, c.width ?? Math.min(Math.max(longest + 2, 10), 48));
  });
  return header.number;
}

/** Sends a workbook as a download. */
export async function workbookResponse(wb: ExcelJS.Workbook, filename: string): Promise<Response> {
  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** "Oct 3, 2026, 9:15 PM" in Philippine time, for "Generated …" lines. */
export function stamp(d = new Date()): string {
  return d.toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
}

/** A UTC ISO time as a Date that shows Philippine wall-clock time in Excel. */
export function manilaExcelDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t + 8 * 3600_000) : null;
}
