export type TenantStatus = "trial" | "active" | "suspended";
export type MembershipStatus = "invited" | "active" | "suspended";
export type RoleScopeType = "tenant" | "business_unit" | "branch" | "department";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  plan: string;
  branding: Record<string, unknown>;
  numbering_format: string;
  case_sequence: number;
  created_at: string;
}

export interface AppUser {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  last_tenant_id: string | null;
  created_at: string;
}

export interface Membership {
  id: string;
  user_id: string;
  tenant_id: string;
  status: MembershipStatus;
  invited_by: string | null;
  department_id: string | null;
  branch_id: string | null;
  last_active_at: string | null;
  created_at: string;
}

export interface Permission {
  id: string;
  key: string;
  category: string;
  description: string;
}

export interface Role {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  tenant_id: string;
  role_id: string;
  scope_type: RoleScopeType;
  scope_id: string | null;
  created_at: string;
}

export interface Department {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  business_unit_id: string | null;
  name: string;
  code: string | null;
  is_active: boolean;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  tenant_id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  created_at: string;
}

/** A role joined to the set of permission keys it grants, for the Roles admin screen. */
export interface RoleWithPermissions extends Role {
  permission_keys: string[];
}

/** A tenant member row shaped for the Users admin screen. */
export interface MemberRow {
  membership_id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  status: MembershipStatus;
  roles: { id: string; name: string }[];
}

/* ------------------------------------------------------------------ *
 * Phase 2 — Case / PR / Workflow / Queue / Approval / SLA
 * ------------------------------------------------------------------ */

export type CaseStatus = "draft" | "submitted" | "approval" | "approved" | "rejected" | "returned" | "cancelled";
export type PRStatus = "draft" | "submitted" | "approved" | "rejected" | "returned" | "cancelled";
export type Priority = "low" | "normal" | "high" | "urgent";
export type ApprovalDecision = "pending" | "approved" | "rejected" | "returned";

export interface Category {
  id: string;
  tenant_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface Client {
  id: string;
  tenant_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
}

export interface PRItem {
  description: string;
  qty: number;
  unit: string;
  estimated_unit_cost_cents: number;
}

export interface Case {
  id: string;
  tenant_id: string;
  case_number: string;
  client_id: string | null;
  department_id: string | null;
  status: CaseStatus;
  current_stage_key: string;
  workflow_version_id: string | null;
  priority: Priority;
  created_by: string | null;
  opened_at: string;
  closed_at: string | null;
}

export interface PR {
  id: string;
  tenant_id: string;
  case_id: string;
  requester_id: string;
  category_id: string | null;
  client_id: string | null;
  department_id: string | null;
  title: string;
  justification: string | null;
  items: PRItem[];
  estimated_cost_cents: number;
  currency: string;
  required_by: string | null;
  priority: Priority;
  status: PRStatus;
  created_at: string;
}

export interface WorkflowStageDef {
  key: string;
  label: string;
}

export interface WorkflowVersion {
  id: string;
  workflow_id: string;
  version_number: number;
  definition: { stages: WorkflowStageDef[] };
  created_at: string;
}

export interface ApprovalRule {
  id: string;
  tenant_id: string;
  name: string;
  min_amount_cents: number | null;
  max_amount_cents: number | null;
  is_active: boolean;
  created_at: string;
}

export interface ApprovalStep {
  id: string;
  rule_id: string;
  step_order: number;
  role_id: string;
}

export interface Approval {
  id: string;
  tenant_id: string;
  case_id: string;
  rule_id: string;
  step_order: number;
  role_id: string;
  status: ApprovalDecision;
  comment: string | null;
  decided_by: string | null;
  decided_at: string | null;
  workflow_version_id: string | null;
  created_at: string;
}

/** A pending approval task, shaped for the My Work list. */
export interface MyWorkItem {
  approval_id: string;
  case_id: string;
  case_number: string;
  pr_title: string;
  estimated_cost_cents: number;
  currency: string;
  priority: Priority;
  role_name: string;
  due_at: string | null;
  created_at: string;
}
