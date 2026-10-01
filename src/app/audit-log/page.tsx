import Link from "next/link";
import { requireOwnerOrRedirect } from "@/lib/rbac";
import { getAuditLogPage, type AuditFilter } from "@/lib/audit";
import { formatDateTime } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader, Table, Tabs } from "@/components/ui";

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
  "sale.create": { label: "Sale", tone: "neutral" },
  "sale.void": { label: "Sale voided", tone: "bad" },
  "credit.charge": { label: "Credit purchase", tone: "info" },
  "credit.payment": { label: "Credit payment", tone: "good" },
  "credit.void": { label: "Credit reversed", tone: "bad" },
  "credit.limit_change": { label: "Credit limit changed", tone: "warn" },
  "customer.create": { label: "Customer added", tone: "neutral" },
  "customer.update": { label: "Customer edited", tone: "neutral" },
  "stock.adjust": { label: "Stock adjusted", tone: "neutral" },
  "auth.login": { label: "Signed in", tone: "neutral" },
};

export default async function AuditLogPage({ searchParams }: PageProps<"/audit-log">) {
  await requireOwnerOrRedirect();
  const params = await searchParams;
  const filter = FILTERS.find((f) => f.key === params.filter)?.key ?? "all";
  const { entries, page, totalPages, totalCount } = await getAuditLogPage(Number(params.page) || 1, filter);
  const href = (p: number) => `/audit-log?filter=${filter}&page=${p}`;

  return (
    <>
      <PageHeader
        title="Audit Log"
        subtitle="A permanent record of who did what and when. Entries cannot be edited or deleted."
      />
      <Tabs active={filter} tabs={FILTERS.map((f) => ({ ...f, href: `/audit-log?filter=${f.key}` }))} />
      <Card>
        {entries.length === 0 ? (
          <EmptyState>No entries.</EmptyState>
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
