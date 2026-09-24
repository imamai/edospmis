import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppUser, Role, Tenant } from "@/lib/database.types";

export interface SessionContext {
  user: AppUser;
  tenant: Tenant;
  /** Every tenant this user belongs to, for the workspace switcher. */
  tenants: { id: string; name: string }[];
  /** This user's roles in the active tenant (tenant-wide scope only — see ARCHITECTURE.md §4.3/§1.2). */
  roles: Role[];
  /** Flattened set of permission keys this user holds in the active tenant. */
  permissions: Set<string>;
}

/**
 * The one place the app resolves "who is this and which workspace are they
 * looking at". Wrapped in React's `cache` so a layout, a page and several
 * components in the same render share one round trip.
 */
export const getSession = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;

  // Heals a profile row a client-side signUp() cannot write directly, and
  // flips a freshly-accepted invite's membership from "invited" to "active".
  await supabase.rpc("edospmis_ensure_profile");

  const { data: profile } = await supabase
    .from("edospmis_users")
    .select("*")
    .eq("id", authUser.id)
    .maybeSingle();
  if (!profile) return null;

  const { data: memberships } = await supabase
    .from("edospmis_memberships")
    .select("tenant_id, status, edospmis_tenants(id, name)")
    .eq("user_id", authUser.id)
    .eq("status", "active");
  if (!memberships || memberships.length === 0) return null;

  const tenants = memberships
    .map((m) => {
      const t = m.edospmis_tenants as unknown as { id: string; name: string } | null;
      return t ? { id: t.id, name: t.name } : null;
    })
    .filter((t): t is { id: string; name: string } => t !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  const activeId =
    (profile.last_tenant_id && tenants.some((t) => t.id === profile.last_tenant_id)
      ? profile.last_tenant_id
      : tenants[0]?.id) ?? null;
  if (!activeId) return null;

  const [{ data: tenant }, { data: userRoles }] = await Promise.all([
    supabase.from("edospmis_tenants").select("*").eq("id", activeId).maybeSingle(),
    supabase
      .from("edospmis_user_roles")
      .select("role_id, edospmis_roles(*, edospmis_role_permissions(edospmis_permissions(key)))")
      .eq("user_id", authUser.id)
      .eq("tenant_id", activeId)
      .eq("scope_type", "tenant"),
  ]);
  if (!tenant) return null;

  const roles: Role[] = [];
  const permissions = new Set<string>();
  for (const ur of userRoles ?? []) {
    const role = ur.edospmis_roles as unknown as
      | (Role & { edospmis_role_permissions: { edospmis_permissions: { key: string } | null }[] })
      | null;
    if (!role) continue;
    roles.push({
      id: role.id,
      tenant_id: role.tenant_id,
      name: role.name,
      description: role.description,
      is_system: role.is_system,
      created_at: role.created_at,
    });
    for (const rp of role.edospmis_role_permissions ?? []) {
      if (rp.edospmis_permissions?.key) permissions.add(rp.edospmis_permissions.key);
    }
  }

  return {
    user: profile as AppUser,
    tenant: tenant as Tenant,
    tenants,
    roles,
    permissions,
  };
});

export function can(session: SessionContext, permissionKey: string): boolean {
  return session.permissions.has(permissionKey);
}

/** Redirects unauthenticated visitors to /login; use at the top of a protected page/layout. */
export async function requireSession(): Promise<SessionContext> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
