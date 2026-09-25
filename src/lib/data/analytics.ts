import "server-only";

import { createClient } from "@/lib/supabase/server";

export interface StageDurationReport {
  stage_key: string;
  cases_seen: number;
  currently_in: number;
  avg_minutes: number;
}

export interface SlaComplianceReport {
  stage_key: string;
  total: number;
  on_time: number;
  breached: number;
}

export interface SupplierPerformanceReport {
  supplier_id: string;
  supplier_name: string;
  po_count: number;
  total_cents: number;
  accepted_items: number;
  total_items: number;
  avg_days_award_to_grn: number | null;
}

export interface SpendByCategoryReport {
  category_name: string;
  pr_count: number;
  total_estimated_cents: number;
}

export interface AgingCase {
  case_id: string;
  case_number: string;
  title: string;
  status: string;
  priority: string;
  opened_at: string;
  days_open: number;
}

const TERMINAL_STATUSES = ["closed", "rejected", "cancelled"];

export interface SlaRisk {
  case_id: string;
  case_number: string;
  pr_title: string;
  stage_key: string;
  role_name: string | null;
  due_at: string;
  minutes_remaining: number;
  typical_minutes: number | null;
  risk: "breached" | "high" | "medium" | "low";
}

export interface StageOwner {
  stage_key: string;
  role_names: string[];
}

export interface AnalyticsData {
  stageDurations: StageDurationReport[];
  slaCompliance: SlaComplianceReport[];
  supplierPerformance: SupplierPerformanceReport[];
  spendByCategory: SpendByCategoryReport[];
  aging: AgingCase[];
  slaRisk: SlaRisk[];
  stageOwners: StageOwner[];
}

export interface ReportPeriod {
  from: string | null;
  to: string | null;
}

export interface RequestsTrendPoint {
  day: string;
  request_count: number;
}

export interface StageCaseDetail {
  case_id: string;
  case_number: string;
  title: string;
  priority: string;
  entered_at: string;
  left_at: string | null;
  minutes_in_stage: number;
  still_in_stage: boolean;
}

/** Individual cases behind one stage's average, for the "Time in each stage" report's drill-down. */
export async function getStageCases(tenantId: string, stageKey: string, period?: ReportPeriod): Promise<StageCaseDetail[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("edospmis_stage_cases", {
    p_tenant_id: tenantId,
    p_stage_key: stageKey,
    p_from: period?.from ?? null,
    p_to: period?.to ?? null,
  });
  return (data ?? []) as StageCaseDetail[];
}

/** Daily request volume for the dashboard trendline — defaults to the last 30 days when no period is given, since "all time" would make a day-by-day line unreadable. */
export async function getRequestsTrend(tenantId: string, period?: ReportPeriod): Promise<RequestsTrendPoint[]> {
  const supabase = await createClient();
  const to = period?.to ?? new Date().toISOString();
  const from = period?.from ?? new Date(Date.now() - 29 * 86400000).toISOString();
  const { data } = await supabase.rpc("edospmis_report_requests_trend", { p_tenant_id: tenantId, p_from: from, p_to: to });
  return (data ?? []) as RequestsTrendPoint[];
}

export async function getAnalytics(tenantId: string, period?: ReportPeriod): Promise<AnalyticsData> {
  const supabase = await createClient();
  const p_from = period?.from ?? null;
  const p_to = period?.to ?? null;

  const [
    { data: stageDurations },
    { data: slaCompliance },
    { data: supplierPerformance },
    { data: spendByCategory },
    { data: openCases },
    { data: slaRisk },
    { data: stageOwners },
  ] = await Promise.all([
    supabase.rpc("edospmis_report_stage_durations", { p_tenant_id: tenantId, p_from, p_to }),
    supabase.rpc("edospmis_report_sla_compliance", { p_tenant_id: tenantId, p_from, p_to }),
    supabase.rpc("edospmis_report_supplier_performance", { p_tenant_id: tenantId, p_from, p_to }),
    supabase.rpc("edospmis_report_spend_by_category", { p_tenant_id: tenantId, p_from, p_to }),
    supabase
      .from("edospmis_cases")
      .select("id, case_number, status, priority, opened_at, edospmis_prs(title)")
      .eq("tenant_id", tenantId)
      .not("status", "in", `(${TERMINAL_STATUSES.join(",")})`)
      .order("opened_at", { ascending: true }),
    supabase.rpc("edospmis_predict_sla_risk", { p_tenant_id: tenantId }),
    supabase.rpc("edospmis_stage_owners", { p_tenant_id: tenantId }),
  ]);

  const now = Date.now();
  const aging: AgingCase[] = (openCases ?? []).map((c) => {
    const pr = c.edospmis_prs as unknown as { title: string }[] | { title: string } | null;
    const title = Array.isArray(pr) ? (pr[0]?.title ?? "(untitled)") : (pr?.title ?? "(untitled)");
    return {
      case_id: c.id,
      case_number: c.case_number,
      title,
      status: c.status,
      priority: c.priority,
      opened_at: c.opened_at,
      days_open: Math.floor((now - new Date(c.opened_at).getTime()) / 86400000),
    };
  });

  return {
    stageDurations: (stageDurations ?? []) as StageDurationReport[],
    slaCompliance: (slaCompliance ?? []) as SlaComplianceReport[],
    supplierPerformance: (supplierPerformance ?? []) as SupplierPerformanceReport[],
    spendByCategory: (spendByCategory ?? []) as SpendByCategoryReport[],
    aging,
    slaRisk: ((slaRisk ?? []) as SlaRisk[]).filter((r) => r.risk !== "low"),
    stageOwners: (stageOwners ?? []) as StageOwner[],
  };
}
