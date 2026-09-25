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

export interface AnalyticsData {
  stageDurations: StageDurationReport[];
  slaCompliance: SlaComplianceReport[];
  supplierPerformance: SupplierPerformanceReport[];
  spendByCategory: SpendByCategoryReport[];
  aging: AgingCase[];
}

export async function getAnalytics(tenantId: string): Promise<AnalyticsData> {
  const supabase = await createClient();

  const [{ data: stageDurations }, { data: slaCompliance }, { data: supplierPerformance }, { data: spendByCategory }, { data: openCases }] =
    await Promise.all([
      supabase.rpc("edospmis_report_stage_durations", { p_tenant_id: tenantId }),
      supabase.rpc("edospmis_report_sla_compliance", { p_tenant_id: tenantId }),
      supabase.rpc("edospmis_report_supplier_performance", { p_tenant_id: tenantId }),
      supabase.rpc("edospmis_report_spend_by_category", { p_tenant_id: tenantId }),
      supabase
        .from("edospmis_cases")
        .select("id, case_number, status, priority, opened_at, edospmis_prs(title)")
        .eq("tenant_id", tenantId)
        .not("status", "in", `(${TERMINAL_STATUSES.join(",")})`)
        .order("opened_at", { ascending: true }),
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
  };
}
