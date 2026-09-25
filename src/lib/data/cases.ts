import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Approval, ApprovalRule, Case, MyWorkItem, PR, Priority, WorkflowStageDef } from "@/lib/database.types";

export interface StageDuration {
  stage_key: string;
  entered_at: string;
  left_at: string | null;
  minutes: number;
}

/** How long a case spent (or has so far spent) in each stage it has passed
 *  through — the same "days from X to Y" metric the client's own Excel
 *  turnaround-time report already tracks manually, computed live here. */
export async function getStageDurations(tenantId: string, caseId: string): Promise<StageDuration[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("edospmis_case_stage_history")
    .select("stage_key, entered_at, left_at")
    .eq("tenant_id", tenantId)
    .eq("case_id", caseId)
    .order("entered_at");

  const now = Date.now();
  return (data ?? []).map((r) => ({
    stage_key: r.stage_key,
    entered_at: r.entered_at,
    left_at: r.left_at,
    minutes: Math.round(((r.left_at ? new Date(r.left_at).getTime() : now) - new Date(r.entered_at).getTime()) / 60000),
  }));
}

/** The current stage's SLA due timestamp, if the tenant has configured one
 *  for it — `edospmis_sla_policies` was always generic per stage_key; only
 *  the approval stage ever had a row until a tenant adds more. */
export async function getCurrentStageDueAt(tenantId: string, stageKey: string, stageEnteredAt: string): Promise<string | null> {
  const supabase = await createClient();
  const { data: policy } = await supabase
    .from("edospmis_sla_policies")
    .select("target_minutes")
    .eq("tenant_id", tenantId)
    .eq("stage_key", stageKey)
    .maybeSingle();
  if (!policy) return null;
  return new Date(new Date(stageEnteredAt).getTime() + policy.target_minutes * 60000).toISOString();
}

export async function getMyPRs(tenantId: string, userId: string) {
  const supabase = await createClient();
  const { data: prs } = await supabase
    .from("edospmis_prs")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("requester_id", userId)
    .order("created_at", { ascending: false });
  if (!prs || prs.length === 0) return [];

  const { data: cases } = await supabase
    .from("edospmis_cases")
    .select("id, case_number, status")
    .in("id", prs.map((p) => p.case_id));
  const caseById = new Map((cases ?? []).map((c) => [c.id, c]));

  return prs.map((pr) => ({ pr: pr as PR, case: caseById.get(pr.case_id) ?? null }));
}

export async function getMyWork(tenantId: string, roleIds: string[]): Promise<MyWorkItem[]> {
  if (roleIds.length === 0) return [];
  const supabase = await createClient();
  const { data: approvals } = await supabase
    .from("edospmis_approvals")
    .select("id, case_id, role_id, created_at, edospmis_cases(case_number, priority), edospmis_roles(name)")
    .eq("tenant_id", tenantId)
    .eq("status", "pending")
    .in("role_id", roleIds)
    .order("created_at");
  if (!approvals || approvals.length === 0) return [];

  const caseIds = approvals.map((a) => a.case_id);
  const [{ data: prs }, { data: tasks }] = await Promise.all([
    supabase.from("edospmis_prs").select("case_id, title, estimated_cost_cents, currency").in("case_id", caseIds),
    supabase.from("edospmis_workflow_tasks").select("case_id, due_at").eq("status", "pending").in("case_id", caseIds),
  ]);
  const prByCase = new Map((prs ?? []).map((p) => [p.case_id, p]));
  const dueByCase = new Map((tasks ?? []).map((t) => [t.case_id, t.due_at as string | null]));

  return approvals.map((a) => {
    const c = a.edospmis_cases as unknown as { case_number: string; priority: Priority } | null;
    const role = a.edospmis_roles as unknown as { name: string } | null;
    const pr = prByCase.get(a.case_id);
    return {
      approval_id: a.id,
      case_id: a.case_id,
      case_number: c?.case_number ?? "",
      pr_title: pr?.title ?? "(untitled)",
      estimated_cost_cents: pr?.estimated_cost_cents ?? 0,
      currency: pr?.currency ?? "KES",
      priority: c?.priority ?? "normal",
      role_name: role?.name ?? "",
      due_at: dueByCase.get(a.case_id) ?? null,
      created_at: a.created_at,
    };
  });
}

export interface CaseDetail {
  case: Case;
  pr: PR;
  stages: WorkflowStageDef[];
  approvals: (Approval & { role_name: string; decided_by_name: string | null })[];
  clientName: string | null;
  requesterName: string | null;
  pendingTaskDueAt: string | null;
}

export async function getCaseDetail(tenantId: string, caseId: string): Promise<CaseDetail | null> {
  const supabase = await createClient();
  const { data: caseRow } = await supabase
    .from("edospmis_cases")
    .select("*")
    .eq("id", caseId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!caseRow) return null;

  const { data: pr } = await supabase.from("edospmis_prs").select("*").eq("case_id", caseId).maybeSingle();
  if (!pr) return null;

  let stages: WorkflowStageDef[] = [];
  if (caseRow.workflow_version_id) {
    const { data: version } = await supabase
      .from("edospmis_workflow_versions")
      .select("definition")
      .eq("id", caseRow.workflow_version_id)
      .maybeSingle();
    stages = (version?.definition as { stages: WorkflowStageDef[] } | undefined)?.stages ?? [];
  }

  const { data: approvals } = await supabase
    .from("edospmis_approvals")
    .select("*, edospmis_roles(name), decided_by_user:edospmis_users!edospmis_approvals_decided_by_fkey(full_name, email)")
    .eq("case_id", caseId)
    .order("step_order");

  const [{ data: client }, { data: requester }, { data: pendingTask }] = await Promise.all([
    caseRow.client_id
      ? supabase.from("edospmis_clients").select("name").eq("id", caseRow.client_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("edospmis_users").select("full_name, email").eq("id", pr.requester_id).maybeSingle(),
    supabase
      .from("edospmis_workflow_tasks")
      .select("due_at")
      .eq("case_id", caseId)
      .eq("status", "pending")
      .maybeSingle(),
  ]);

  return {
    case: caseRow as Case,
    pr: pr as PR,
    stages,
    approvals: (approvals ?? []).map((a) => {
      const role = a.edospmis_roles as unknown as { name: string } | null;
      const decidedBy = a.decided_by_user as unknown as { full_name: string | null; email: string } | null;
      return {
        ...(a as unknown as Approval),
        role_name: role?.name ?? "",
        decided_by_name: decidedBy ? decidedBy.full_name ?? decidedBy.email : null,
      };
    }),
    clientName: client?.name ?? null,
    requesterName: requester?.full_name ?? requester?.email ?? null,
    pendingTaskDueAt: pendingTask?.due_at ?? null,
  };
}

export async function getApprovalRules(tenantId: string): Promise<(ApprovalRule & { steps: { step_order: number; role_id: string; role_name: string }[] })[]> {
  const supabase = await createClient();
  const { data: rules } = await supabase
    .from("edospmis_approval_rules")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at");
  if (!rules || rules.length === 0) return [];

  const { data: steps } = await supabase
    .from("edospmis_approval_steps")
    .select("rule_id, step_order, role_id, edospmis_roles(name)")
    .in("rule_id", rules.map((r) => r.id))
    .order("step_order");

  const stepsByRule = new Map<string, { step_order: number; role_id: string; role_name: string }[]>();
  for (const s of steps ?? []) {
    const role = s.edospmis_roles as unknown as { name: string } | null;
    const list = stepsByRule.get(s.rule_id) ?? [];
    list.push({ step_order: s.step_order, role_id: s.role_id, role_name: role?.name ?? "" });
    stepsByRule.set(s.rule_id, list);
  }

  return rules.map((r) => ({ ...(r as ApprovalRule), steps: stepsByRule.get(r.id) ?? [] }));
}
