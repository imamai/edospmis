import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Priority } from "@/lib/database.types";

export interface RequisitionListItem {
  case_id: string;
  case_number: string;
  title: string;
  status: string;
  priority: Priority;
  amount_cents: number;
  currency: string;
  department_name: string | null;
  requester_name: string | null;
  opened_at: string;
}

export interface RequisitionOverview {
  rows: RequisitionListItem[];
  /** Count of cases per `status` (== stage key), for the KPI cards and the chevron strip. */
  counts: Record<string, number>;
}

/**
 * The cheap read behind the sidebar's nav-count badges — runs in the root
 * `/app` layout on *every* page under it, so it deliberately fetches only
 * `status` (one column, no joins) rather than reusing `getRequisitionOverview`,
 * which pulls in PRs/departments/requesters that no nav badge needs. Wrapped
 * in `cache()` so if the Requisitions page's own render also wants counts in
 * the same request, it can call this instead of recomputing them.
 */
export const getRequisitionStageCounts = cache(async (tenantId: string): Promise<Record<string, number>> => {
  const supabase = await createClient();
  const { data } = await supabase.from("edospmis_cases").select("status").eq("tenant_id", tenantId);
  const counts: Record<string, number> = {};
  for (const row of data ?? []) counts[row.status] = (counts[row.status] ?? 0) + 1;
  return counts;
});

/**
 * The fuller tenant-wide read behind the Requisitions pipeline page's
 * list/detail — cases joined to PRs, departments and requesters. Only the
 * Requisitions page itself calls this; every other page under `/app` only
 * needs `getRequisitionStageCounts` above, which is why the two are split
 * rather than one function serving both (that used to run this whole join
 * on every single `/app/*` page load via the layout, adding a needless
 * ~4-query tax to pages that never render a requisition list).
 *
 * Fetches every case+PR in the tenant unfiltered — matches the scale
 * assumption already stated in ARCHITECTURE.md §4.4 ("hundreds, not
 * millions, of open items"), and the same batch-fetch-then-Map-join style
 * `getMyWork` already uses, rather than introducing a paginated/server-side
 * search path nothing else in this codebase has yet.
 */
export const getRequisitionOverview = cache(async (tenantId: string): Promise<RequisitionOverview> => {
  const supabase = await createClient();
  const { data: cases } = await supabase
    .from("edospmis_cases")
    .select("id, case_number, status, priority, opened_at, department_id")
    .eq("tenant_id", tenantId)
    .order("opened_at", { ascending: false });
  if (!cases || cases.length === 0) return { rows: [], counts: {} };

  const caseIds = cases.map((c) => c.id);
  const [{ data: prs }, { data: departments }] = await Promise.all([
    supabase
      .from("edospmis_prs")
      .select("case_id, title, estimated_cost_cents, currency, requester_id, department_id")
      .in("case_id", caseIds),
    supabase.from("edospmis_departments").select("id, name").eq("tenant_id", tenantId),
  ]);
  const prByCase = new Map((prs ?? []).map((p) => [p.case_id, p]));
  const deptById = new Map((departments ?? []).map((d) => [d.id, d.name as string]));

  const requesterIds = [...new Set((prs ?? []).map((p) => p.requester_id).filter(Boolean))];
  const { data: requesters } = requesterIds.length
    ? await supabase.from("edospmis_users").select("id, full_name, email").in("id", requesterIds)
    : { data: [] as { id: string; full_name: string | null; email: string }[] };
  const requesterById = new Map((requesters ?? []).map((u) => [u.id, u.full_name ?? u.email]));

  const counts: Record<string, number> = {};
  const rows: RequisitionListItem[] = [];
  for (const c of cases) {
    counts[c.status] = (counts[c.status] ?? 0) + 1;
    const pr = prByCase.get(c.id);
    if (!pr) continue; // every case has exactly one PR by construction; defensive only
    rows.push({
      case_id: c.id,
      case_number: c.case_number,
      title: pr.title,
      status: c.status,
      priority: c.priority as Priority,
      amount_cents: pr.estimated_cost_cents,
      currency: pr.currency,
      department_name: deptById.get(pr.department_id ?? "") ?? deptById.get(c.department_id ?? "") ?? null,
      requester_name: requesterById.get(pr.requester_id) ?? null,
      opened_at: c.opened_at,
    });
  }
  return { rows, counts };
});

/** Stage keys that count as "still moving" for the open-requisitions KPI — everything except the four terminal statuses. */
export const OPEN_STATUSES = [
  "draft",
  "submitted",
  "approval",
  "approved",
  "procurement",
  "po_approval",
  "awarded",
  "receiving",
  "finance",
  "delivery",
];
