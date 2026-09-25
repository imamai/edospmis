import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getAnalytics, type AnalyticsData } from "@/lib/data/analytics";
import { getMyWork } from "@/lib/data/cases";
import { formatMoney, formatDate } from "@/lib/utils";

export interface ToolContext {
  tenantId: string;
  userId: string;
  myRoleIds: string[];
  /** Memoized per assistant turn — several tools read the same report bundle;
   *  this avoids re-running all five aggregation queries per tool call. */
  getAnalytics: () => Promise<AnalyticsData>;
}

export function createToolContext(tenantId: string, userId: string, myRoleIds: string[]): ToolContext {
  let cached: Promise<AnalyticsData> | null = null;
  return {
    tenantId,
    userId,
    myRoleIds,
    getAnalytics: () => (cached ??= getAnalytics(tenantId)),
  };
}

export interface Tool {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  /** How the tool call is described under the answer, for the evidence trail. */
  label: (input: Record<string, unknown>) => string;
  run: (ctx: ToolContext, input: Record<string, unknown>) => Promise<unknown>;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const daysFromMinutes = (m: number) => round1(m / 1440);

export const TOOLS: Tool[] = [
  {
    name: "open_requests_aging",
    description:
      "Every request/case still open (not yet completed, rejected or cancelled), oldest first, with how many days it has been open. Use for backlog, aging, overdue or stuck requests.",
    input_schema: { type: "object", properties: {} },
    label: () => "Open requests by age",
    run: async (ctx) => {
      const data = await ctx.getAnalytics();
      return {
        count: data.aging.length,
        cases: data.aging.slice(0, 40).map((c) => ({
          case_number: c.case_number,
          title: c.title,
          stage: c.status,
          priority: c.priority,
          days_open: c.days_open,
        })),
      };
    },
  },
  {
    name: "stage_cycle_times",
    description:
      "Average time (in days) spent in each stage of the procurement pipeline (draft, approval, procurement, PO approval, awarded, receiving, finance, delivery, completed), and how many cases are sitting in each stage right now. Use for cycle time, turnaround, bottlenecks, or 'where do things get stuck'.",
    input_schema: { type: "object", properties: {} },
    label: () => "Stage cycle times",
    run: async (ctx) => {
      const data = await ctx.getAnalytics();
      return data.stageDurations.map((s) => ({
        stage: s.stage_key,
        cases_seen: s.cases_seen,
        currently_in_this_stage: s.currently_in,
        avg_days: daysFromMinutes(s.avg_minutes),
      }));
    },
  },
  {
    name: "approval_sla_compliance",
    description: "For each stage with an SLA target configured, how many completed tasks were decided on time vs. breached the target.",
    input_schema: { type: "object", properties: {} },
    label: () => "SLA compliance",
    run: async (ctx) => {
      const data = await ctx.getAnalytics();
      return data.slaCompliance.map((s) => ({
        stage: s.stage_key,
        total: s.total,
        on_time: s.on_time,
        breached: s.breached,
        on_time_percent: s.total > 0 ? Math.round((s.on_time / s.total) * 100) : null,
      }));
    },
  },
  {
    name: "supplier_performance",
    description:
      "Every supplier with at least one purchase order: number of POs, total spend, the share of goods-received items marked 'accepted' vs damaged/short/rejected, and average days from PO award to first receipt.",
    input_schema: { type: "object", properties: {} },
    label: () => "Supplier performance",
    run: async (ctx) => {
      const data = await ctx.getAnalytics();
      return data.supplierPerformance.map((s) => ({
        supplier: s.supplier_name,
        po_count: s.po_count,
        total_spend: formatMoney(s.total_cents),
        accepted_item_rate: s.total_items > 0 ? `${Math.round((s.accepted_items / s.total_items) * 100)}%` : "no receipts yet",
        avg_days_award_to_first_receipt: s.avg_days_award_to_grn === null ? null : round1(s.avg_days_award_to_grn),
      }));
    },
  },
  {
    name: "spend_by_category",
    description: "Estimated spend and number of requests, grouped by the category a request was filed under.",
    input_schema: { type: "object", properties: {} },
    label: () => "Spend by category",
    run: async (ctx) => {
      const data = await ctx.getAnalytics();
      return data.spendByCategory.map((c) => ({
        category: c.category_name,
        requests: c.pr_count,
        total_estimated_spend: formatMoney(c.total_estimated_cents),
      }));
    },
  },
  {
    name: "my_pending_approvals",
    description: "Requests currently waiting on a decision from a role this person holds — what's on their own plate right now.",
    input_schema: { type: "object", properties: {} },
    label: () => "My pending approvals",
    run: async (ctx) => {
      const items = await getMyWork(ctx.tenantId, ctx.myRoleIds);
      return {
        count: items.length,
        items: items.map((i) => ({
          case_number: i.case_number,
          title: i.pr_title,
          amount: formatMoney(i.estimated_cost_cents, { currency: i.currency }),
          priority: i.priority,
          role: i.role_name,
          due_at: i.due_at,
        })),
      };
    },
  },
  {
    name: "find_case",
    description: "Search for a case by its case number (e.g. CASE-2026-000012) or by a few words from the request's title.",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    label: (i) => `Find case: "${i.query}"`,
    run: async (ctx, input) => {
      const q = String(input.query ?? "").trim();
      if (!q) return { error: "Give a case number or a few words from the title." };
      const supabase = await createClient();

      const [{ data: byNumber }, { data: byTitle }] = await Promise.all([
        supabase
          .from("edospmis_cases")
          .select("id, case_number, status, priority, edospmis_prs(title, estimated_cost_cents, currency)")
          .eq("tenant_id", ctx.tenantId)
          .ilike("case_number", `%${q}%`)
          .limit(10),
        supabase
          .from("edospmis_prs")
          .select("title, estimated_cost_cents, currency, edospmis_cases(id, case_number, status, priority)")
          .eq("tenant_id", ctx.tenantId)
          .ilike("title", `%${q}%`)
          .limit(10),
      ]);

      type Row = { id: string; case_number: string; status: string; priority: string; title: string; amount: number; currency: string };
      const rows = new Map<string, Row>();
      for (const c of byNumber ?? []) {
        const pr = (Array.isArray(c.edospmis_prs) ? c.edospmis_prs[0] : c.edospmis_prs) as { title: string; estimated_cost_cents: number; currency: string } | null;
        rows.set(c.id, { id: c.id, case_number: c.case_number, status: c.status, priority: c.priority, title: pr?.title ?? "(untitled)", amount: pr?.estimated_cost_cents ?? 0, currency: pr?.currency ?? "KES" });
      }
      for (const pr of byTitle ?? []) {
        const c = (Array.isArray(pr.edospmis_cases) ? pr.edospmis_cases[0] : pr.edospmis_cases) as { id: string; case_number: string; status: string; priority: string } | null;
        if (c && !rows.has(c.id)) {
          rows.set(c.id, { id: c.id, case_number: c.case_number, status: c.status, priority: c.priority, title: pr.title, amount: pr.estimated_cost_cents, currency: pr.currency });
        }
      }

      if (rows.size === 0) return { error: "No case matches that." };
      return Array.from(rows.values())
        .slice(0, 10)
        .map((r) => ({ case_number: r.case_number, title: r.title, status: r.status, priority: r.priority, amount: formatMoney(r.amount, { currency: r.currency }) }));
    },
  },
  {
    name: "case_details",
    description: "The full picture of one case by its case number: request details, approval status, purchase order, goods received, invoice/payment and delivery, whichever of those exist yet.",
    input_schema: { type: "object", properties: { case_number: { type: "string" } }, required: ["case_number"] },
    label: (i) => `Case ${i.case_number}`,
    run: async (ctx, input) => {
      const caseNumber = String(input.case_number ?? "").trim();
      const supabase = await createClient();
      const { data: c } = await supabase
        .from("edospmis_cases")
        .select("*, edospmis_prs(*)")
        .eq("tenant_id", ctx.tenantId)
        .eq("case_number", caseNumber)
        .maybeSingle();
      if (!c) return { error: "No case with that number." };
      const pr = (Array.isArray(c.edospmis_prs) ? c.edospmis_prs[0] : c.edospmis_prs) as {
        title: string; justification: string | null; items: { description: string; qty: number; unit: string }[];
        estimated_cost_cents: number; currency: string; required_by: string | null;
      } | null;

      const [{ data: po }, { data: grns }, { data: invoice }, { data: delivery }] = await Promise.all([
        supabase.from("edospmis_purchase_orders").select("po_number, status, total_cents, currency, expected_delivery_date, issued_at").eq("case_id", c.id).maybeSingle(),
        supabase.from("edospmis_grns").select("grn_number, status, received_at, edospmis_grn_items(description, ordered_qty, received_qty, condition)").eq("case_id", c.id),
        supabase.from("edospmis_invoices").select("invoice_number, status, total_cents, currency, due_date").eq("case_id", c.id).maybeSingle(),
        supabase.from("edospmis_deliveries").select("status, scheduled_at, delivered_at, client_confirmed_at").eq("case_id", c.id).maybeSingle(),
      ]);

      return {
        case_number: c.case_number,
        status: c.status,
        priority: c.priority,
        on_hold: c.on_hold ? c.on_hold_reason ?? true : false,
        blocked: c.blocked ? c.blocked_reason ?? true : false,
        opened: formatDate(c.opened_at),
        closed: c.closed_at ? formatDate(c.closed_at) : null,
        request: pr && {
          title: pr.title,
          justification: pr.justification,
          items: pr.items,
          estimated_cost: formatMoney(pr.estimated_cost_cents, { currency: pr.currency }),
          required_by: pr.required_by ? formatDate(pr.required_by) : null,
        },
        purchase_order: po && {
          po_number: po.po_number,
          status: po.status,
          total: formatMoney(po.total_cents, { currency: po.currency }),
          expected_delivery_date: po.expected_delivery_date ? formatDate(po.expected_delivery_date) : null,
          issued: formatDate(po.issued_at),
        },
        goods_received: (grns ?? []).map((g) => ({
          grn_number: g.grn_number,
          status: g.status,
          received: formatDate(g.received_at),
          items: g.edospmis_grn_items,
        })),
        invoice: invoice && {
          invoice_number: invoice.invoice_number,
          status: invoice.status,
          total: formatMoney(invoice.total_cents, { currency: invoice.currency }),
          due_date: invoice.due_date ? formatDate(invoice.due_date) : null,
        },
        delivery: delivery && {
          status: delivery.status,
          scheduled: delivery.scheduled_at ? formatDate(delivery.scheduled_at) : null,
          delivered: delivery.delivered_at ? formatDate(delivery.delivered_at) : null,
          client_confirmed: !!delivery.client_confirmed_at,
        },
      };
    },
  },
  {
    name: "supplier_lookup",
    description: "Find a supplier by name and see their contact details alongside their performance (POs, spend, acceptance rate).",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    label: (i) => `Supplier "${i.query}"`,
    run: async (ctx, input) => {
      const q = String(input.query ?? "").trim();
      if (!q) return { error: "Give a supplier name." };
      const supabase = await createClient();
      const { data } = await supabase
        .from("edospmis_suppliers")
        .select("id, name, email, phone, is_active")
        .eq("tenant_id", ctx.tenantId)
        .ilike("name", `%${q}%`)
        .limit(5);
      if (!data || data.length === 0) return { error: "No supplier matches that." };

      const perf = (await ctx.getAnalytics()).supplierPerformance;
      return data.map((s) => {
        const p = perf.find((x) => x.supplier_id === s.id);
        return {
          name: s.name,
          email: s.email,
          phone: s.phone,
          active: s.is_active,
          po_count: p?.po_count ?? 0,
          total_spend: p ? formatMoney(p.total_cents) : formatMoney(0),
          accepted_item_rate: p && p.total_items > 0 ? `${Math.round((p.accepted_items / p.total_items) * 100)}%` : "no receipts yet",
        };
      });
    },
  },
  {
    name: "contracts_overview",
    description: "Contracts by status (draft, sent, signed, void), with a short list of the most recently updated ones and who they're with.",
    input_schema: { type: "object", properties: {} },
    label: () => "Contracts overview",
    run: async (ctx) => {
      const supabase = await createClient();
      const { data } = await supabase
        .from("edospmis_contracts")
        .select("title, status, contract_type, created_at, edospmis_clients(name)")
        .eq("tenant_id", ctx.tenantId)
        .order("created_at", { ascending: false })
        .limit(60);
      if (!data || data.length === 0) return { count: 0, by_status: {}, recent: [] };

      const byStatus: Record<string, number> = {};
      for (const c of data) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;

      return {
        count: data.length,
        by_status: byStatus,
        recent: data.slice(0, 10).map((c) => {
          const client = (Array.isArray(c.edospmis_clients) ? c.edospmis_clients[0] : c.edospmis_clients) as { name: string } | null;
          return { title: c.title, status: c.status, type: c.contract_type, client: client?.name ?? null, created: formatDate(c.created_at) };
        }),
      };
    },
  },
];

export async function runTool(ctx: ToolContext, name: string, input: Record<string, unknown>): Promise<unknown> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { error: "Unknown tool." };
  try {
    return await tool.run(ctx, input);
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : "That could not be worked out." };
  }
}
