import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ReportPeriod } from "@/lib/data/analytics";
import { averageGap, dayGap, deliveryState, deliveryVariance } from "@/lib/cycle-time";

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
  /**
   * Billed against this order so far, net of tax and of anything voided.
   *
   * An issued order is money committed: the obligation exists from the moment
   * it goes to the supplier, whether or not an invoice has arrived. What is
   * committed and not yet billed is the part of that obligation still to
   * land, and it appeared nowhere — so the only spend the system could show
   * was spend that had already been invoiced.
   */
  invoiced_net_cents: number;
  /** The date the supplier agreed to deliver by — null where none was set. */
  expected_delivery_date: string | null;
  /** The first receipt against this order, which is what the window is judged on. */
  first_received_at: string | null;
  /** Whole days late (negative: early). Null until there is both a window and a receipt. */
  delivery_variance_days: number | null;
}

export async function getPurchaseOrderReport(tenantId: string, period?: ReportPeriod): Promise<PurchaseOrderReportRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("edospmis_purchase_orders")
    .select("id, case_id, po_number, supplier_id, total_cents, currency, status, issued_at, expected_delivery_date, edospmis_suppliers(name)")
    .eq("tenant_id", tenantId);
  if (period?.from) query = query.gte("issued_at", period.from);
  if (period?.to) query = query.lte("issued_at", period.to);
  const { data: pos } = await query.order("issued_at", { ascending: false });
  if (!pos || pos.length === 0) return [];

  const [caseByIdMap, { data: invoices }, { data: receipts }] = await Promise.all([
    lookupCases(supabase, tenantId, pos.map((p) => p.case_id)),
    supabase
      .from("edospmis_invoices")
      .select("po_id, subtotal_cents, status")
      .eq("tenant_id", tenantId)
      .in("po_id", pos.map((p) => p.id)),
    // Oldest first, so the first one seen per order is the first delivery —
    // a part delivery still stops the clock on the window.
    supabase
      .from("edospmis_grns")
      .select("po_id, received_at")
      .eq("tenant_id", tenantId)
      .in("po_id", pos.map((p) => p.id))
      .order("received_at", { ascending: true }),
  ]);
  const firstReceiptByPo = new Map<string, string>();
  for (const g of receipts ?? []) if (!firstReceiptByPo.has(g.po_id)) firstReceiptByPo.set(g.po_id, g.received_at);
  const billedByPo = new Map<string, number>();
  for (const i of invoices ?? []) {
    if (i.status === "void") continue;
    billedByPo.set(i.po_id, (billedByPo.get(i.po_id) ?? 0) + i.subtotal_cents);
  }

  return pos.map((p) => {
    const c = caseByIdMap.get(p.case_id);
    const supplier = p.edospmis_suppliers as unknown as { name: string } | null;
    const firstReceipt = firstReceiptByPo.get(p.id) ?? null;
    return {
      expected_delivery_date: p.expected_delivery_date,
      first_received_at: firstReceipt,
      delivery_variance_days: deliveryVariance(p.expected_delivery_date, firstReceipt),
      invoiced_net_cents: billedByPo.get(p.id) ?? 0,
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
  po_id: string;
  case_id: string;
  case_number: string;
  department_name: string | null;
  grn_number: string;
  po_number: string;
  status: string;
  received_at: string;
  /**
   * Where this receipt has got to on the finance side — null when nothing has
   * been invoiced against it yet. Receiving and invoicing are one chain, and
   * this report used to end at the receipt, which is what made invoicing look
   * like a separate system rather than the next step.
   */
  invoice_number: string | null;
  invoice_status: string | null;
  /**
   * What this receipt is worth, priced from the purchase order it was
   * received against — a goods-received note carries quantities but no money.
   *
   * Received and not yet invoiced is a liability already incurred: the goods
   * are ours, the supplier is owed, and only the paperwork is outstanding.
   * Leaving it out of sight understates what is owed, which is why this is
   * summed separately below.
   */
  received_value_cents: number;
}

export async function getGoodsReceivedReport(tenantId: string, period?: ReportPeriod): Promise<GoodsReceivedReportRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("edospmis_grns")
    .select("id, po_id, case_id, grn_number, status, received_at, edospmis_purchase_orders(po_number)")
    .eq("tenant_id", tenantId);
  if (period?.from) query = query.gte("received_at", period.from);
  if (period?.to) query = query.lte("received_at", period.to);
  const { data: grns } = await query.order("received_at", { ascending: false });
  if (!grns || grns.length === 0) return [];

  const poIds = [...new Set(grns.map((g) => g.po_id))];
  const [caseByIdMap, { data: invoices }, { data: pos }, { data: grnItems }] = await Promise.all([
    lookupCases(supabase, tenantId, grns.map((g) => g.case_id)),
    // One invoice per purchase order (there is a unique index on po_id), so
    // this is a lookup, not an aggregate.
    supabase.from("edospmis_invoices").select("po_id, invoice_number, status").eq("tenant_id", tenantId).in("po_id", poIds),
    supabase.from("edospmis_purchase_orders").select("id, items").eq("tenant_id", tenantId).in("id", poIds),
    supabase.from("edospmis_grn_items").select("grn_id, description, received_qty").in("grn_id", grns.map((g) => g.id)),
  ]);
  const invoiceByPo = new Map((invoices ?? []).map((i) => [i.po_id, i]));

  // A receipt is priced from its order line — matched on description, which
  // is what the receiving form copies across from the purchase order.
  const unitCostByPo = new Map<string, Map<string, number>>();
  for (const po of pos ?? []) {
    const byDescription = new Map<string, number>();
    for (const item of (po.items ?? []) as { description: string; estimated_unit_cost_cents: number }[]) {
      byDescription.set(item.description, item.estimated_unit_cost_cents ?? 0);
    }
    unitCostByPo.set(po.id, byDescription);
  }
  const itemsByGrn = new Map<string, { description: string; received_qty: number }[]>();
  for (const item of grnItems ?? []) {
    const list = itemsByGrn.get(item.grn_id) ?? [];
    list.push(item);
    itemsByGrn.set(item.grn_id, list);
  }

  return grns.map((g) => {
    const c = caseByIdMap.get(g.case_id);
    const po = g.edospmis_purchase_orders as unknown as { po_number: string } | null;
    const invoice = invoiceByPo.get(g.po_id);
    const unitCosts = unitCostByPo.get(g.po_id);
    const receivedValue = (itemsByGrn.get(g.id) ?? []).reduce(
      (sum, item) => sum + Math.round(item.received_qty * (unitCosts?.get(item.description) ?? 0)),
      0,
    );
    return {
      invoice_number: invoice?.invoice_number ?? null,
      invoice_status: invoice?.status ?? null,
      received_value_cents: receivedValue,
      grn_id: g.id,
      po_id: g.po_id,
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
  /** The purchase order this invoice settles — an invoice never exists without one. */
  po_id: string | null;
  po_number: string | null;
  supplier_id: string | null;
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
    .select("id, case_id, po_id, invoice_number, supplier_id, total_cents, currency, status, due_date, submitted_at, edospmis_suppliers(name), edospmis_purchase_orders(po_number)")
    .eq("tenant_id", tenantId);
  if (period?.from) query = query.gte("submitted_at", period.from);
  if (period?.to) query = query.lte("submitted_at", period.to);
  const { data: invoices } = await query.order("submitted_at", { ascending: false });
  if (!invoices || invoices.length === 0) return [];

  const caseByIdMap = await lookupCases(supabase, tenantId, invoices.map((i) => i.case_id));
  return invoices.map((i) => {
    const c = caseByIdMap.get(i.case_id);
    const supplier = i.edospmis_suppliers as unknown as { name: string } | null;
    const po = i.edospmis_purchase_orders as unknown as { po_number: string } | null;
    return {
      invoice_id: i.id,
      case_id: i.case_id,
      case_number: c?.case_number ?? "",
      department_name: c?.department_name ?? null,
      invoice_number: i.invoice_number,
      po_id: (i.po_id as string | null) ?? null,
      po_number: po?.po_number ?? null,
      supplier_id: (i.supplier_id as string | null) ?? null,
      supplier_name: supplier?.name ?? "",
      total_cents: i.total_cents,
      currency: i.currency,
      status: i.status,
      due_date: i.due_date,
      submitted_at: i.submitted_at,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Procure-to-receive cycle time
// ─────────────────────────────────────────────────────────────────────────

export interface CycleTimeReportRow {
  case_id: string;
  case_number: string;
  title: string;
  department_name: string | null;
  /** Where the request has got to, so a blank gap reads as "not there yet". */
  status: string;

  pr_created_at: string;
  /** When the last approval step cleared — null if it never did. */
  pr_approved_at: string | null;

  /** The date on the order the supplier sees. */
  po_date: string | null;
  /** When the order record was raised in the system. */
  po_created_at: string | null;
  po_approved_at: string | null;
  po_number: string | null;

  /** What the supplier agreed to, and how the delivery measured against it. */
  expected_delivery_date: string | null;
  delivery_variance_days: number | null;
  /** When the order itself ended — null while it is still live. */
  po_closed_at: string | null;

  grn_date: string | null;
  grn_number: string | null;
  /** How many receipts this order has — a part delivery is not the whole. */
  grn_count: number;

  days_pr_to_pr_approval: number | null;
  days_pr_to_po: number | null;
  days_po_to_po_approval: number | null;
  days_po_approval_to_grn: number | null;
}

/**
 * One row per purchase request, from raised to goods received.
 *
 * The standard procurement cycle-time sheet: every gate a request passes
 * through, with the elapsed days between them, so the step that is actually
 * costing the time is visible instead of inferred. `Time in each stage`
 * already averages this across the workspace — this is the per-request
 * working underneath it, which is what gets sent to a department head or an
 * auditor who wants to see the individual case.
 *
 * Sources, none of them inferred:
 *   PR created    edospmis_prs.created_at
 *   PR approved   the case's 'approved' stage-history row. Not `max(decided_at)`
 *                 over approvals — a rejected request has approved steps too,
 *                 and that would report the last one as though the request had
 *                 cleared.
 *   PO date       edospmis_purchase_orders.issued_at
 *   PO generated  edospmis_purchase_orders.created_at
 *   PO approved   edospmis_purchase_orders.approved_at (migration 0042)
 *   GRPO          the first edospmis_grns row against the order
 *
 * Where a case has several orders or several receipts, this takes the first
 * of each and reports the receipt count, because the question the report
 * answers is when the cycle reached that gate, not how many documents it
 * eventually produced.
 */
export async function getCycleTimeReport(tenantId: string, period?: ReportPeriod): Promise<CycleTimeReportRow[]> {
  const supabase = await createClient();

  let query = supabase
    .from("edospmis_prs")
    .select("id, case_id, title, department_id, created_at")
    .eq("tenant_id", tenantId);
  if (period?.from) query = query.gte("created_at", period.from);
  if (period?.to) query = query.lte("created_at", period.to);
  const { data: prs } = await query.order("created_at", { ascending: false });
  if (!prs || prs.length === 0) return [];

  const caseIds = prs.map((p) => p.case_id);
  const [{ data: cases }, { data: departments }, { data: approvedStages }, { data: pos }, { data: grns }] =
    await Promise.all([
      supabase.from("edospmis_cases").select("id, case_number, status, department_id").eq("tenant_id", tenantId).in("id", caseIds),
      supabase.from("edospmis_departments").select("id, name").eq("tenant_id", tenantId),
      supabase
        .from("edospmis_case_stage_history")
        .select("case_id, entered_at")
        .eq("tenant_id", tenantId)
        .eq("stage_key", "approved")
        .in("case_id", caseIds),
      supabase
        .from("edospmis_purchase_orders")
        .select("case_id, po_number, issued_at, created_at, approved_at, expected_delivery_date, closed_at")
        .eq("tenant_id", tenantId)
        .in("case_id", caseIds)
        .order("issued_at", { ascending: true }),
      supabase
        .from("edospmis_grns")
        .select("case_id, grn_number, received_at")
        .eq("tenant_id", tenantId)
        .in("case_id", caseIds)
        .order("received_at", { ascending: true }),
    ]);

  const caseById = new Map((cases ?? []).map((c) => [c.id, c]));
  const deptById = new Map((departments ?? []).map((d) => [d.id, d.name as string]));

  // A case re-entering approval after being returned gets a second 'approved'
  // row; the earliest is the one that cleared the request as raised.
  const approvedAtByCase = new Map<string, string>();
  for (const s of approvedStages ?? []) {
    const seen = approvedAtByCase.get(s.case_id);
    if (!seen || s.entered_at < seen) approvedAtByCase.set(s.case_id, s.entered_at);
  }

  // Both lists arrive oldest-first, so the first one seen for a case is the
  // earliest and later ones are skipped.
  const poByCase = new Map<
    string,
    {
      po_number: string;
      issued_at: string;
      created_at: string;
      approved_at: string | null;
      expected_delivery_date: string | null;
      closed_at: string | null;
    }
  >();
  for (const p of pos ?? []) if (!poByCase.has(p.case_id)) poByCase.set(p.case_id, p);

  const grnByCase = new Map<string, { grn_number: string; received_at: string }>();
  const grnCountByCase = new Map<string, number>();
  for (const g of grns ?? []) {
    if (!grnByCase.has(g.case_id)) grnByCase.set(g.case_id, g);
    grnCountByCase.set(g.case_id, (grnCountByCase.get(g.case_id) ?? 0) + 1);
  }

  return prs.map((pr) => {
    const c = caseById.get(pr.case_id);
    const po = poByCase.get(pr.case_id) ?? null;
    const grn = grnByCase.get(pr.case_id) ?? null;
    const prApprovedAt = approvedAtByCase.get(pr.case_id) ?? null;
    const poApprovedAt = po?.approved_at ?? null;

    return {
      case_id: pr.case_id,
      case_number: c?.case_number ?? "",
      title: pr.title,
      department_name: deptById.get(pr.department_id ?? c?.department_id ?? "") ?? null,
      status: c?.status ?? "",

      pr_created_at: pr.created_at,
      pr_approved_at: prApprovedAt,

      po_date: po?.issued_at ?? null,
      po_created_at: po?.created_at ?? null,
      po_approved_at: poApprovedAt,
      po_number: po?.po_number ?? null,

      expected_delivery_date: po?.expected_delivery_date ?? null,
      delivery_variance_days: deliveryVariance(po?.expected_delivery_date ?? null, grn?.received_at ?? null),
      po_closed_at: po?.closed_at ?? null,

      grn_date: grn?.received_at ?? null,
      grn_number: grn?.grn_number ?? null,
      grn_count: grnCountByCase.get(pr.case_id) ?? 0,

      days_pr_to_pr_approval: dayGap(pr.created_at, prApprovedAt),
      days_pr_to_po: dayGap(pr.created_at, po?.created_at ?? null),
      days_po_to_po_approval: dayGap(po?.created_at ?? null, poApprovedAt),
      days_po_approval_to_grn: dayGap(poApprovedAt, grn?.received_at ?? null),
    };
  });
}

export interface CycleGate {
  key: "pr_approval" | "sourcing" | "po_approval" | "delivery";
  label: string;
  /** Average days at this gate, or null where nothing has cleared it yet. */
  avgDays: number | null;
  /** How many requests contributed — the denominator behind the average. */
  measured: number;
}

export interface CycleSummary {
  gates: CycleGate[];
  /** The four gates added up: raised to goods received, on average. */
  totalDays: number | null;
  /** Requests raised in the window, and how many got all the way to a receipt. */
  raised: number;
  completed: number;
  /** Orders past their agreed delivery date with nothing received yet. */
  overdue: number;
  windowDays: number;
}

/**
 * The cycle in four numbers, for the dashboard.
 *
 * Bounded to a recent window rather than all time, for two reasons: a
 * workspace three years in would otherwise average its current performance
 * against how it worked when it started, and the dashboard would pull every
 * request it had ever raised on every page load.
 *
 * Each gate averages only the requests that actually cleared it — see
 * `averageGap`. A request still sitting at approval has no sourcing time, and
 * counting it as zero would report a stalled pipeline as a fast one.
 */
export async function getCycleSummary(tenantId: string, windowDays = 90): Promise<CycleSummary> {
  const from = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  const rows = await getCycleTimeReport(tenantId, { from, to: null });

  const gates: CycleGate[] = [
    {
      key: "pr_approval",
      label: "Request to approval",
      avgDays: averageGap(rows.map((r) => r.days_pr_to_pr_approval)),
      measured: rows.filter((r) => r.days_pr_to_pr_approval !== null).length,
    },
    {
      key: "sourcing",
      label: "Approval to order",
      avgDays: averageGap(rows.map((r) => r.days_pr_to_po)),
      measured: rows.filter((r) => r.days_pr_to_po !== null).length,
    },
    {
      key: "po_approval",
      label: "Order to order approved",
      avgDays: averageGap(rows.map((r) => r.days_po_to_po_approval)),
      measured: rows.filter((r) => r.days_po_to_po_approval !== null).length,
    },
    {
      key: "delivery",
      label: "Order approved to goods in",
      avgDays: averageGap(rows.map((r) => r.days_po_approval_to_grn)),
      measured: rows.filter((r) => r.days_po_approval_to_grn !== null).length,
    },
  ];

  const present = gates.map((g) => g.avgDays).filter((d): d is number => d !== null);

  return {
    gates,
    // Null rather than a partial sum: adding up three of four gates and
    // calling it the cycle would understate it without saying so.
    totalDays: present.length === gates.length
      ? Math.round(present.reduce((sum, d) => sum + d, 0) * 10) / 10
      : null,
    raised: rows.length,
    completed: rows.filter((r) => r.grn_date !== null).length,
    overdue: rows.filter((r) => deliveryState(r.expected_delivery_date, r.grn_date) === "overdue").length,
    windowDays,
  };
}
