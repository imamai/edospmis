import Link from "next/link";
import { requireSession, can } from "@/lib/data/session";
import { getAnalytics } from "@/lib/data/analytics";
import { resolvePeriod } from "@/lib/report-period";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PeriodFilterSuspended } from "@/components/ui/period-filter-suspended";
import { StageDurationsChart, SlaComplianceChart, SpendByCategoryChart, SupplierSpendChart } from "@/components/charts/report-charts";
import { STAGE_LABEL } from "@/lib/stage-labels";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const session = await requireSession();
  if (!can(session, "reports.view")) {
    return (
      <div className="empty-frame mx-auto max-w-md px-6 py-10 text-center text-sm text-ink-faint">
        You don&rsquo;t have permission to view analytics in this workspace.
      </div>
    );
  }

  const sp = await searchParams;
  const period = resolvePeriod(sp);
  const data = await getAnalytics(session.tenant.id, { from: period.from, to: period.to });
  const ownersByStage = new Map(data.stageOwners.map((o) => [o.stage_key, o.role_names]));

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Analytics</h1>
        <p className="mt-1 text-sm text-ink-faint">
          Where time and money actually go, visualized — over {period.label.toLowerCase()}. Looking for a specific downloadable
          report instead? Try{" "}
          <Link href="/app/reports" className="text-brand hover:underline">
            Reports
          </Link>
          .
        </p>
      </div>

      <PeriodFilterSuspended activeKey={period.key} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card interactive>
          <CardHeader title="Time in each stage" subtitle="Average time spent per stage, across every case" />
          <CardBody>
            <StageDurationsChart
              height={280}
              data={[...data.stageDurations]
                .sort((a, b) => b.avg_minutes - a.avg_minutes)
                .map((s) => ({ stage_key: s.stage_key, label: STAGE_LABEL[s.stage_key] ?? s.stage_key, avg_minutes: s.avg_minutes }))}
            />
            <div className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Typically handled by</p>
              {[...data.stageDurations]
                .sort((a, b) => b.avg_minutes - a.avg_minutes)
                .map((s) => {
                  const roles = ownersByStage.get(s.stage_key) ?? [];
                  return (
                    <div key={s.stage_key} className="flex items-center gap-1.5 text-xs">
                      <span className="w-24 shrink-0 text-ink-soft">{STAGE_LABEL[s.stage_key] ?? s.stage_key}</span>
                      <span className="truncate text-ink-faint">{roles.length === 0 ? "—" : roles.join(", ")}</span>
                    </div>
                  );
                })}
            </div>
          </CardBody>
        </Card>

        <Card interactive>
          <CardHeader title="Approval SLA compliance" subtitle="On-time vs breached, per stage" />
          <CardBody>
            <SlaComplianceChart
              height={280}
              data={data.slaCompliance.map((s) => ({ stage_key: s.stage_key, label: STAGE_LABEL[s.stage_key] ?? s.stage_key, on_time: s.on_time, breached: s.breached }))}
            />
          </CardBody>
        </Card>

        <Card interactive>
          <CardHeader title="Spend by category" subtitle="Estimated cost share of every request" />
          <CardBody>
            <SpendByCategoryChart
              height={280}
              data={data.spendByCategory.map((c) => ({ category_name: c.category_name, total_estimated_cents: c.total_estimated_cents }))}
            />
          </CardBody>
        </Card>

        <Card interactive>
          <CardHeader title="Top suppliers by spend" subtitle="Where procurement money is actually going" />
          <CardBody>
            <SupplierSpendChart height={280} data={data.supplierPerformance.map((s) => ({ supplier_name: s.supplier_name, total_cents: s.total_cents }))} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
