import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight, ListFilter } from "lucide-react";
import { requireSession, can } from "@/lib/data/session";
import { getAnalytics, getStageCases } from "@/lib/data/analytics";
import { getRfqReport, getPurchaseOrderReport, getGoodsReceivedReport, getInvoiceReport } from "@/lib/data/procurement-reports";
import { resolvePeriod } from "@/lib/report-period";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExportLinks } from "@/components/ui/export-links";
import { PeriodFilterSuspended } from "@/components/ui/period-filter-suspended";
import { STAGE_LABEL } from "@/lib/stage-labels";
import { formatMoney, formatDate } from "@/lib/utils";
import { InvoicesTable } from "../invoices-table";
import { PdfLinkButton } from "@/components/ui/pdf-link-button";

const REPORTS = {
  aging: { title: "Open requests by age", subtitle: "Every case still open, oldest first" },
  "stage-durations": { title: "Time in each stage", subtitle: "Average time spent, and how many cases are sitting there right now" },
  "sla-compliance": { title: "Approval SLA compliance", subtitle: "Completed approvals against their SLA target" },
  "supplier-performance": { title: "Supplier performance", subtitle: "Spend, acceptance rate and lead time per supplier" },
  "spend-by-category": { title: "Spend by category", subtitle: "Estimated cost of every request, grouped by category" },
  rfqs: { title: "RFQs & tenders", subtitle: "Every request for quotation raised, who was invited, and how many quoted back" },
  "purchase-orders": { title: "Purchase orders", subtitle: "Every LPO issued, its supplier, value and status" },
  "goods-received": { title: "Goods received", subtitle: "Every GRN raised against a purchase order, inspected or not" },
  invoices: { title: "Invoices & payments", subtitle: "Every invoice submitted, matched, approved or paid" },
} as const;
type ReportKey = keyof typeof REPORTS;
const PROCUREMENT_REPORT_KEYS = ["rfqs", "purchase-orders", "goods-received", "invoices"] as const;
type ProcurementReportKey = (typeof PROCUREMENT_REPORT_KEYS)[number];
function isProcurementReportKey(k: ReportKey): k is ProcurementReportKey {
  return (PROCUREMENT_REPORT_KEYS as readonly string[]).includes(k);
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes.toFixed(0)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

export default async function ReportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ report: string }>;
  searchParams: Promise<{
    period?: string;
    from?: string;
    to?: string;
    q?: string;
    status?: string;
    priority?: string;
    stage?: string;
    dept?: string;
    drillStage?: string;
  }>;
}) {
  const { report } = await params;
  if (!(report in REPORTS)) notFound();
  const key = report as ReportKey;
  const meta = REPORTS[key];

  const session = await requireSession();
  if (!can(session, "reports.view")) {
    return (
      <div className="empty-frame mx-auto max-w-md px-6 py-10 text-center text-sm text-ink-faint">
        You don&rsquo;t have permission to view reports in this workspace.
      </div>
    );
  }

  const sp = await searchParams;
  const period = resolvePeriod(sp);
  const data = await getAnalytics(session.tenant.id, { from: period.from, to: period.to });
  const canExport = can(session, "reports.export");

  const q = (sp.q ?? "").trim().toLowerCase();
  const statusFilter = sp.status ?? "";
  const priorityFilter = sp.priority ?? "";
  const stageFilter = sp.stage ?? "";
  const deptFilter = (sp.dept ?? "").trim();
  const drillStage = key === "stage-durations" ? (sp.drillStage ?? "") : "";
  const drillCases = drillStage ? await getStageCases(session.tenant.id, drillStage, { from: period.from, to: period.to }) : [];

  const reportPeriod = { from: period.from, to: period.to };
  const rfqRows = key === "rfqs" ? await getRfqReport(session.tenant.id, reportPeriod) : [];
  const poRows = key === "purchase-orders" ? await getPurchaseOrderReport(session.tenant.id, reportPeriod) : [];
  const grnRows = key === "goods-received" ? await getGoodsReceivedReport(session.tenant.id, reportPeriod) : [];
  const invoiceRows = key === "invoices" ? await getInvoiceReport(session.tenant.id, reportPeriod) : [];

  const filteredAging = data.aging.filter(
    (c) =>
      (!q || c.case_number.toLowerCase().includes(q) || c.title.toLowerCase().includes(q)) &&
      (!statusFilter || c.status === statusFilter) &&
      (!priorityFilter || c.priority === priorityFilter),
  );
  const filteredSuppliers = data.supplierPerformance.filter((s) => !q || s.supplier_name.toLowerCase().includes(q));
  const filteredCategories = data.spendByCategory.filter((c) => !q || c.category_name.toLowerCase().includes(q));
  const filteredStageDurations = data.stageDurations.filter((s) => !stageFilter || s.stage_key === stageFilter);
  const filteredSlaCompliance = data.slaCompliance.filter((s) => !stageFilter || s.stage_key === stageFilter);
  const stageOwnersByKey = new Map(data.stageOwners.map((o) => [o.stage_key, o.role_names]));
  const totalSpend = filteredCategories.reduce((sum, c) => sum + c.total_estimated_cents, 0);

  const filteredRfqs = rfqRows.filter(
    (r) =>
      (!q || r.case_number.toLowerCase().includes(q) || r.title.toLowerCase().includes(q)) &&
      (!statusFilter || r.status === statusFilter) &&
      (!deptFilter || r.department_name === deptFilter),
  );
  const filteredPos = poRows.filter(
    (r) =>
      (!q || r.po_number.toLowerCase().includes(q) || r.case_number.toLowerCase().includes(q) || r.supplier_name.toLowerCase().includes(q)) &&
      (!statusFilter || r.status === statusFilter) &&
      (!deptFilter || r.department_name === deptFilter),
  );
  const filteredGrns = grnRows.filter(
    (r) =>
      (!q || r.grn_number.toLowerCase().includes(q) || r.po_number.toLowerCase().includes(q) || r.case_number.toLowerCase().includes(q)) &&
      (!statusFilter || r.status === statusFilter) &&
      (!deptFilter || r.department_name === deptFilter),
  );
  const filteredInvoices = invoiceRows.filter(
    (r) =>
      (!q || r.invoice_number.toLowerCase().includes(q) || r.case_number.toLowerCase().includes(q) || r.supplier_name.toLowerCase().includes(q)) &&
      (!statusFilter || r.status === statusFilter) &&
      (!deptFilter || r.department_name === deptFilter),
  );

  const procurementReportRows: { status: string; department_name: string | null }[] = isProcurementReportKey(key)
    ? key === "rfqs"
      ? rfqRows
      : key === "purchase-orders"
        ? poRows
        : key === "goods-received"
          ? grnRows
          : invoiceRows
    : [];
  const procurementStatuses = Array.from(new Set(procurementReportRows.map((r) => r.status)));
  const procurementDepartments = Array.from(new Set(procurementReportRows.map((r) => r.department_name).filter((d): d is string => !!d))).sort();

  const hiddenPeriodInputs = (
    <>
      {sp.period && <input type="hidden" name="period" value={sp.period} />}
      {sp.from && <input type="hidden" name="from" value={sp.from} />}
      {sp.to && <input type="hidden" name="to" value={sp.to} />}
    </>
  );

  const aging_statuses = Array.from(new Set(data.aging.map((c) => c.status)));
  const aging_priorities = Array.from(new Set(data.aging.map((c) => c.priority)));
  const all_stages = Array.from(new Set([...data.stageDurations.map((s) => s.stage_key), ...data.slaCompliance.map((s) => s.stage_key)]));

  const clearHref = `/app/reports/${key}${sp.period ? `?period=${sp.period}` : ""}`;
  const hasActiveFilter = Boolean(sp.q || sp.status || sp.priority || sp.stage || sp.dept);

  function hrefWithDrill(stageKey: string | null): string {
    const params = new URLSearchParams();
    if (sp.period) params.set("period", sp.period);
    if (sp.from) params.set("from", sp.from);
    if (sp.to) params.set("to", sp.to);
    if (sp.stage) params.set("stage", sp.stage);
    if (stageKey) params.set("drillStage", stageKey);
    const qs = params.toString();
    return `/app/reports/${key}${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-sm text-ink-faint">
          <Link href="/app/reports" className="flex items-center gap-1 font-semibold text-ink-soft hover:text-brand">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Link>
          <span>·</span>
          <Link href="/app/reports" className="hover:text-brand hover:underline">
            Reports
          </Link>
          <span>/</span>
          <span className="text-ink">{meta.title}</span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-ink">{meta.title}</h1>
            <p className="mt-1 text-sm text-ink-faint">
              {meta.subtitle} — over {period.label.toLowerCase()}.
            </p>
          </div>
          {canExport && (
            <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
              <span className="text-xs font-medium text-ink-faint">Download</span>
              <ExportLinks
                base={`/api/export/report/${key}${(() => {
                  const params = new URLSearchParams();
                  if (sp.period) params.set("period", sp.period);
                  if (sp.from) params.set("from", sp.from);
                  if (sp.to) params.set("to", sp.to);
                  if (sp.q) params.set("q", sp.q);
                  if (sp.status) params.set("status", sp.status);
                  if (sp.priority) params.set("priority", sp.priority);
                  if (sp.stage) params.set("stage", sp.stage);
                  if (sp.dept) params.set("dept", sp.dept);
                  const qs = params.toString();
                  return qs ? `?${qs}` : "";
                })()}`}
              />
            </div>
          )}
        </div>
      </div>

      <PeriodFilterSuspended activeKey={period.key} />

      <Card>
        <CardHeader title="Filters" icon={<ListFilter className="h-4 w-4" />} />
        <CardBody>
          <form method="get" className="flex flex-wrap items-end gap-3">
            {hiddenPeriodInputs}
            {(key === "aging" || key === "supplier-performance" || key === "spend-by-category" || isProcurementReportKey(key)) && (
              <div className="flex min-w-[12rem] flex-1 flex-col gap-1.5">
                <label htmlFor="q" className="text-sm font-medium text-ink">
                  Search
                </label>
                <input
                  id="q"
                  name="q"
                  defaultValue={sp.q ?? ""}
                  placeholder={
                    key === "aging"
                      ? "PR number or title"
                      : key === "supplier-performance"
                        ? "Supplier name"
                        : key === "spend-by-category"
                          ? "Category name"
                          : key === "rfqs"
                            ? "PR number or RFQ title"
                            : key === "purchase-orders"
                              ? "PO number, PR number or supplier"
                              : key === "goods-received"
                                ? "GRN number, PO number or PR number"
                                : "Invoice number, PR number or supplier"
                  }
                  className="h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-[0.9375rem] text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none"
                />
              </div>
            )}
            {isProcurementReportKey(key) && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="status" className="text-sm font-medium text-ink">
                    Status
                  </label>
                  <select
                    id="status"
                    name="status"
                    defaultValue={statusFilter}
                    className="h-11 rounded-lg border border-line-strong bg-surface px-3 text-[0.9375rem] text-ink focus:border-brand focus:outline-none"
                  >
                    <option value="">Any status</option>
                    {procurementStatuses.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="dept" className="text-sm font-medium text-ink">
                    Department
                  </label>
                  <select
                    id="dept"
                    name="dept"
                    defaultValue={deptFilter}
                    className="h-11 rounded-lg border border-line-strong bg-surface px-3 text-[0.9375rem] text-ink focus:border-brand focus:outline-none"
                  >
                    <option value="">All departments</option>
                    {procurementDepartments.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
            {(key === "stage-durations" || key === "sla-compliance") && (
              <div className="flex min-w-[12rem] flex-col gap-1.5">
                <label htmlFor="stage" className="text-sm font-medium text-ink">
                  Stage
                </label>
                <select
                  id="stage"
                  name="stage"
                  defaultValue={stageFilter}
                  className="h-11 rounded-lg border border-line-strong bg-surface px-3 text-[0.9375rem] text-ink focus:border-brand focus:outline-none"
                >
                  <option value="">Every stage</option>
                  {all_stages.map((s) => (
                    <option key={s} value={s}>
                      {STAGE_LABEL[s] ?? s}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {key === "aging" && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="status" className="text-sm font-medium text-ink">
                      Status
                    </label>
                    <select
                      id="status"
                      name="status"
                      defaultValue={statusFilter}
                      className="h-11 rounded-lg border border-line-strong bg-surface px-3 text-[0.9375rem] text-ink focus:border-brand focus:outline-none"
                    >
                      <option value="">Any status</option>
                      {aging_statuses.map((s) => (
                        <option key={s} value={s}>
                          {STAGE_LABEL[s] ?? s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="priority" className="text-sm font-medium text-ink">
                      Priority
                    </label>
                    <select
                      id="priority"
                      name="priority"
                      defaultValue={priorityFilter}
                      className="h-11 rounded-lg border border-line-strong bg-surface px-3 text-[0.9375rem] text-ink focus:border-brand focus:outline-none"
                    >
                      <option value="">Any priority</option>
                      {aging_priorities.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            <button type="submit" className="h-11 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-mid">
              Apply
            </button>
            {hasActiveFilter && (
              <Link href={clearHref} className="text-sm font-semibold text-ink-faint hover:text-ink">
                Clear
              </Link>
            )}
          </form>
        </CardBody>
      </Card>

      {key === "aging" && (
        <Card>
          <CardHeader title={`${filteredAging.length} of ${data.aging.length} open`} />
          <CardBody className="overflow-x-auto">
            {filteredAging.length === 0 ? (
              <p className="text-sm text-ink-faint">Nothing matches these filters.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-faint">
                    <th className="pb-2 pr-4 font-medium">PR No.</th>
                    <th className="pb-2 pr-4 font-medium">Title</th>
                    <th className="pb-2 pr-4 font-medium">Stage</th>
                    <th className="pb-2 pr-4 font-medium">Priority</th>
                    <th className="pb-2 font-medium">Age</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAging.map((c) => (
                    <tr key={c.case_id} className="border-b border-line last:border-0">
                      <td className="py-2 pr-4 tnum text-ink">
                        <Link href={`/app/cases/${c.case_id}`} className="font-medium text-brand hover:underline">
                          {c.case_number}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 text-ink-soft">{c.title}</td>
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
      )}

      {key === "stage-durations" && (
        <Card>
          <CardHeader title="Time in each stage" subtitle="Click a stage to see the individual cases behind its average" />
          <CardBody className="flex flex-col gap-3">
            <div className="flex flex-col divide-y divide-line">
              {filteredStageDurations.length === 0 && <p className="py-4 text-sm text-ink-faint">Nothing matches this stage.</p>}
              {filteredStageDurations
                .sort((a, b) => b.avg_minutes - a.avg_minutes)
                .map((s) => {
                  const roles = stageOwnersByKey.get(s.stage_key) ?? [];
                  const active = drillStage === s.stage_key;
                  return (
                    <Link
                      key={s.stage_key}
                      href={hrefWithDrill(active ? null : s.stage_key)}
                      className={`group flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md py-2.5 pr-1 first:pt-2.5 last:pb-2.5 hover:bg-surface-raised ${active ? "bg-surface-raised" : ""}`}
                    >
                      <div className="grid min-w-0 flex-1 grid-cols-[7rem_1fr] items-baseline gap-x-3">
                        <p className="text-sm text-ink">{STAGE_LABEL[s.stage_key] ?? s.stage_key}</p>
                        <p className="truncate text-xs text-ink-faint">
                          {roles.length > 0 ? (
                            <>
                              Handled by <span className="text-ink-soft">{roles.join(", ")}</span>
                            </>
                          ) : (
                            " "
                          )}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="text-xs text-ink-faint">{s.cases_seen} case{s.cases_seen === 1 ? "" : "s"} seen</span>
                        {s.currently_in > 0 && <Badge tone="info">{s.currently_in} now here</Badge>}
                        <span className="tnum text-sm font-medium text-ink-soft">{formatMinutes(s.avg_minutes)} avg</span>
                        <ChevronRight
                          className={`h-4 w-4 shrink-0 transition-transform duration-200 ${active ? "rotate-90 text-brand" : "text-ink-faint group-hover:translate-x-0.5 group-hover:text-brand"}`}
                        />
                      </div>
                    </Link>
                  );
                })}
            </div>
          </CardBody>
        </Card>
      )}

      {key === "stage-durations" && drillStage && (
        <Card>
          <CardHeader
            title={`Cases in ${STAGE_LABEL[drillStage] ?? drillStage}`}
            subtitle={`${drillCases.length} case${drillCases.length === 1 ? "" : "s"} in this stage over ${period.label.toLowerCase()}`}
          />
          <CardBody className="overflow-x-auto">
            {drillCases.length === 0 ? (
              <p className="text-sm text-ink-faint">No cases passed through this stage in this period.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-faint">
                    <th className="pb-2 pr-4 font-medium">PR No.</th>
                    <th className="pb-2 pr-4 font-medium">Title</th>
                    <th className="pb-2 pr-4 font-medium">Priority</th>
                    <th className="pb-2 pr-4 font-medium">Entered</th>
                    <th className="pb-2 font-medium">Time in stage</th>
                  </tr>
                </thead>
                <tbody>
                  {drillCases.map((c) => (
                    <tr key={c.case_id} className="border-b border-line last:border-0">
                      <td className="py-2 pr-4 tnum text-ink">
                        <Link href={`/app/cases/${c.case_id}`} className="font-medium text-brand hover:underline">
                          {c.case_number}
                        </Link>
                      </td>
                      <td className="max-w-xs truncate py-2 pr-4 text-ink-soft">{c.title}</td>
                      <td className="py-2 pr-4 text-ink-soft">{c.priority}</td>
                      <td className="py-2 pr-4 tnum text-ink-soft">{new Date(c.entered_at).toLocaleDateString()}</td>
                      <td className="py-2 tnum">
                        <span className="text-ink-soft">{formatMinutes(c.minutes_in_stage)}</span>
                        {c.still_in_stage && <Badge tone="info" className="ml-2">still here</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>
      )}

      {key === "sla-compliance" && (
        <Card>
          <CardBody className="flex flex-col gap-3">
            <div className="flex flex-col divide-y divide-line">
              {filteredSlaCompliance.length === 0 && <p className="py-4 text-sm text-ink-faint">Nothing matches this stage.</p>}
              {filteredSlaCompliance.map((s) => {
                const pct = s.total > 0 ? Math.round((s.on_time / s.total) * 100) : 0;
                const roles = stageOwnersByKey.get(s.stage_key) ?? [];
                return (
                  <div key={s.stage_key} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5 first:pt-0 last:pb-0">
                    <div className="grid min-w-0 flex-1 grid-cols-[7rem_1fr] items-baseline gap-x-3">
                      <p className="text-sm text-ink">{STAGE_LABEL[s.stage_key] ?? s.stage_key}</p>
                      <p className="truncate text-xs text-ink-faint">
                        {roles.length > 0 ? (
                          <>
                            Handled by <span className="text-ink-soft">{roles.join(", ")}</span>
                          </>
                        ) : (
                          " "
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-sm">
                      <span className="text-ink-faint">{s.on_time}/{s.total} on time</span>
                      <Badge tone={pct >= 90 ? "good" : pct >= 70 ? "attention" : "critical"}>{pct}%</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      )}

      {key === "supplier-performance" && (
        <Card>
          <CardBody className="flex flex-col gap-3 overflow-x-auto">
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
                {filteredSuppliers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-3 text-sm text-ink-faint">
                      {data.supplierPerformance.length === 0 ? "No purchase orders yet." : "Nothing matches this search."}
                    </td>
                  </tr>
                ) : (
                  filteredSuppliers
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
                          <td className="py-2 tnum text-ink-soft">{s.avg_days_award_to_grn === null ? "—" : `${s.avg_days_award_to_grn.toFixed(1)}d`}</td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      {key === "spend-by-category" && (
        <Card>
          <CardBody className="flex flex-col gap-3">
            <div className="flex flex-col divide-y divide-line">
              {filteredCategories.length === 0 ? (
                <p className="text-sm text-ink-faint">{data.spendByCategory.length === 0 ? "No requests yet." : "Nothing matches this search."}</p>
              ) : (
                filteredCategories.map((c) => {
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
            </div>
          </CardBody>
        </Card>
      )}

      {key === "rfqs" && (
        <Card>
          <CardHeader title={`${filteredRfqs.length} of ${rfqRows.length}`} />
          <CardBody className="overflow-x-auto">
            {filteredRfqs.length === 0 ? (
              <p className="text-sm text-ink-faint">{rfqRows.length === 0 ? "No RFQs raised in this period." : "Nothing matches these filters."}</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-faint">
                    <th className="pb-2 pr-4 font-medium">PR No.</th>
                    <th className="pb-2 pr-4 font-medium">Title</th>
                    <th className="pb-2 pr-4 font-medium">Department</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 font-medium">Closing</th>
                    <th className="pb-2 pr-4 font-medium">Invited</th>
                    <th className="pb-2 font-medium">Quotations</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRfqs.map((r) => (
                    <tr key={r.rfq_id} className="border-b border-line last:border-0">
                      <td className="py-2 pr-4 tnum">
                        <Link href={`/app/cases/${r.case_id}`} className="font-medium text-brand hover:underline">
                          {r.case_number}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 text-ink-soft">{r.title}</td>
                      <td className="py-2 pr-4 text-ink-soft">{r.department_name ?? "—"}</td>
                      <td className="py-2 pr-4">
                        <Badge tone={r.status === "open" ? "info" : r.status === "closed" ? "good" : "neutral"}>{r.status}</Badge>
                      </td>
                      <td className="py-2 pr-4 text-ink-soft">{r.closing_date ? formatDate(r.closing_date) : "—"}</td>
                      <td className="py-2 pr-4 tnum text-ink-soft">{r.invited_count}</td>
                      <td className="py-2 tnum text-ink-soft">{r.quotation_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>
      )}

      {key === "purchase-orders" && (
        <Card>
          <CardHeader title={`${filteredPos.length} of ${poRows.length}`} />
          <CardBody className="overflow-x-auto">
            {filteredPos.length === 0 ? (
              <p className="text-sm text-ink-faint">{poRows.length === 0 ? "No purchase orders issued in this period." : "Nothing matches these filters."}</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-faint">
                    <th className="pb-2 pr-4 font-medium">PO number</th>
                    <th className="pb-2 pr-4 font-medium">PR No.</th>
                    <th className="pb-2 pr-4 font-medium">Department</th>
                    <th className="pb-2 pr-4 font-medium">Supplier</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 text-right font-medium">Total</th>
                    <th className="pb-2 font-medium">Issued</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPos.map((r) => (
                    <tr key={r.po_id} className="border-b border-line last:border-0">
                      <td className="py-2 pr-4">
                        <PdfLinkButton
                          href={`/api/export/po/${r.po_id}`}
                          title={`Purchase order ${r.po_number}`}
                          filename={r.po_number}
                          className="font-mono text-xs text-brand hover:underline"
                        >
                          {r.po_number}
                        </PdfLinkButton>
                      </td>
                      <td className="py-2 pr-4 tnum">
                        <Link href={`/app/cases/${r.case_id}`} className="font-medium text-brand hover:underline">
                          {r.case_number}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 text-ink-soft">{r.department_name ?? "—"}</td>
                      <td className="py-2 pr-4">
                        <Link href={`/app/settings/suppliers/${r.supplier_id}`} className="text-ink-soft hover:text-brand hover:underline">
                          {r.supplier_name}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">
                        <Badge tone={r.status === "issued" ? "good" : r.status === "pending_approval" ? "attention" : "critical"}>{r.status}</Badge>
                      </td>
                      <td className="py-2 pr-4 text-right tnum text-ink-soft">{formatMoney(r.total_cents, { currency: r.currency })}</td>
                      <td className="py-2 tnum text-ink-soft">{formatDate(r.issued_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>
      )}

      {key === "goods-received" && (
        <Card>
          <CardHeader title={`${filteredGrns.length} of ${grnRows.length}`} />
          <CardBody className="overflow-x-auto">
            {filteredGrns.length === 0 ? (
              <p className="text-sm text-ink-faint">{grnRows.length === 0 ? "No goods received in this period." : "Nothing matches these filters."}</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-faint">
                    <th className="pb-2 pr-4 font-medium">GRN number</th>
                    <th className="pb-2 pr-4 font-medium">PO number</th>
                    <th className="pb-2 pr-4 font-medium">PR No.</th>
                    <th className="pb-2 pr-4 font-medium">Department</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 font-medium">Received</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGrns.map((r) => (
                    <tr key={r.grn_id} className="border-b border-line last:border-0">
                      <td className="py-2 pr-4 font-mono text-xs text-ink">{r.grn_number}</td>
                      <td className="py-2 pr-4 font-mono text-xs text-ink-soft">{r.po_number}</td>
                      <td className="py-2 pr-4 tnum">
                        <Link href={`/app/cases/${r.case_id}`} className="font-medium text-brand hover:underline">
                          {r.case_number}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 text-ink-soft">{r.department_name ?? "—"}</td>
                      <td className="py-2 pr-4">
                        <Badge tone={r.status === "inspected" ? "good" : "neutral"}>{r.status}</Badge>
                      </td>
                      <td className="py-2 tnum text-ink-soft">{formatDate(r.received_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>
      )}

      {key === "invoices" && (
        <Card>
          <CardHeader title={`${filteredInvoices.length} of ${invoiceRows.length}`} />
          <CardBody className="overflow-x-auto">
            {filteredInvoices.length === 0 ? (
              <p className="text-sm text-ink-faint">{invoiceRows.length === 0 ? "No invoices submitted in this period." : "Nothing matches these filters."}</p>
            ) : (
              <InvoicesTable rows={filteredInvoices} canPay={can(session, "finance.payment.approve")} />
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
