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
export const getRequisitionStageCounts = cache(
  async (tenantId: string): Promise<Record<string, number>> => {
    const supabase = await createClient();
    // Counted through the requisitions rather than straight off the cases,
    // because the requisition is where visibility is decided (migration 0052):
    // a requester sees their own, an approver what is routed to them, and only
    // some roles see everything. Counting cases directly would have shown a
    // requester a pipeline of twelve while the list below it held one.
    const { data } = await supabase
      .from("edospmis_prs")
      .select("edospmis_cases!inner(status)")
      .eq("tenant_id", tenantId);

    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      const joined = (
        row as unknown as {
          edospmis_cases: { status: string } | { status: string }[];
        }
      ).edospmis_cases;
      const status =
        (Array.isArray(joined) ? joined[0]?.status : joined?.status) ?? null;
      if (status) counts[status] = (counts[status] ?? 0) + 1;
    }
    return counts;
  },
);

/**
 * The fuller tenant-wide read behind the Requisitions pipeline page's
 * list/detail — cases joined to PRs, departments and requesters. Only the
 * Requisitions page itself calls this; every other page under `/app` only
 * needs `getRequisitionStageCounts` above, which is why the two are split
 * rather than one function serving both (that used to run this whole join
 * on every single `/app/*` page load via the layout, adding a needless
 * ~4-query tax to pages that never render a requisition list).
 *
 * Starts from the requisitions, not the cases. That order is the whole
 * point: row-level security scopes requisitions to the ones this person may
 * see (migration 0052), so taking the case list from them means the stage
 * counts, the pipeline value and the rows all describe the same set. Reading
 * cases first would have counted the tenant's whole pipeline and then listed
 * only the viewer's own — which is exactly the mismatch this replaced.
 *
 * Still unpaginated, matching the scale assumption in ARCHITECTURE.md §4.4
 * ("hundreds, not millions, of open items") and the batch-fetch-then-Map-join
 * style `getMyWork` already uses.
 */
export const getRequisitionOverview = cache(
  async (tenantId: string): Promise<RequisitionOverview> => {
    const supabase = await createClient();

    // Scoped by the policy on this table, which is what decides everything below.
    const { data: prs } = await supabase
      .from("edospmis_prs")
      .select(
        "case_id, title, estimated_cost_cents, currency, requester_id, department_id",
      )
      .eq("tenant_id", tenantId);
    if (!prs || prs.length === 0) return { rows: [], counts: {} };

    const caseIds = prs.map((p) => p.case_id);
    const [{ data: cases }, { data: departments }] = await Promise.all([
      supabase
        .from("edospmis_cases")
        .select("id, case_number, status, priority, opened_at, department_id")
        .in("id", caseIds)
        .order("opened_at", { ascending: false }),
      supabase
        .from("edospmis_departments")
        .select("id, name")
        .eq("tenant_id", tenantId),
    ]);
    if (!cases || cases.length === 0) return { rows: [], counts: {} };

    const prByCase = new Map(prs.map((p) => [p.case_id, p]));
    const deptById = new Map(
      (departments ?? []).map((d) => [d.id, d.name as string]),
    );

    const requesterIds = [
      ...new Set(prs.map((p) => p.requester_id).filter(Boolean)),
    ];
    const { data: requesters } = requesterIds.length
      ? await supabase
          .from("edospmis_users")
          .select("id, full_name, email")
          .in("id", requesterIds)
      : {
          data: [] as { id: string; full_name: string | null; email: string }[],
        };
    const requesterById = new Map(
      (requesters ?? []).map((u) => [u.id, u.full_name ?? u.email]),
    );

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
        department_name:
          deptById.get(pr.department_id ?? "") ??
          deptById.get(c.department_id ?? "") ??
          null,
        requester_name: requesterById.get(pr.requester_id) ?? null,
        opened_at: c.opened_at,
      });
    }
    return { rows, counts };
  },
);

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
