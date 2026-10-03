import Link from "next/link";
import { requireOwnerOrRedirect } from "@/lib/rbac";
import { getAuditLogPage, type AuditFilter } from "@/lib/audit";
import { formatDateTime } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader, Table, Tabs, btnSecondary, inputCls } from "@/components/ui";

const FILTERS: { key: AuditFilter; label: string }[] = [
  { key: "all", label: "All activity" },
  { key: "price", label: "Price changes" },
  { key: "sales", label: "Sales & voids" },
  { key: "credit", label: "Credit" },
  { key: "stock", label: "Stock" },
  { key: "auth", label: "Sign-ins" },
];

const ACTION_LABELS: Record<string, { label: string; tone: "neutral" | "good" | "warn" | "bad" | "info" }> = {
  "price.override": { label: "Sold at other than SRP", tone: "warn" },
  "price.srp_change": { label: "SRP changed", tone: "info" },
  "product.cost_change": { label: "Cost changed", tone: "info" },
  "product.create": { label: "Product added", tone: "neutral" },
  "product.update": { label: "Product edited", tone: "neutral" },
  "product.import": { label: "Excel import", tone: "info" },
  "backup.download": { label: "Backup downloaded", tone: "neutral" },
  "sale.create": { label: "Sale", tone: "neutral" },
  "sale.void": { label: "Sale voided", tone: "bad" },
  "sale.offline_flag": { label: "Mobile sale to check", tone: "warn" },
  "credit.charge": { label: "Credit purchase", tone: "info" },
  "credit.payment": { label: "Credit payment", tone: "good" },
  "credit.void": { label: "Credit reversed", tone: "bad" },
  "credit.limit_change": { label: "Credit limit changed", tone: "warn" },
  "customer.create": { label: "Customer added", tone: "neutral" },
  "customer.update": { label: "Customer edited", tone: "neutral" },
  "stock.adjust": { label: "Stock adjusted", tone: "neutral" },
  "category.create": { label: "Category added", tone: "neutral" },
  "staff.create": { label: "Staff added", tone: "neutral" },
  "staff.update": { label: "Staff changed", tone: "warn" },
  "staff.pin_reset": { label: "Staff PIN changed", tone: "warn" },
  "category.update": { label: "Category renamed", tone: "neutral" },
  "category.delete": { label: "Category deleted", tone: "warn" },
  "auth.login": { label: "Signed in", tone: "neutral" },
};

export default async function AuditLogPage({ searchParams }: PageProps<"/audit-log">) {
  await requireOwnerOrRedirect();
  const params = await searchParams;
  const filter = FILTERS.find((f) => f.key === params.filter)?.key ?? "all";
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const q = str(params.q).trim();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(str(params.from)) ? str(params.from) : "";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(str(params.to)) ? str(params.to) : "";
  const { entries, page, totalPages, totalCount } = await getAuditLogPage(Number(params.page) || 1, filter, { q, from, to });
  // Links keep the search and dates while changing tab or page.
  const link = (f: string, p = 1) => {
    const sp = new URLSearchParams({ filter: f });
    if (q) sp.set("q", q);
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);
    if (p > 1) sp.set("page", String(p));
    return `/audit-log?${sp}`;
  };
  const href = (p: number) => link(filter, p);
  const searching = Boolean(q || from || to);

  return (
    <>
      <PageHeader
        title="Audit Log"
        subtitle="A permanent record of who did what and when. Entries cannot be edited or deleted."
        actions={
          // A plain link: the browser downloads the file. Owner-only, like this page.
          <a href="/api/backup" className={btnSecondary} title="Every sale, product, customer and record in one Excel file">
            Download full backup (Excel)
          </a>
        }
      />
      <form className="mb-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="filter" value={filter} />
        <div className="min-w-[220px] flex-1">
          <label htmlFor="q" className="mb-1 block text-xs font-medium text-muted">
            Search
          </label>
          <input id="q" name="q" defaultValue={q} placeholder="Product, receipt no., customer, person…" className={inputCls} />
        </div>
        <div>
          <label htmlFor="from" className="mb-1 block text-xs font-medium text-muted">
            From
          </label>
          <input id="from" type="date" name="from" defaultValue={from} className={`${inputCls} w-auto`} />
        </div>
        <div>
          <label htmlFor="to" className="mb-1 block text-xs font-medium text-muted">
            To
          </label>
          <input id="to" type="date" name="to" defaultValue={to} className={`${inputCls} w-auto`} />
        </div>
        <button className={btnSecondary}>Search</button>
        {searching && (
          <Link href={`/audit-log?filter=${filter}`} className="pb-2 text-sm text-brand hover:underline">
            Clear
          </Link>
        )}
      </form>
      <Tabs active={filter} tabs={FILTERS.map((f) => ({ ...f, href: link(f.key) }))} />
      <Card>
        {entries.length === 0 ? (
          <EmptyState>{searching ? "No entries match this search." : "No entries."}</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Date &amp; time</th>
                <th>Activity</th>
                <th>Details</th>
                <th>Done by</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const meta = ACTION_LABELS[e.action] ?? { label: e.action, tone: "neutral" as const };
                return (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap text-muted">{formatDateTime(e.created_at)}</td>
                    <td className="whitespace-nowrap">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </td>
                    <td>{e.summary}</td>
                    <td>{e.actor_name ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
      {searching && totalPages <= 1 && entries.length > 0 && (
        <p className="mt-3 text-sm text-muted">{totalCount} matching entries.</p>
      )}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted">
          <span>
            {totalCount} entries · page {page} of {totalPages}
          </span>
          <span className="space-x-4">
            {page > 1 && (
              <Link className="text-brand hover:underline" href={href(page - 1)}>
                ← Newer
              </Link>
            )}
            {page < totalPages && (
              <Link className="text-brand hover:underline" href={href(page + 1)}>
                Older →
              </Link>
            )}
          </span>
        </div>
      )}
    </>
  );
}
