import { AlertTriangle, ClipboardList, Inbox, TriangleAlert, Wallet } from "lucide-react";
import { requireSession, can } from "@/lib/data/session";
import { getMyWork } from "@/lib/data/cases";
import { getAnalytics, getRequestsTrend } from "@/lib/data/analytics";
import { resolvePeriod } from "@/lib/report-period";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { PeriodFilterSuspended } from "@/components/ui/period-filter-suspended";
import { RequestsTrendChart, StageDurationsChart, SpendByCategoryChart, SupplierSpendChart } from "@/components/charts/report-charts";
import { STAGE_LABEL } from "@/lib/stage-labels";
import { formatMoney } from "@/lib/utils";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const session = await requireSession();
  if (!can(session, "reports.view")) {
    return (
      <div className="empty-frame mx-auto max-w-md px-6 py-10 text-center text-sm text-ink-faint">
        You don&rsquo;t have permission to view the dashboard in this workspace.
      </div>
    );
  }

  const sp = await searchParams;
  const period = resolvePeriod(sp);
  const roleIds = session.roles.map((r) => r.id);

  const [myWork, data, trend] = await Promise.all([
    getMyWork(session.tenant.id, roleIds),
    getAnalytics(session.tenant.id, { from: period.from, to: period.to }),
    getRequestsTrend(session.tenant.id, { from: period.from, to: period.to }),
  ]);

  const totalSpend = data.spendByCategory.reduce((sum, c) => sum + c.total_estimated_cents, 0);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Dashboard</h1>
        <p className="mt-1 text-sm text-ink-faint">
          {session.tenant.name} at a glance — over {period.label.toLowerCase()}.
        </p>
      </div>

      <PeriodFilterSuspended activeKey={period.key} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Open cases" value={String(data.aging.length)} icon={ClipboardList} tone="brand" />
        <StatCard label="Pending your decision" value={String(myWork.length)} icon={Inbox} tone={myWork.length > 0 ? "attention" : "brand"} />
        <StatCard
          label="At risk of SLA breach"
          value={String(data.slaRisk.length)}
          icon={data.slaRisk.length > 0 ? AlertTriangle : TriangleAlert}
          tone={data.slaRisk.length > 0 ? "critical" : "brand"}
        />
        <StatCard label="Estimated spend, open requests" value={formatMoney(totalSpend)} icon={Wallet} tone="brand" />
      </div>

      <Card interactive>
        <CardHeader title="Requests over time" subtitle="New requests raised, per day" />
        <CardBody>
          <RequestsTrendChart height={240} data={trend} />
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card interactive>
          <CardHeader title="Time in each stage" subtitle="Average time spent per stage" />
          <CardBody>
            <StageDurationsChart
              height={260}
              data={[...data.stageDurations]
                .filter((s) => s.avg_minutes !== null)
                .sort((a, b) => (b.avg_minutes ?? 0) - (a.avg_minutes ?? 0))
                .map((s) => ({ stage_key: s.stage_key, label: STAGE_LABEL[s.stage_key] ?? s.stage_key, avg_minutes: s.avg_minutes ?? 0 }))}
            />
          </CardBody>
        </Card>

        <Card interactive>
          <CardHeader title="Spend by category" subtitle="Estimated cost share of every request" />
          <CardBody>
            <SpendByCategoryChart
              height={260}
              data={data.spendByCategory.map((c) => ({ category_name: c.category_name, total_estimated_cents: c.total_estimated_cents }))}
            />
          </CardBody>
        </Card>
      </div>

      <Card interactive>
        <CardHeader title="Top suppliers by spend" subtitle="Where procurement money is actually going" />
        <CardBody>
          <SupplierSpendChart height={240} data={data.supplierPerformance.map((s) => ({ supplier_name: s.supplier_name, total_cents: s.total_cents }))} />
        </CardBody>
      </Card>
    </div>
  );
}
