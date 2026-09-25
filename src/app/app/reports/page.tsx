import { Download } from "lucide-react";
import { requireSession, can } from "@/lib/data/session";
import { getAnalytics } from "@/lib/data/analytics";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { formatMoney } from "@/lib/utils";

const STAGE_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approval: "Approval",
  approved: "Approved",
  rejected: "Rejected",
  returned: "Returned",
  cancelled: "Cancelled",
  procurement: "Procurement",
  po_approval: "PO Approval",
  awarded: "Awarded",
  receiving: "Receiving",
  finance: "Finance",
  delivery: "Delivery",
  closed: "Completed",
};

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes.toFixed(0)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

export default async function ReportsPage() {
  const session = await requireSession();
  if (!can(session, "reports.view")) {
    return (
      <div className="empty-frame mx-auto max-w-md px-6 py-10 text-center text-sm text-ink-faint">
        You don&rsquo;t have permission to view reports in this workspace.
      </div>
    );
  }

  const data = await getAnalytics(session.tenant.id);
  const totalSpend = data.spendByCategory.reduce((sum, c) => sum + c.total_estimated_cents, 0);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 lg:max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Reports</h1>
          <p className="mt-1 text-sm text-ink-faint">Cycle time, SLA compliance, supplier performance and spend — computed live from every case.</p>
        </div>
        {can(session, "reports.export") && (
          <ButtonLink href="/api/export/invoices" variant="secondary" size="sm">
            <Download className="h-4 w-4" />
            Export invoices (CSV)
          </ButtonLink>
        )}
      </div>

      <Card>
        <CardHeader title="Open requests by age" subtitle={`${data.aging.length} still open`} />
        <CardBody className="overflow-x-auto">
          {data.aging.length === 0 ? (
            <p className="text-sm text-ink-faint">Nothing open right now.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-faint">
                  <th className="pb-2 pr-4 font-medium">Case</th>
                  <th className="pb-2 pr-4 font-medium">Title</th>
                  <th className="pb-2 pr-4 font-medium">Stage</th>
                  <th className="pb-2 pr-4 font-medium">Priority</th>
                  <th className="pb-2 font-medium">Age</th>
                </tr>
              </thead>
              <tbody>
                {data.aging.map((c) => (
                  <tr key={c.case_id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-4 tnum text-ink">{c.case_number}</td>
                    <td className="max-w-xs truncate py-2 pr-4 text-ink-soft">{c.title}</td>
                    <td className="py-2 pr-4">
                      <Badge tone="neutral">{STAGE_LABEL[c.status] ?? c.status}</Badge>
                    </td>
                    <td className="py-2 pr-4 text-ink-soft">{c.priority}</td>
                    <td className="py-2 tnum">
                      <span className={c.days_open > 14 ? "font-semibold text-critical" : c.days_open > 7 ? "font-semibold text-attention" : "text-ink-soft"}>
                        {c.days_open}d
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Time in each stage" subtitle="Average time spent, and how many cases are sitting there right now" />
        <CardBody className="flex flex-col divide-y divide-line">
          {data.stageDurations.length === 0 ? (
            <p className="text-sm text-ink-faint">No cases yet.</p>
          ) : (
            data.stageDurations
              .sort((a, b) => b.avg_minutes - a.avg_minutes)
              .map((s) => (
                <div key={s.stage_key} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                  <p className="text-sm text-ink">{STAGE_LABEL[s.stage_key] ?? s.stage_key}</p>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-ink-faint">{s.cases_seen} case{s.cases_seen === 1 ? "" : "s"} seen</span>
                    {s.currently_in > 0 && <Badge tone="info">{s.currently_in} now here</Badge>}
                    <span className="tnum text-sm font-medium text-ink-soft">{formatMinutes(s.avg_minutes)} avg</span>
                  </div>
                </div>
              ))
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Approval SLA compliance" />
        <CardBody className="flex flex-col divide-y divide-line">
          {data.slaCompliance.length === 0 ? (
            <p className="text-sm text-ink-faint">No completed tasks with an SLA target yet.</p>
          ) : (
            data.slaCompliance.map((s) => {
              const pct = s.total > 0 ? Math.round((s.on_time / s.total) * 100) : 0;
              return (
                <div key={s.stage_key} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                  <p className="text-sm text-ink">{STAGE_LABEL[s.stage_key] ?? s.stage_key}</p>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-ink-faint">{s.on_time}/{s.total} on time</span>
                    <Badge tone={pct >= 90 ? "good" : pct >= 70 ? "attention" : "critical"}>{pct}%</Badge>
                  </div>
                </div>
              );
            })
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Supplier performance" />
        <CardBody className="overflow-x-auto">
          {data.supplierPerformance.length === 0 ? (
            <p className="text-sm text-ink-faint">No purchase orders yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-faint">
                  <th className="pb-2 pr-4 font-medium">Supplier</th>
                  <th className="pb-2 pr-4 font-medium">POs</th>
                  <th className="pb-2 pr-4 font-medium">Spend</th>
                  <th className="pb-2 pr-4 font-medium">Accepted rate</th>
                  <th className="pb-2 font-medium">Avg. lead time</th>
                </tr>
              </thead>
              <tbody>
                {data.supplierPerformance
                  .sort((a, b) => b.total_cents - a.total_cents)
                  .map((s) => {
                    const rate = s.total_items > 0 ? Math.round((s.accepted_items / s.total_items) * 100) : null;
                    return (
                      <tr key={s.supplier_id} className="border-b border-line last:border-0">
                        <td className="py-2 pr-4 text-ink">{s.supplier_name}</td>
                        <td className="py-2 pr-4 tnum text-ink-soft">{s.po_count}</td>
                        <td className="py-2 pr-4 tnum text-ink-soft">{formatMoney(s.total_cents)}</td>
                        <td className="py-2 pr-4">
                          {rate === null ? (
                            <span className="text-xs text-ink-faint">no receipts yet</span>
                          ) : (
                            <Badge tone={rate >= 90 ? "good" : rate >= 70 ? "attention" : "critical"}>{rate}%</Badge>
                          )}
                        </td>
                        <td className="py-2 tnum text-ink-soft">
                          {s.avg_days_award_to_grn === null ? "—" : `${s.avg_days_award_to_grn.toFixed(1)}d`}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Spend by category" />
        <CardBody className="flex flex-col divide-y divide-line">
          {data.spendByCategory.length === 0 ? (
            <p className="text-sm text-ink-faint">No requests yet.</p>
          ) : (
            data.spendByCategory.map((c) => {
              const share = totalSpend > 0 ? Math.round((c.total_estimated_cents / totalSpend) * 100) : 0;
              return (
                <div key={c.category_name} className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <p className="text-ink">
                      {c.category_name} <span className="text-ink-faint">· {c.pr_count} request{c.pr_count === 1 ? "" : "s"}</span>
                    </p>
                    <span className="tnum font-medium text-ink-soft">{formatMoney(c.total_estimated_cents)}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunk">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${share}%` }} />
                  </div>
                </div>
              );
            })
          )}
        </CardBody>
      </Card>
    </div>
  );
}
