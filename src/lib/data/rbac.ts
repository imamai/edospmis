import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { MemberRow, Permission, RoleWithPermissions } from "@/lib/database.types";

export async function getMembers(tenantId: string): Promise<MemberRow[]> {
  const supabase = await createClient();

  // Two queries, not one nested embed: edospmis_user_roles has no foreign
  // key to edospmis_memberships (both independently reference user_id +
  // tenant_id), so PostgREST can't embed one under the other — they're
  // joined here in application code instead.
  const [{ data: memberships }, { data: userRoles }] = await Promise.all([
    supabase
      .from("edospmis_memberships")
      .select("id, user_id, status, edospmis_users(email, full_name)")
      .eq("tenant_id", tenantId)
      .order("created_at"),
    supabase
      .from("edospmis_user_roles")
      .select("user_id, edospmis_roles(id, name)")
      .eq("tenant_id", tenantId)
      .eq("scope_type", "tenant"),
  ]);

  const rolesByUser = new Map<string, { id: string; name: string }[]>();
  for (const ur of userRoles ?? []) {
    const role = ur.edospmis_roles as unknown as { id: string; name: string } | null;
    if (!role) continue;
    const list = rolesByUser.get(ur.user_id) ?? [];
    list.push(role);
    rolesByUser.set(ur.user_id, list);
  }

  return (memberships ?? []).map((m) => {
    const user = m.edospmis_users as unknown as { email: string; full_name: string | null } | null;
    return {
      membership_id: m.id,
      user_id: m.user_id,
      email: user?.email ?? "(unknown)",
      full_name: user?.full_name ?? null,
      status: m.status,
      roles: rolesByUser.get(m.user_id) ?? [],
    };
  });
}

export async function getRoles(tenantId: string): Promise<RoleWithPermissions[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("edospmis_roles")
    .select("*, edospmis_role_permissions(edospmis_permissions(key))")
    .eq("tenant_id", tenantId)
    .order("name");

  return (data ?? []).map((r) => {
    const grants =
      (r.edospmis_role_permissions as unknown as { edospmis_permissions: { key: string } | null }[] | null) ?? [];
    return {
      id: r.id,
      tenant_id: r.tenant_id,
      name: r.name,
      description: r.description,
      is_system: r.is_system,
      created_at: r.created_at,
      permission_keys: grants.map((g) => g.edospmis_permissions?.key).filter((k): k is string => !!k),
    };
  });
}

export async function getPermissionCatalogue(): Promise<Permission[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("edospmis_permissions").select("*").order("category").order("key");
  return (data ?? []) as Permission[];
}
