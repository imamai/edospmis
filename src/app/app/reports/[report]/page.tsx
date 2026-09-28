import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { requireSession, can } from "@/lib/data/session";
import { getAnalytics, getStageCases } from "@/lib/data/analytics";
import { getRfqReport, getPurchaseOrderReport, getGoodsReceivedReport, getInvoiceReport, getCycleTimeReport } from "@/lib/data/procurement-reports";
import { averageGap, dayGapLabel, deliveryState, deliveryVariance, deliveryVarianceLabel, overdueDays } from "@/lib/cycle-time";
import { getSuppliers } from "@/lib/data/procurement";
import { resolvePeriod } from "@/lib/report-period";
import { REPORT_FILTERS } from "@/lib/report-filters";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RecordCount } from "@/components/ui/filter-card";
import { ReportFilterForm } from "./report-filter-form";
import { STAGE_LABEL, STAGE_TONE, PO_STATUS_LABEL, PO_STATUS_TONE, isTerminalStage } from "@/lib/stage-labels";
import { formatMoney, formatDate } from "@/lib/utils";
import { InvoicesTable } from "../invoices-table";
import { PdfLinkButton } from "@/components/ui/pdf-link-button";

const REPORTS = {
  aging: { title: "Open requests by age", subtitle: "Every case still open, oldest first" },
  "stage-durations": { title: "Time in each stage", subtitle: "Average time spent, and how many cases are sitting there right now" },
  "cycle-time": { title: "Procure-to-receive cycle time", subtitle: "Every request from raised to goods received, and the days spent waiting at each gate" },
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

/**
 * How a delivery measured against the window the supplier agreed to.
 *
 * An order with no expected date reads "—" rather than "on time": nothing was
 * promised, so nothing was kept. An order still awaiting goods says how far
 * past its window it is, which is the number somebody can act on — a variance
 * only computed after the fact would say nothing at all about the order
 * sitting three weeks late right now.
 */
function DeliveryCell({ expected, received }: { expected: string | null; received: string | null }) {
  const state = deliveryState(expected, received);
  if (state === "no_window") return <span className="text-ink-faint">—</span>;
  if (state === "overdue") {
    const late = overdueDays(expected, received) ?? 0;
    return <Badge tone="critical">{late} {late === 1 ? "day" : "days"} overdue</Badge>;
  }
  if (state === "awaiting") return <span className="text-ink-faint">Within window</span>;
  return (
    <Badge tone={state === "late" ? "attention" : "good"}>
      {deliveryVarianceLabel(deliveryVariance(expected, received))}
    </Badge>
  );
}

/** One elapsed-day cell. Grey when there is nothing to measure yet. */
function Gap({ days, last }: { days: number | null; last?: boolean }) {
  return (
    <td className={`py-2 text-right tnum ${last ? "" : "pr-4"} ${days === null ? "text-ink-faint" : "text-ink"}`}>
      {dayGapLabel(days)}
    </td>
  );
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
    supplier?: string;
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
  // A document link is only offered to someone who can open it. The export
  // routes enforce this too — that is where it actually matters — but a link
  // that always answers "you don't have permission" is a dead end, so the
  // number stays plain text instead.
  const canViewPo = can(session, "procurement.po.view");
  const canViewGrn = can(session, "receiving.grn.view");
  const canViewInvoice = can(session, "finance.invoice.view");

  const q = (sp.q ?? "").trim().toLowerCase();
  const statusFilter = sp.status ?? "";
  const priorityFilter = sp.priority ?? "";
  const stageFilter = sp.stage ?? "";
  const deptFilter = (sp.dept ?? "").trim();
  const supplierFilter = (sp.supplier ?? "").trim();
  const drillStage = key === "stage-durations" ? (sp.drillStage ?? "") : "";
  const drillCases = drillStage ? await getStageCases(session.tenant.id, drillStage, { from: period.from, to: period.to }) : [];

  const reportPeriod = { from: period.from, to: period.to };
  const rfqRows = key === "rfqs" ? await getRfqReport(session.tenant.id, reportPeriod) : [];
  const poRows = key === "purchase-orders" ? await getPurchaseOrderReport(session.tenant.id, reportPeriod) : [];
  const grnRows = key === "goods-received" ? await getGoodsReceivedReport(session.tenant.id, reportPeriod) : [];
  const invoiceRows = key === "invoices" ? await getInvoiceReport(session.tenant.id, reportPeriod) : [];
  const cycleRows = key === "cycle-time" ? await getCycleTimeReport(session.tenant.id, reportPeriod) : [];

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
      (!deptFilter || r.department_name === deptFilter) &&
      (!supplierFilter || r.supplier_id === supplierFilter),
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
      (!deptFilter || r.department_name === deptFilter) &&
      (!supplierFilter || r.supplier_id === supplierFilter),
  );

  const filteredCycle = cycleRows.filter(
    (r) =>
      (!q ||
        r.case_number.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        (r.po_number ?? "").toLowerCase().includes(q)) &&
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
  // Cycle time isn't a procurement-document report — its rows are requests,
  // so its status list is stage keys and its departments come from its own
  // rows rather than from a document table.
  const cycleStatuses = Array.from(new Set(cycleRows.map((r) => r.status)));
  const cycleDepartments = Array.from(new Set(cycleRows.map((r) => r.department_name).filter((d): d is string => !!d))).sort();
  const procurementDepartments = Array.from(new Set(procurementReportRows.map((r) => r.department_name).filter((d): d is string => !!d))).sort();

  const aging_statuses = Array.from(new Set(data.aging.map((c) => c.status)));
  const aging_priorities = Array.from(new Set(data.aging.map((c) => c.priority)));
  const all_stages = Array.from(new Set([...data.stageDurations.map((s) => s.stage_key), ...data.slaCompliance.map((s) => s.stage_key)]));

  // Orders past their agreed delivery date with nothing received yet — the
  // one figure on this report that is about today rather than the past.
  const overduePos = filteredPos.filter(
    (r) => deliveryState(r.expected_delivery_date, r.first_received_at) === "overdue",
  ).length;

  const flags = REPORT_FILTERS[key] ?? { dates: true };
  const suppliers = flags.supplier ? await getSuppliers(session.tenant.id, true) : [];

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
        </div>
      </div>

      <ReportFilterForm
        reportKey={key}
        flags={flags}
        initial={{
          period: sp.period ?? "all",
          from: sp.from ?? "",
          to: sp.to ?? "",
          q: sp.q ?? "",
          status: statusFilter,
          priority: priorityFilter,
          stage: stageFilter,
          dept: deptFilter,
          supplier: supplierFilter,
        }}
        options={{
          statuses: isProcurementReportKey(key)
            ? procurementStatuses.map((s) => ({ value: s, label: s }))
            : key === "cycle-time"
              ? cycleStatuses.map((s) => ({ value: s, label: STAGE_LABEL[s] ?? s }))
              : aging_statuses.map((s) => ({ value: s, label: STAGE_LABEL[s] ?? s })),
          priorities: aging_priorities,
          stages: all_stages.map((s) => ({ value: s, label: STAGE_LABEL[s] ?? s })),
          departments: key === "cycle-time" ? cycleDepartments : procurementDepartments,
          suppliers: suppliers.map((s) => ({ id: s.id, name: s.name })),
        }}
        canExport={canExport}
        periodLabel={period.label}
        reportTitle={meta.title}
      />

      {key === "aging" && (
        <Card>
          <CardHeader title={"Open requests, oldest first"} />
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
            <RecordCount shown={filteredAging.length} total={data.aging.length} noun="open request" />
          </CardBody>
        </Card>
      )}

      {key === "stage-durations" && (
        <Card>
          <CardHeader title="Time in each stage" subtitle="Averaged over passes that finished. A terminal stage shows no average — a case never leaves it. Click a stage for the cases behind its number." />
          <CardBody className="flex flex-col gap-3">
            <div className="flex flex-col divide-y divide-line">
              {filteredStageDurations.length === 0 && <p className="py-4 text-sm text-ink-faint">Nothing matches this stage.</p>}
              {filteredStageDurations
                .sort((a, b) => (b.avg_minutes ?? -1) - (a.avg_minutes ?? -1))
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
                        {s.open_avg_minutes !== null && s.currently_in > 0 && (
                          <span className="tnum text-xs text-ink-faint">waiting {formatMinutes(s.open_avg_minutes)}</span>
                        )}
                        <span className="tnum text-sm font-medium text-ink-soft">
                          {s.avg_minutes !== null ? (
                            `${formatMinutes(s.avg_minutes)} avg`
                          ) : isTerminalStage(s.stage_key) ? (
                            // Nothing to measure: a case that reaches here stops.
                            <span className="text-ink-faint">end state</span>
                          ) : (
                            // Real stage, but nothing has finished a pass through
                            // it yet — so there is no average, only cases waiting.
                            <span className="text-ink-faint">none finished yet</span>
                          )}
                        </span>
                        <ChevronRight
                          className={`h-4 w-4 shrink-0 transition-transform duration-200 ${active ? "rotate-90 text-brand" : "text-ink-faint group-hover:translate-x-0.5 group-hover:text-brand"}`}
                        />
                      </div>
                    </Link>
                  );
                })}
            </div>
            <RecordCount shown={filteredStageDurations.length} total={data.stageDurations.length} noun="stage" />
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
            <RecordCount shown={filteredSlaCompliance.length} total={data.slaCompliance.length} noun="stage" />
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
            <RecordCount shown={filteredSuppliers.length} total={data.supplierPerformance.length} noun="supplier" />
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
            <RecordCount shown={filteredCategories.length} total={data.spendByCategory.length} noun="category" plural="categories" />
          </CardBody>
        </Card>
      )}

      {key === "rfqs" && (
        <Card>
          <CardHeader title={"RFQs raised in this period"} />
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
            <RecordCount shown={filteredRfqs.length} total={rfqRows.length} noun="RFQ" />
          </CardBody>
        </Card>
      )}

      {key === "cycle-time" && (
        <Card>
          {/* The per-request working under "Time in each stage": that report
              averages the workspace, this one shows the individual case a
              department head or an auditor actually asks about. */}
          <CardHeader
            title={"Every request, gate by gate"}
            subtitle="A blank gap means the request has not reached that gate yet — not that it took no time."
            action={
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                <span className="text-ink-soft">
                  Avg PR&nbsp;&rarr;&nbsp;approval:{" "}
                  <span className="tnum font-semibold text-ink">
                    {dayGapLabel(averageGap(filteredCycle.map((r) => r.days_pr_to_pr_approval)))}
                  </span>
                </span>
                <span className="text-ink-soft">
                  Avg PR&nbsp;&rarr;&nbsp;PO:{" "}
                  <span className="tnum font-semibold text-ink">
                    {dayGapLabel(averageGap(filteredCycle.map((r) => r.days_pr_to_po)))}
                  </span>
                </span>
                <span className="text-ink-soft">
                  Avg PO&nbsp;&rarr;&nbsp;GRPO:{" "}
                  <span className="tnum font-semibold text-ink">
                    {dayGapLabel(averageGap(filteredCycle.map((r) => r.days_po_approval_to_grn)))}
                  </span>
                </span>
              </div>
            }
          />
          <CardBody className="overflow-x-auto">
            {filteredCycle.length === 0 ? (
              <p className="text-sm text-ink-faint">
                {cycleRows.length === 0 ? "No requests raised in this period." : "Nothing matches these filters."}
              </p>
            ) : (
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-faint">
                    <th className="pb-2 pr-4 font-medium">PR No.</th>
                    <th className="pb-2 pr-4 font-medium">Department</th>
                    <th className="pb-2 pr-4 font-medium">Stage</th>
                    <th className="pb-2 pr-4 font-medium">PR created on</th>
                    <th className="pb-2 pr-4 font-medium">PR approved on</th>
                    <th className="pb-2 pr-4 text-right font-medium">PR&nbsp;&rarr;&nbsp;PR approval</th>
                    <th className="pb-2 pr-4 font-medium">PO date</th>
                    <th className="pb-2 pr-4 text-right font-medium">PR&nbsp;&rarr;&nbsp;PO creation</th>
                    <th className="pb-2 pr-4 font-medium">PO approved on</th>
                    <th className="pb-2 pr-4 text-right font-medium">PO creation&nbsp;&rarr;&nbsp;PO approval</th>
                    <th className="pb-2 pr-4 font-medium">PO generated on</th>
                    <th className="pb-2 pr-4 font-medium">PO no.</th>
                    <th className="pb-2 pr-4 font-medium">Expected delivery</th>
                    <th className="pb-2 pr-4 font-medium">GRPO date</th>
                    <th className="pb-2 pr-4 font-medium">GRPO no.</th>
                    <th className="pb-2 pr-4 text-right font-medium">PO approval&nbsp;&rarr;&nbsp;GRPO</th>
                    <th className="pb-2 pr-4 font-medium">Against the window</th>
                    <th className="pb-2 font-medium">PO closed</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCycle.map((r) => (
                    <tr key={r.case_id} className="border-b border-line last:border-0">
                      <td className="py-2 pr-4 tnum">
                        <Link href={`/app/cases/${r.case_id}`} className="font-medium text-brand hover:underline">
                          {r.case_number}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 text-ink-soft">{r.department_name ?? "—"}</td>
                      <td className="py-2 pr-4">
                        <Badge tone={STAGE_TONE[r.status] ?? "neutral"}>{STAGE_LABEL[r.status] ?? r.status}</Badge>
                      </td>
                      <td className="py-2 pr-4 tnum text-ink-soft">{formatDate(r.pr_created_at)}</td>
                      <td className="py-2 pr-4 tnum text-ink-soft">{r.pr_approved_at ? formatDate(r.pr_approved_at) : "—"}</td>
                      <Gap days={r.days_pr_to_pr_approval} />
                      <td className="py-2 pr-4 tnum text-ink-soft">{r.po_date ? formatDate(r.po_date) : "—"}</td>
                      <Gap days={r.days_pr_to_po} />
                      <td className="py-2 pr-4 tnum text-ink-soft">{r.po_approved_at ? formatDate(r.po_approved_at) : "—"}</td>
                      <Gap days={r.days_po_to_po_approval} />
                      <td className="py-2 pr-4 tnum text-ink-soft">{r.po_created_at ? formatDate(r.po_created_at) : "—"}</td>
                      <td className="py-2 pr-4">
                        {r.po_number ? (
                          <span className="font-mono text-xs text-ink">{r.po_number}</span>
                        ) : (
                          <span className="text-ink-faint">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 tnum text-ink-soft">
                        {r.expected_delivery_date ? formatDate(r.expected_delivery_date) : "—"}
                      </td>
                      <td className="py-2 pr-4 tnum text-ink-soft">{r.grn_date ? formatDate(r.grn_date) : "—"}</td>
                      <td className="py-2 pr-4">
                        {r.grn_number ? (
                          <span className="font-mono text-xs text-ink">
                            {r.grn_number}
                            {/* A part delivery is not the whole order, so say
                                so rather than letting the first receipt read
                                as the end of the line. */}
                            {r.grn_count > 1 && (
                              <span className="ml-1 font-sans text-ink-faint">+{r.grn_count - 1}</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-ink-faint">—</span>
                        )}
                      </td>
                      <Gap days={r.days_po_approval_to_grn} />
                      <td className="py-2 pr-4">
                        <DeliveryCell expected={r.expected_delivery_date} received={r.grn_date} />
                      </td>
                      <td className="py-2 tnum text-ink-soft">{r.po_closed_at ? formatDate(r.po_closed_at) : "—"}</td>
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
          {/* An issued order is money committed from the moment it goes to
              the supplier. Until now the only spend on show was spend already
              invoiced, which understates what the budget is carrying. */}
          <CardHeader
            title={"Purchase orders issued in this period"}
            subtitle="An issued order commits the money, whether or not an invoice has arrived."
            action={
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                <span className="text-ink-soft">
                  Committed:{" "}
                  <span className="tnum font-semibold text-ink">
                    {formatMoney(filteredPos.reduce((sum, r) => sum + r.total_cents, 0))}
                  </span>
                </span>
                <span className="text-ink-soft">
                  Billed:{" "}
                  <span className="tnum font-semibold text-ink">
                    {formatMoney(filteredPos.reduce((sum, r) => sum + r.invoiced_net_cents, 0))}
                  </span>
                </span>
                <span className="text-ink-soft">
                  Still to come:{" "}
                  <span className="tnum font-semibold text-attention">
                    {formatMoney(
                      filteredPos.reduce((sum, r) => sum + Math.max(0, r.total_cents - r.invoiced_net_cents), 0),
                    )}
                  </span>
                </span>
                {overduePos > 0 && (
                  <span className="text-ink-soft">
                    Past the window:{" "}
                    <span className="tnum font-semibold text-critical">{overduePos}</span>
                  </span>
                )}
              </div>
            }
          />
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
                    <th className="pb-2 pr-4 text-right font-medium">Billed</th>
                    <th className="pb-2 pr-4 font-medium">Issued</th>
                    <th className="pb-2 pr-4 font-medium">Expected delivery</th>
                    <th className="pb-2 font-medium">Against the window</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPos.map((r) => (
                    <tr key={r.po_id} className="border-b border-line last:border-0">
                      <td className="py-2 pr-4">
                        {canViewPo ? (
                          <PdfLinkButton
                            href={`/api/export/po/${r.po_id}`}
                            title={`Purchase order ${r.po_number}`}
                            filename={r.po_number}
                            className="font-mono text-xs text-brand hover:underline"
                          >
                            {r.po_number}
                          </PdfLinkButton>
                        ) : (
                          <span className="font-mono text-xs text-ink">{r.po_number}</span>
                        )}
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
                        <Badge tone={PO_STATUS_TONE[r.status] ?? "neutral"}>{PO_STATUS_LABEL[r.status] ?? r.status}</Badge>
                      </td>
                      <td className="py-2 pr-4 text-right tnum text-ink-soft">{formatMoney(r.total_cents, { currency: r.currency })}</td>
                      <td className="py-2 pr-4 text-right tnum">
                        {r.invoiced_net_cents === 0 ? (
                          <span className="text-ink-faint">—</span>
                        ) : (
                          <span className={r.invoiced_net_cents >= r.total_cents ? "text-good" : "text-attention"}>
                            {formatMoney(r.invoiced_net_cents, { currency: r.currency })}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4 tnum text-ink-soft">{formatDate(r.issued_at)}</td>
                      <td className="py-2 pr-4 tnum text-ink-soft">
                        {r.expected_delivery_date ? formatDate(r.expected_delivery_date) : "—"}
                      </td>
                      <td className="py-2">
                        <DeliveryCell expected={r.expected_delivery_date} received={r.first_received_at} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <RecordCount shown={filteredPos.length} total={poRows.length} noun="purchase order" />
          </CardBody>
        </Card>
      )}

      {key === "goods-received" && (
        <Card>
          <CardHeader
            title={"Goods received in this period"}
            subtitle="Received and not yet invoiced is money already owed — the goods are here and only the paperwork is outstanding."
            action={
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                <span className="text-ink-soft">
                  Received:{" "}
                  <span className="tnum font-semibold text-ink">
                    {formatMoney(filteredGrns.reduce((sum, r) => sum + r.received_value_cents, 0))}
                  </span>
                </span>
                <span className="text-ink-soft">
                  Not yet invoiced:{" "}
                  <span className="tnum font-semibold text-attention">
                    {formatMoney(
                      filteredGrns.filter((r) => !r.invoice_status).reduce((sum, r) => sum + r.received_value_cents, 0),
                    )}
                  </span>
                  <span className="text-ink-faint">
                    {" "}
                    ({filteredGrns.filter((r) => !r.invoice_status).length})
                  </span>
                </span>
              </div>
            }
          />
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
                    <th className="pb-2 pr-4 text-right font-medium">Value</th>
                    <th className="pb-2 pr-4 font-medium">Received</th>
                    <th className="pb-2 font-medium">Invoiced</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGrns.map((r) => (
                    <tr key={r.grn_id} className="border-b border-line last:border-0">
                      <td className="py-2 pr-4">
                        {/* Same pattern as the purchase-order report: the
                            number opens the document itself, to read, print
                            or save. */}
                        {canViewGrn ? (
                          <PdfLinkButton
                            href={`/api/export/grn/${r.grn_id}`}
                            title={`Goods received note ${r.grn_number}`}
                            filename={r.grn_number}
                            className="font-mono text-xs text-brand hover:underline"
                          >
                            {r.grn_number}
                          </PdfLinkButton>
                        ) : (
                          <span className="font-mono text-xs text-ink">{r.grn_number}</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        {canViewPo ? (
                          <PdfLinkButton
                            href={`/api/export/po/${r.po_id}`}
                            title={`Purchase order ${r.po_number}`}
                            filename={r.po_number}
                            className="font-mono text-xs text-ink-soft hover:text-brand hover:underline"
                          >
                            {r.po_number}
                          </PdfLinkButton>
                        ) : (
                          <span className="font-mono text-xs text-ink-soft">{r.po_number}</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 tnum">
                        <Link href={`/app/cases/${r.case_id}`} className="font-medium text-brand hover:underline">
                          {r.case_number}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 text-ink-soft">{r.department_name ?? "—"}</td>
                      <td className="py-2 pr-4">
                        <Badge tone={r.status === "inspected" ? "good" : "neutral"}>{r.status}</Badge>
                      </td>
                      <td className="py-2 pr-4 text-right tnum text-ink-soft">{formatMoney(r.received_value_cents)}</td>
                      <td className="py-2 pr-4 tnum text-ink-soft">{formatDate(r.received_at)}</td>
                      {/* Where the receipt has got to on the finance side.
                          Ending this report at the receipt is what made
                          invoicing look like a separate system. */}
                      <td className="py-2">
                        {r.invoice_status ? (
                          <span className="flex items-center gap-1.5">
                            <Badge tone={r.invoice_status === "paid" ? "good" : r.invoice_status === "exception" ? "critical" : "info"}>
                              {r.invoice_status}
                            </Badge>
                            <span className="font-mono text-xs text-ink-faint">{r.invoice_number}</span>
                          </span>
                        ) : (
                          <span className="text-xs text-ink-faint">Not yet invoiced</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <RecordCount shown={filteredGrns.length} total={grnRows.length} noun="goods receipt" />
          </CardBody>
        </Card>
      )}

      {key === "invoices" && (
        <Card>
          <CardHeader title={"Invoices submitted in this period"} />
          <CardBody className="overflow-x-auto">
            {filteredInvoices.length === 0 ? (
              <p className="text-sm text-ink-faint">{invoiceRows.length === 0 ? "No invoices submitted in this period." : "Nothing matches these filters."}</p>
            ) : (
              <InvoicesTable rows={filteredInvoices} canPay={can(session, "finance.payment.approve")} canViewDocument={canViewInvoice} canViewPo={canViewPo} />
            )}
            <RecordCount shown={filteredInvoices.length} total={invoiceRows.length} noun="invoice" />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
