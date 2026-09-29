import { requireOwnerOrRedirect } from "@/lib/rbac";
import { getAuditLogPage, type AuditFilter } from "@/lib/audit";
import { formatDateTime } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader, Table, Tabs } from "@/components/ui";

const FILTERS: { key: AuditFilter; label: string }[] = [
  { key: "all", label: "All activity" },
  { key: "price", label: "Price changes" },
  { key: "sales", label: "Sales & voids" },
  { key: "stock", label: "Stock" },
  { key: "auth", label: "Sign-ins" },
];

function actionBadge(action: string) {
  if (action === "price.override") return <Badge tone="warn">Price override</Badge>;
  if (action === "price.srp_change") return <Badge tone="info">SRP change</Badge>;
  if (action === "product.cost_change") return <Badge tone="info">Cost change</Badge>;
  if (action === "sale.void") return <Badge tone="bad">Void</Badge>;
  return <Badge>{action}</Badge>;
}

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
        subtitle="Who did what. “Price changes” shows SRP edits and any sale priced differently from SRP."
      />
      <Tabs
        active={filter}
        tabs={FILTERS.map((f) => ({ ...f, href: `/audit-log?filter=${f.key}` }))}
      />
      <Card>
        {entries.length === 0 ? (
          <EmptyState>No entries.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>When</th>
                <th>Type</th>
                <th>Details</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap text-muted">{formatDateTime(e.created_at)}</td>
                  <td>{actionBadge(e.action)}</td>
                  <td>{e.summary}</td>
                  <td>{e.actor_name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted">
          <span>
            {totalCount} entries · page {page} of {totalPages}
          </span>
          <span className="space-x-3">
            {page > 1 && <a className="text-brand hover:underline" href={href(page - 1)}>← Newer</a>}
            {page < totalPages && <a className="text-brand hover:underline" href={href(page + 1)}>Older →</a>}
          </span>
        </div>
      )}
    </>
  );
}
