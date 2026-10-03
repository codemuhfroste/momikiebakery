import { NextRequest, NextResponse } from "next/server";
import { canManage, getSession } from "@/lib/rbac";
import { getSalesExportRows } from "@/lib/reports";
import { manilaToday } from "@/lib/format";

// GET /api/reports/export?from=YYYY-MM-DD&to=YYYY-MM-DD&kind=sales|items
// A CSV that opens directly in Excel (UTF-8 with a BOM so ₱ and ñ show
// correctly). "sales" = one row per sale; "items" = one row per item sold.
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function manila(iso: unknown): [string, string] {
  if (typeof iso !== "string" || !iso) return ["", ""];
  const t = new Date(new Date(iso).getTime() + 8 * 3600_000).toISOString();
  return [t.slice(0, 10), t.slice(11, 16)];
}

function cell(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  // Quote anything with a comma, quote or line break; stop Excel treating a
  // leading = + - @ as a formula.
  const safe = /^[=+\-@]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!canManage(session)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const p = request.nextUrl.searchParams;
  const today = manilaToday();
  const to = ISO.test(p.get("to") ?? "") ? p.get("to")! : today;
  const from = ISO.test(p.get("from") ?? "") ? p.get("from")! : to;
  const kind = p.get("kind") === "items" ? "items" : "sales";
  const rows = await getSalesExportRows(from, to, kind);

  let header: string[];
  let lines: unknown[][];
  if (kind === "items") {
    header = ["Receipt", "Date", "Time", "Product", "Category", "Barcode", "Qty", "SRP", "Price charged", "Line total", "Cost per item", "Profit", "Voided"];
    lines = rows.map((r) => {
      const [date, time] = manila(r.created_at);
      const lineTotal = Number(r.line_total);
      const cost = Number(r.unit_cost) * Number(r.qty);
      return [r.receipt_no, date, time, r.name, r.category, r.barcode, r.qty, r.srp, r.unit_price, lineTotal, r.unit_cost, Math.round((lineTotal - cost) * 100) / 100, r.voided_at ? "Yes" : ""];
    });
  } else {
    header = ["Receipt", "Date", "Time", "Cashier", "Customer", "Payment", "Items", "Subtotal", "Discount", "Total", "Cash/down payment", "On credit", "Voided", "Void reason", "Source", "Note"];
    lines = rows.map((r) => {
      const [date, time] = manila(r.created_at);
      return [r.receipt_no, date, time, r.cashier_name, r.customer, r.payment_method, r.items, r.subtotal, r.discount, r.total, r.amount_tendered, r.credit_amount, r.voided_at ? "Yes" : "", r.void_reason, r.source === "mobile" ? "Mobile app" : "Website", r.sync_note];
    });
  }

  const csv = "﻿" + [header, ...lines].map((l) => l.map(cell).join(",")).join("\r\n") + "\r\n";
  const name = `momikie-${kind}-${from}${from === to ? "" : `-to-${to}`}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
