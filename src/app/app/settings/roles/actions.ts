"use server";

import { revalidatePath } from "next/cache";
import { requireSession, can } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

export interface RoleFormState {
  error: string | null;
  ok: string | null;
}

export async function createRole(_prev: RoleFormState, form: FormData): Promise<RoleFormState> {
  const session = await requireSession();
  if (!can(session, "admin.roles.manage")) {
    return { error: "You don't have permission to manage roles.", ok: null };
  }
  const name = String(form.get("name") ?? "").trim();
  const description = String(form.get("description") ?? "").trim() || null;
  if (!name) return { error: "Give the role a name.", ok: null };

  const supabase = await createClient();
  const { data: role, error } = await supabase
    .from("edospmis_roles")
    .insert({ tenant_id: session.tenant.id, name, description, is_system: false })
    .select("id")
    .single();
  if (error) {
    return {
      error: error.code === "23505" ? "A role with that name already exists." : "Couldn't create that role.",
      ok: null,
    };
  }

  await logAudit({
    tenantId: session.tenant.id,
    actorId: session.user.id,
    action: "role.created",
    entityType: "role",
    entityId: role.id,
    after: { name, description },
  });

  revalidatePath("/app/settings/roles");
  return { error: null, ok: `Created "${name}".` };
}

export async function updateRolePermissions(roleId: string, permissionIds: string[]): Promise<RoleFormState> {
  const session = await requireSession();
  if (!can(session, "admin.roles.manage")) {
    return { error: "You don't have permission to manage roles.", ok: null };
  }

  const supabase = await createClient();
  const { data: role } = await supabase
    .from("edospmis_roles")
    .select("id, name, is_system")
    .eq("id", roleId)
    .eq("tenant_id", session.tenant.id)
    .maybeSingle();
  if (!role) return { error: "That role could not be found.", ok: null };
  if (role.is_system) return { error: "System roles ship with a fixed set of permissions.", ok: null };

  const { data: before } = await supabase
    .from("edospmis_role_permissions")
    .select("permission_id")
    .eq("role_id", roleId);

  await supabase.from("edospmis_role_permissions").delete().eq("role_id", roleId);
  if (permissionIds.length > 0) {
    const { error } = await supabase
      .from("edospmis_role_permissions")
      .insert(permissionIds.map((permission_id) => ({ role_id: roleId, permission_id })));
    if (error) return { error: "Couldn't save those permissions.", ok: null };
  }

  await logAudit({
    tenantId: session.tenant.id,
    actorId: session.user.id,
    action: "role.permissions_changed",
    entityType: "role",
    entityId: roleId,
    before: (before ?? []).map((b) => b.permission_id),
    after: permissionIds,
  });

  revalidatePath("/app/settings/roles");
  return { error: null, ok: `Updated permissions for "${role.name}".` };
}

export async function deleteRole(roleId: string): Promise<RoleFormState> {
  const session = await requireSession();
  if (!can(session, "admin.roles.manage")) {
    return { error: "You don't have permission to manage roles.", ok: null };
  }

  const supabase = await createClient();
  const { data: role } = await supabase
    .from("edospmis_roles")
    .select("id, name, is_system")
    .eq("id", roleId)
    .eq("tenant_id", session.tenant.id)
    .maybeSingle();
  if (!role) return { error: "That role could not be found.", ok: null };
  if (role.is_system) return { error: "System roles can't be deleted.", ok: null };

  const { count } = await supabase
    .from("edospmis_user_roles")
    .select("id", { count: "exact", head: true })
    .eq("role_id", roleId);
  if (count && count > 0) {
    return { error: `${count} member${count === 1 ? " holds" : "s hold"} this role — reassign them first.`, ok: null };
  }

  const { error } = await supabase.from("edospmis_roles").delete().eq("id", roleId);
  if (error) return { error: "Couldn't delete that role.", ok: null };

  await logAudit({
    tenantId: session.tenant.id,
    actorId: session.user.id,
    action: "role.deleted",
    entityType: "role",
    entityId: roleId,
    before: { name: role.name },
  });

  revalidatePath("/app/settings/roles");
  return { error: null, ok: `Deleted "${role.name}".` };
}
