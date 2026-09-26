import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ReportPeriod } from "@/lib/data/analytics";

interface CaseLookup {
  case_number: string;
  department_name: string | null;
}

/** Shared by all four reports below: case_id -> {case_number, department_name}, one batched pair of queries instead of a per-row join. */
async function lookupCases(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  caseIds: string[],
): Promise<Map<string, CaseLookup>> {
  if (caseIds.length === 0) return new Map();
  const [{ data: cases }, { data: departments }] = await Promise.all([
    supabase.from("edospmis_cases").select("id, case_number, department_id").eq("tenant_id", tenantId).in("id", caseIds),
    supabase.from("edospmis_departments").select("id, name").eq("tenant_id", tenantId),
  ]);
  const deptById = new Map((departments ?? []).map((d) => [d.id, d.name as string]));
  return new Map((cases ?? []).map((c) => [c.id, { case_number: c.case_number, department_name: deptById.get(c.department_id ?? "") ?? null }]));
}

export interface RfqReportRow {
  rfq_id: string;
  case_id: string;
  case_number: string;
  department_name: string | null;
  title: string;
  status: string;
  closing_date: string | null;
  invited_count: number;
  quotation_count: number;
  created_at: string;
}

export async function getRfqReport(tenantId: string, period?: ReportPeriod): Promise<RfqReportRow[]> {
  const supabase = await createClient();
  let query = supabase.from("edospmis_rfqs").select("id, case_id, title, status, closing_date, created_at").eq("tenant_id", tenantId);
  if (period?.from) query = query.gte("created_at", period.from);
  if (period?.to) query = query.lte("created_at", period.to);
  const { data: rfqs } = await query.order("created_at", { ascending: false });
  if (!rfqs || rfqs.length === 0) return [];

  const rfqIds = rfqs.map((r) => r.id);
  const [caseByIdMap, { data: invites }, { data: quotations }] = await Promise.all([
    lookupCases(supabase, tenantId, rfqs.map((r) => r.case_id)),
    supabase.from("edospmis_rfq_suppliers").select("rfq_id").in("rfq_id", rfqIds),
    supabase.from("edospmis_quotations").select("rfq_id").in("rfq_id", rfqIds),
  ]);
  const invitedCount = new Map<string, number>();
  for (const i of invites ?? []) invitedCount.set(i.rfq_id, (invitedCount.get(i.rfq_id) ?? 0) + 1);
  const quotationCount = new Map<string, number>();
  for (const q of quotations ?? []) quotationCount.set(q.rfq_id, (quotationCount.get(q.rfq_id) ?? 0) + 1);

  return rfqs.map((r) => {
    const c = caseByIdMap.get(r.case_id);
    return {
      rfq_id: r.id,
      case_id: r.case_id,
      case_number: c?.case_number ?? "",
      department_name: c?.department_name ?? null,
      title: r.title,
      status: r.status,
      closing_date: r.closing_date,
      invited_count: invitedCount.get(r.id) ?? 0,
      quotation_count: quotationCount.get(r.id) ?? 0,
      created_at: r.created_at,
    };
  });
}

export interface PurchaseOrderReportRow {
  po_id: string;
  case_id: string;
  case_number: string;
  department_name: string | null;
  po_number: string;
  supplier_id: string;
  supplier_name: string;
  total_cents: number;
  currency: string;
  status: string;
  issued_at: string;
}

export async function getPurchaseOrderReport(tenantId: string, period?: ReportPeriod): Promise<PurchaseOrderReportRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("edospmis_purchase_orders")
    .select("id, case_id, po_number, supplier_id, total_cents, currency, status, issued_at, edospmis_suppliers(name)")
    .eq("tenant_id", tenantId);
  if (period?.from) query = query.gte("issued_at", period.from);
  if (period?.to) query = query.lte("issued_at", period.to);
  const { data: pos } = await query.order("issued_at", { ascending: false });
  if (!pos || pos.length === 0) return [];

  const caseByIdMap = await lookupCases(supabase, tenantId, pos.map((p) => p.case_id));
  return pos.map((p) => {
    const c = caseByIdMap.get(p.case_id);
    const supplier = p.edospmis_suppliers as unknown as { name: string } | null;
    return {
      po_id: p.id,
      case_id: p.case_id,
      case_number: c?.case_number ?? "",
      department_name: c?.department_name ?? null,
      po_number: p.po_number,
      supplier_id: p.supplier_id,
      supplier_name: supplier?.name ?? "",
      total_cents: p.total_cents,
      currency: p.currency,
      status: p.status,
      issued_at: p.issued_at,
    };
  });
}

export interface GoodsReceivedReportRow {
  grn_id: string;
  case_id: string;
  case_number: string;
  department_name: string | null;
  grn_number: string;
  po_number: string;
  status: string;
  received_at: string;
}

export async function getGoodsReceivedReport(tenantId: string, period?: ReportPeriod): Promise<GoodsReceivedReportRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("edospmis_grns")
    .select("id, case_id, grn_number, status, received_at, edospmis_purchase_orders(po_number)")
    .eq("tenant_id", tenantId);
  if (period?.from) query = query.gte("received_at", period.from);
  if (period?.to) query = query.lte("received_at", period.to);
  const { data: grns } = await query.order("received_at", { ascending: false });
  if (!grns || grns.length === 0) return [];

  const caseByIdMap = await lookupCases(supabase, tenantId, grns.map((g) => g.case_id));
  return grns.map((g) => {
    const c = caseByIdMap.get(g.case_id);
    const po = g.edospmis_purchase_orders as unknown as { po_number: string } | null;
    return {
      grn_id: g.id,
      case_id: g.case_id,
      case_number: c?.case_number ?? "",
      department_name: c?.department_name ?? null,
      grn_number: g.grn_number,
      po_number: po?.po_number ?? "",
      status: g.status,
      received_at: g.received_at,
    };
  });
}

export interface InvoiceReportRow {
  invoice_id: string;
  case_id: string;
  case_number: string;
  department_name: string | null;
  invoice_number: string;
  supplier_name: string;
  total_cents: number;
  currency: string;
  status: string;
  due_date: string | null;
  submitted_at: string;
}

export async function getInvoiceReport(tenantId: string, period?: ReportPeriod): Promise<InvoiceReportRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("edospmis_invoices")
    .select("id, case_id, invoice_number, total_cents, currency, status, due_date, submitted_at, edospmis_suppliers(name)")
    .eq("tenant_id", tenantId);
  if (period?.from) query = query.gte("submitted_at", period.from);
  if (period?.to) query = query.lte("submitted_at", period.to);
  const { data: invoices } = await query.order("submitted_at", { ascending: false });
  if (!invoices || invoices.length === 0) return [];

  const caseByIdMap = await lookupCases(supabase, tenantId, invoices.map((i) => i.case_id));
  return invoices.map((i) => {
    const c = caseByIdMap.get(i.case_id);
    const supplier = i.edospmis_suppliers as unknown as { name: string } | null;
    return {
      invoice_id: i.id,
      case_id: i.case_id,
      case_number: c?.case_number ?? "",
      department_name: c?.department_name ?? null,
      invoice_number: i.invoice_number,
      supplier_name: supplier?.name ?? "",
      total_cents: i.total_cents,
      currency: i.currency,
      status: i.status,
      due_date: i.due_date,
      submitted_at: i.submitted_at,
    };
  });
}
