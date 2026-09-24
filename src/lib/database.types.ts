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
