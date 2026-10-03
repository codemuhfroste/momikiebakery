// Product list in and out of Excel: the downloadable template (pre-filled
// with the current products, so it doubles as a bulk editor) and the import
// that reads it back. Import is two steps — plan (preview what will change)
// then apply — and the file is re-read for the second step, so nothing is
// trusted from the browser in between.
import ExcelJS from "exceljs";
import { readBatch, runBatch, stmt, type Statement } from "./db";
import { auditStmt } from "./audit";
import { ensureCategory } from "./categories";
import { normalizeBarcode } from "./barcode";
import { round2 } from "./format";
import type { Actor } from "./checkout";
import type { Category, Product } from "./types";
import { GOLD, NAVY, addBanner, addSubtext, addTable, newWorkbook, stamp, styleDataRow } from "./excel";

const COLUMNS = [
  { key: "name", header: "Product name", required: true },
  { key: "category", header: "Category" },
  { key: "barcode", header: "Barcode" },
  { key: "sku", header: "SKU / item code" },
  { key: "srp", header: "SRP (₱)", required: true },
  { key: "cost", header: "Cost (₱)" },
  { key: "qty", header: "Quantity on hand" },
  { key: "reorder", header: "Reorder level" },
  { key: "active", header: "Active (Yes/No)" },
] as const;
type Key = (typeof COLUMNS)[number]["key"];
const BLANK_ROWS = 200;
const MAX_ROWS = 3000;

// ------------------------------------------------------------- template

export async function buildTemplate(products: Product[], categories: Category[], who: string): Promise<ExcelJS.Workbook> {
  const wb = newWorkbook();
  const span = COLUMNS.length;
  const sheet = wb.addWorksheet("Products", { properties: { tabColor: { argb: NAVY } } });
  addBanner(sheet, "Momikie's General Merchandise — Product list", span);
  addSubtext(
    sheet,
    `Edit or add rows below, save, then upload on Products → Import from Excel. Bold headings are required. ` +
      `Generated ${stamp()} by ${who}. See the "How to use" sheet.`,
    span
  );
  const rows = [...products]
    .sort((a, b) => (a.category_name ?? "~").localeCompare(b.category_name ?? "~") || a.name.localeCompare(b.name))
    .map((p) => [p.name, p.category_name, p.barcode, p.sku, p.srp, p.cost, p.stock_qty, p.reorder_level, p.is_active ? "Yes" : "No"]);
  // Room to type new products straight under the existing ones.
  for (let i = 0; i < BLANK_ROWS; i++) rows.push([null, null, null, null, null, null, null, null, null]);
  const headerRow = addTable(
    sheet,
    COLUMNS.map((c) => ({
      header: c.header,
      kind: c.key === "srp" || c.key === "cost" ? ("peso" as const) : c.key === "qty" || c.key === "reorder" ? ("qty" as const) : undefined,
      width: c.key === "name" ? 34 : c.key === "category" ? 22 : c.key === "barcode" ? 18 : undefined,
    })),
    rows,
    { filter: false }
  );
  // Required headings in bold navy text with a gold underline.
  COLUMNS.forEach((c, i) => {
    if ("required" in c && c.required) {
      const cell = sheet.getRow(headerRow).getCell(i + 1);
      cell.font = { bold: true, color: { argb: NAVY } };
      cell.border = { ...cell.border, bottom: { style: "medium", color: { argb: GOLD } } };
    }
  });
  // Barcodes are codes, not numbers (keeps leading zeros, no 4.8E+12).
  sheet.getColumn(3).numFmt = "@";
  sheet.getColumn(4).numFmt = "@";

  // Dropdowns: categories (typing a new one is allowed) and Yes/No.
  const lists = wb.addWorksheet("Lists", { state: "veryHidden" });
  categories.forEach((c, i) => (lists.getCell(i + 1, 1).value = c.name));
  const first = headerRow + 1;
  const last = headerRow + rows.length;
  for (let r = first; r <= last; r++) {
    if (categories.length) {
      sheet.getCell(r, 2).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`Lists!$A$1:$A$${categories.length}`],
        showErrorMessage: false, // a new category name is fine; it gets created
      };
    }
    sheet.getCell(r, 9).dataValidation = { type: "list", allowBlank: true, formulae: ['"Yes,No"'] };
    for (const col of [5, 6, 7, 8]) {
      sheet.getCell(r, col).dataValidation = {
        type: "decimal",
        operator: "greaterThanOrEqual",
        formulae: [0],
        allowBlank: true,
        showErrorMessage: true,
        errorTitle: "Numbers only",
        error: "Enter a number of zero or more.",
      };
    }
  }

  // How to use
  const help = wb.addWorksheet("How to use");
  help.getColumn(1).width = 26;
  help.getColumn(2).width = 80;
  addBanner(help, "How to use this sheet", 2);
  addSubtext(help, "Fill in the Products sheet, save the file, then upload it on the website under Products → Import from Excel.", 2);
  help.addRow([]);
  const tips: [string, string][] = [
    ["Product name (required)", "As it should appear at the register, e.g. \"Milo 22g Sachet\"."],
    ["SRP (₱) (required)", "The normal selling price. Changing it for an existing product is recorded in the SRP history and the Audit Log."],
    ["Category", "Pick from the list or type a new one — new categories are created automatically."],
    ["Barcode", "Optional. Type it or scan it into the cell. Must be unique."],
    ["SKU / item code", "Optional. Your own code. Must be unique."],
    ["Cost (₱)", "What one item costs the store. Used for profit figures."],
    ["Quantity on hand", "Used only when ADDING a new product. Stock of existing products is changed on the Inventory page, so re-uploading an old copy of this file never overwrites today's stock."],
    ["Reorder level", "When stock falls to this number the product is marked Low stock."],
    ["Active (Yes/No)", "No hides the product from the register. Blank means Yes."],
    ["Updating products", "A row updates an existing product when its barcode, SKU, or exact name matches. Otherwise it is added as new."],
    ["Before anything is saved", "The website shows a preview of every new, changed and rejected row. Nothing changes until you confirm."],
  ];
  const head = help.addRow(["Column / topic", "What to put"]);
  head.eachCell((c) => {
    c.font = { bold: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  });
  tips.forEach(([a, b], i) => {
    const row = help.addRow([a, b]);
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
    row.getCell(1).font = { bold: true };
    styleDataRow(row, 2, i % 2 === 1);
  });
  return wb;
}

// ------------------------------------------------------------- reading

export interface ImportRow {
  row: number; // spreadsheet row number, for messages
  name: string;
  category: string | null;
  barcode: string | null;
  sku: string | null;
  srp: number | null;
  cost: number | null;
  qty: number | null;
  reorder: number | null;
  active: boolean | null;
}

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "object") {
    if ("result" in v && v.result != null) return String(v.result);
    if ("text" in v && typeof v.text === "string") return v.text;
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if (v instanceof Date) return v.toISOString();
  }
  return String(v).trim();
}

function num(v: ExcelJS.CellValue, allowNegative = false): number | null | "bad" {
  const t = cellText(v).replace(/[₱,\s]/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && (allowNegative || n >= 0) ? n : "bad";
}

export async function readImportFile(buffer: ArrayBuffer): Promise<{ rows: ImportRow[]; errors: string[] }> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    return { rows: [], errors: ["That file couldn't be read. Upload the .xlsx template (Excel or Google Sheets → Download → .xlsx)."] };
  }
  const sheet = wb.getWorksheet("Products") ?? wb.worksheets.find((w) => w.state === "visible");
  if (!sheet) return { rows: [], errors: ["The file has no sheets."] };

  // Find the heading row and map columns by their heading, so reordering or
  // extra columns don't matter.
  let headerRow = 0;
  const colOf = new Map<Key, number>();
  for (let r = 1; r <= Math.min(15, sheet.rowCount); r++) {
    const row = sheet.getRow(r);
    // Index = column number (1-based), like getCell; index 0 stays empty.
    const texts = Array.from({ length: row.cellCount + 1 }, (_, c) => (c ? cellText(row.getCell(c).value).toLowerCase() : ""));
    if (texts.some((t) => t.startsWith("product name"))) {
      headerRow = r;
      COLUMNS.forEach((c) => {
        const want = c.header.toLowerCase().replace(/\s*\(.*\)$/, "");
        const idx = texts.findIndex((t) => t.replace(/\s*\(.*\)$/, "").trim() === want);
        if (idx > 0) colOf.set(c.key, idx);
      });
      break;
    }
  }
  if (!headerRow) return { rows: [], errors: ['Couldn\'t find the "Product name" heading. Use the downloaded template.'] };
  if (!colOf.has("srp")) return { rows: [], errors: ['Couldn\'t find the "SRP (₱)" column.'] };

  const rows: ImportRow[] = [];
  const errors: string[] = [];
  for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const get = (k: Key) => (colOf.has(k) ? row.getCell(colOf.get(k)!).value : null);
    const name = cellText(get("name")).replace(/\s+/g, " ");
    const others = (["category", "barcode", "sku", "srp", "cost", "qty", "reorder"] as Key[]).some((k) => cellText(get(k)) !== "");
    if (!name && !others) continue; // blank row
    if (rows.length + errors.length >= MAX_ROWS) {
      errors.push(`Only the first ${MAX_ROWS} rows are read; split bigger lists into several files.`);
      break;
    }
    const srp = num(get("srp"));
    const cost = num(get("cost"));
    // Stock can be below zero (mobile sales while offline); the column is
    // only used for new products, which are checked in planImport.
    const qty = num(get("qty"), true);
    const reorder = num(get("reorder"));
    const problems: string[] = [];
    if (!name) problems.push("product name is empty");
    if (name.length > 80) problems.push("product name is too long");
    if (srp === null) problems.push("SRP is empty");
    for (const [label, v] of [["SRP", srp], ["Cost", cost], ["Quantity", qty], ["Reorder level", reorder]] as const) {
      if (v === "bad") problems.push(`${label} isn't a number of zero or more`);
    }
    const activeText = cellText(get("active")).toLowerCase();
    if (activeText && !["yes", "no", "y", "n", "true", "false", "1", "0"].includes(activeText)) problems.push('Active must be "Yes" or "No"');
    if (problems.length) {
      errors.push(`Row ${r}${name ? ` (${name})` : ""}: ${problems.join("; ")}.`);
      continue;
    }
    const barcode = cellText(get("barcode"));
    const sku = cellText(get("sku"));
    rows.push({
      row: r,
      name,
      category: cellText(get("category")).replace(/\s+/g, " ") || null,
      barcode: barcode ? normalizeBarcode(barcode) : null,
      sku: sku || null,
      srp: srp === null || srp === "bad" ? null : round2(srp),
      cost: cost === null || cost === "bad" ? null : round2(cost),
      qty: qty === null || qty === "bad" ? null : qty,
      reorder: reorder === null || reorder === "bad" ? null : reorder,
      active: activeText ? ["yes", "y", "true", "1"].includes(activeText) : null,
    });
  }
  return { rows, errors };
}

// ------------------------------------------------------------- planning

export interface PlannedChange {
  row: number;
  name: string;
  action: "add" | "update" | "same";
  productId?: number;
  changes: string[]; // human-readable, for the preview
}

export interface ImportPlan {
  changes: PlannedChange[];
  errors: string[];
  newCategories: string[];
}

const lc = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

export async function planImport(rows: ImportRow[], fileErrors: string[]): Promise<ImportPlan> {
  const [products, categories] = await readBatch<[Product[], Category[]]>([
    stmt`SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id`,
    stmt`SELECT id, name FROM categories`,
  ]);
  const byBarcode = new Map(products.filter((p) => p.barcode).map((p) => [p.barcode!, p]));
  const bySku = new Map(products.filter((p) => p.sku).map((p) => [lc(p.sku), p]));
  const byName = new Map(products.map((p) => [lc(p.name), p]));
  const knownCats = new Set(categories.map((c) => lc(c.name)));

  const errors = [...fileErrors];
  const changes: PlannedChange[] = [];
  const newCategories = new Map<string, string>();
  const seen = { barcode: new Map<string, number>(), sku: new Map<string, number>(), name: new Map<string, number>() };
  const claimed = new Map<number, number>(); // productId -> row

  for (const r of rows) {
    // Duplicates inside the file itself.
    const dup =
      (r.barcode && seen.barcode.get(r.barcode)) ||
      (r.sku && seen.sku.get(lc(r.sku))) ||
      seen.name.get(lc(r.name));
    if (dup) {
      errors.push(`Row ${r.row} (${r.name}): same product as row ${dup} (barcode, SKU or name repeated).`);
      continue;
    }
    // Exact name first, so a mistyped barcode on an existing row is caught
    // below instead of silently renaming the product that owns that barcode.
    const match = byName.get(lc(r.name)) || (r.barcode && byBarcode.get(r.barcode)) || (r.sku && bySku.get(lc(r.sku)));
    if (match && claimed.has(match.id)) {
      errors.push(`Row ${r.row} (${r.name}): matches the same product as row ${claimed.get(match.id)}.`);
      continue;
    }
    // A barcode/SKU that belongs to a different product than the one matched.
    const barcodeOwner = r.barcode ? byBarcode.get(r.barcode) : undefined;
    const skuOwner = r.sku ? bySku.get(lc(r.sku)) : undefined;
    if (barcodeOwner && match && barcodeOwner.id !== match.id) {
      errors.push(`Row ${r.row} (${r.name}): barcode ${r.barcode} already belongs to ${barcodeOwner.name}.`);
      continue;
    }
    if (skuOwner && match && skuOwner.id !== match.id) {
      errors.push(`Row ${r.row} (${r.name}): SKU ${r.sku} already belongs to ${skuOwner.name}.`);
      continue;
    }
    if (!match && r.qty != null && r.qty < 0) {
      errors.push(`Row ${r.row} (${r.name}): a new product can't start with negative stock.`);
      continue;
    }
    // The row is good: later rows repeating its barcode, SKU or name are duplicates.
    if (r.barcode) seen.barcode.set(r.barcode, r.row);
    if (r.sku) seen.sku.set(lc(r.sku), r.row);
    seen.name.set(lc(r.name), r.row);
    if (r.category && !knownCats.has(lc(r.category))) newCategories.set(lc(r.category), r.category);

    if (!match) {
      changes.push({
        row: r.row,
        name: r.name,
        action: "add",
        changes: [
          `SRP ₱${r.srp!.toFixed(2)}`,
          ...(r.category ? [r.category] : []),
          ...(r.qty ? [`${r.qty} on hand`] : []),
          ...(r.barcode ? [`barcode ${r.barcode}`] : []),
        ],
      });
      continue;
    }
    claimed.set(match.id, r.row);
    const diff: string[] = [];
    if (r.name !== match.name) diff.push(`name → ${r.name}`);
    if (r.srp != null && Math.abs(r.srp - match.srp) > 0.004) diff.push(`SRP ₱${match.srp.toFixed(2)} → ₱${r.srp.toFixed(2)}`);
    if (r.cost != null && Math.abs(r.cost - match.cost) > 0.004) diff.push(`cost ₱${match.cost.toFixed(2)} → ₱${r.cost.toFixed(2)}`);
    if (r.category != null && lc(r.category) !== lc(match.category_name)) diff.push(`category → ${r.category}`);
    if (r.barcode && r.barcode !== match.barcode) diff.push(`barcode → ${r.barcode}`);
    if (r.sku && r.sku !== match.sku) diff.push(`SKU → ${r.sku}`);
    if (r.reorder != null && Math.abs(r.reorder - match.reorder_level) > 0.0001) diff.push(`reorder level → ${r.reorder}`);
    if (r.active != null && r.active !== !!match.is_active) diff.push(r.active ? "re-activated" : "deactivated");
    changes.push({ row: r.row, name: r.name, action: diff.length ? "update" : "same", productId: match.id, changes: diff });
  }
  return { changes, errors, newCategories: [...newCategories.values()] };
}

// ------------------------------------------------------------- applying

export async function applyImport(actor: Actor, rows: ImportRow[], plan: ImportPlan): Promise<{ added: number; updated: number }> {
  const byRow = new Map(rows.map((r) => [r.row, r]));
  const [products] = await readBatch<[Product[]]>([stmt`SELECT * FROM products`]);
  const byId = new Map(products.map((p) => [p.id, p]));
  const who = { actorName: actor.name, actorRole: actor.role };
  let added = 0;
  let updated = 0;

  const work = plan.changes.filter((c) => c.action !== "same");
  // A few dozen rows per batch keeps each request small and quick.
  for (let i = 0; i < work.length; i += 40) {
    const batch: Statement[] = [];
    for (const c of work.slice(i, i + 40)) {
      const r = byRow.get(c.row)!;
      const cat = r.category ? ensureCategory(r.category) : null;
      if (cat && "error" in cat) continue;
      if (cat) batch.push(...cat.statements);
      const catSql = cat ? cat.idSql : { sql: "NULL", args: [] as unknown[] };
      if (c.action === "add") {
        batch.push(
          {
            sql: `INSERT INTO products (name, category_id, barcode, sku, srp, cost, stock_qty, reorder_level, is_active)
                  VALUES (?, ${catSql.sql}, ?, ?, ?, ?, ?, ?, ?)`,
            args: [r.name, ...catSql.args, r.barcode, r.sku, r.srp, r.cost ?? 0, r.qty ?? 0, r.reorder ?? 0, r.active === false ? 0 : 1],
          },
          stmt`INSERT INTO price_history (product_id, old_srp, new_srp, actor_name) VALUES (last_insert_rowid(), ${null}, ${r.srp}, ${actor.name})`
        );
        if ((r.qty ?? 0) > 0) {
          batch.push(stmt`INSERT INTO stock_movements (product_id, change_qty, reason, note, actor_name)
                          SELECT product_id, ${r.qty}, 'restock', 'Opening stock (Excel import)', ${actor.name}
                          FROM price_history WHERE id = last_insert_rowid()`);
        }
        added++;
      } else {
        const p = byId.get(c.productId!)!;
        const srp = r.srp ?? p.srp;
        batch.push({
          sql: `UPDATE products SET name = ?, category_id = ${r.category != null ? catSql.sql : "category_id"},
                  barcode = ?, sku = ?, srp = ?, cost = ?, reorder_level = ?, is_active = ?,
                  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                WHERE id = ?`,
          args: [
            r.name,
            ...(r.category != null ? catSql.args : []),
            r.barcode ?? p.barcode,
            r.sku ?? p.sku,
            srp,
            r.cost ?? p.cost,
            r.reorder ?? p.reorder_level,
            r.active == null ? p.is_active : r.active ? 1 : 0,
            p.id,
          ],
        });
        if (Math.abs(srp - p.srp) > 0.004) {
          batch.push(
            stmt`INSERT INTO price_history (product_id, old_srp, new_srp, actor_name) VALUES (${p.id}, ${p.srp}, ${srp}, ${actor.name})`,
            auditStmt({
              ...who,
              action: "price.srp_change",
              summary: `SRP of ${r.name} changed ₱${p.srp.toFixed(2)} → ₱${srp.toFixed(2)} (Excel import)`,
              details: { productId: p.id, oldSrp: p.srp, newSrp: srp },
            })
          );
        }
        updated++;
      }
    }
    if (batch.length) await runBatch(batch);
  }
  await runBatch([
    auditStmt({
      ...who,
      action: "product.import",
      summary: `Imported products from Excel: ${added} added, ${updated} updated${plan.newCategories.length ? `, new categories: ${plan.newCategories.join(", ")}` : ""}`,
    }),
  ]);
  return { added, updated };
}
