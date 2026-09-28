"use server";

import { revalidatePath } from "next/cache";
import { requireSession, can } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";

export interface UserFormState {
  error: string | null;
  ok: string | null;
}

async function isSoleTenantAdministrator(tenantId: string, userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("edospmis_user_roles")
    .select("user_id, edospmis_roles!inner(name)")
    .eq("tenant_id", tenantId)
    .eq("edospmis_roles.name", "Tenant Administrator");
  const admins = new Set((data ?? []).map((r) => r.user_id));
  return admins.has(userId) && admins.size === 1;
}

export async function inviteUser(_prev: UserFormState, form: FormData): Promise<UserFormState> {
  const session = await requireSession();
  if (!can(session, "admin.users.manage")) {
    return { error: "You don't have permission to manage users.", ok: null };
  }
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const roleId = String(form.get("role_id") ?? "");
  if (!email || !roleId) return { error: "Enter an email and choose a role.", ok: null };

  const admin = createAdminClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=/update-password`,
  });

  if (inviteError || !invited?.user) {
    const message = inviteError?.message ?? "unknown error";
    return {
      error: message.toLowerCase().includes("already")
        ? "That email is already registered somewhere on the platform — inviting an existing account isn't supported yet."
        : `Couldn't send the invite: ${message}`,
      ok: null,
    };
  }

  const userId = invited.user.id;
  await admin.from("edospmis_users").upsert({ id: userId, email }, { onConflict: "id" });
  await admin.from("edospmis_memberships").insert({
    user_id: userId,
    tenant_id: session.tenant.id,
    status: "invited",
    invited_by: session.user.id,
  });
  await admin.from("edospmis_user_roles").insert({
    user_id: userId,
    tenant_id: session.tenant.id,
    role_id: roleId,
    scope_type: "tenant",
  });

  await logAudit({
    tenantId: session.tenant.id,
    actorId: session.user.id,
    action: "user.invited",
    entityType: "membership",
    entityId: userId,
    after: { email, role_id: roleId },
  });

  revalidatePath("/app/settings/users");
  return { error: null, ok: `Invited ${email}.` };
}

export async function updateMemberRole(_prev: UserFormState, form: FormData): Promise<UserFormState> {
  const session = await requireSession();
  if (!can(session, "admin.users.manage")) {
    return { error: "You don't have permission to manage users.", ok: null };
  }
  const userId = String(form.get("user_id") ?? "");
  const roleId = String(form.get("role_id") ?? "");
  if (!userId || !roleId) return { error: "Missing user or role.", ok: null };

  if (await isSoleTenantAdministrator(session.tenant.id, userId)) {
    return {
      error: "This is the only Tenant Administrator — make someone else an administrator first.",
      ok: null,
    };
  }

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("edospmis_user_roles")
    .select("role_id")
    .eq("tenant_id", session.tenant.id)
    .eq("user_id", userId);

  await supabase
    .from("edospmis_user_roles")
    .delete()
    .eq("tenant_id", session.tenant.id)
    .eq("user_id", userId)
    .eq("scope_type", "tenant");
  const { error } = await supabase
    .from("edospmis_user_roles")
    .insert({ user_id: userId, tenant_id: session.tenant.id, role_id: roleId, scope_type: "tenant" });
  if (error) return { error: "Couldn't update that member's role.", ok: null };

  await logAudit({
    tenantId: session.tenant.id,
    actorId: session.user.id,
    action: "user.role_changed",
    entityType: "user_role",
    entityId: userId,
    before,
    after: { role_id: roleId },
  });

  revalidatePath("/app/settings/users");
  return { error: null, ok: "Role updated." };
}

export async function setMembershipStatus(
  membershipId: string,
  userId: string,
  status: "active" | "suspended",
): Promise<UserFormState> {
  const session = await requireSession();
  if (!can(session, "admin.users.manage")) {
    return { error: "You don't have permission to manage users.", ok: null };
  }
  if (status === "suspended" && (await isSoleTenantAdministrator(session.tenant.id, userId))) {
    return {
      error: "This is the only Tenant Administrator — make someone else an administrator first.",
      ok: null,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("edospmis_memberships")
    .update({ status })
    .eq("id", membershipId)
    .eq("tenant_id", session.tenant.id);
  if (error) return { error: "Couldn't update that member.", ok: null };

  await logAudit({
    tenantId: session.tenant.id,
    actorId: session.user.id,
    action: status === "suspended" ? "user.suspended" : "user.reactivated",
    entityType: "membership",
    entityId: membershipId,
  });

  revalidatePath("/app/settings/users");
  return { error: null, ok: status === "suspended" ? "Member suspended." : "Member reactivated." };
}

/**
 * Where this person sits in the organisation.
 *
 * Only the deepest level chosen is written — the trigger added in migration
 * 0044 derives the branch and business unit from it, so the four columns can
 * never contradict each other whoever wrote them. Passing all four from here
 * would just be four chances to disagree.
 *
 * The update itself is guarded twice: this permission check, and the
 * row-level policy on edospmis_memberships, which already requires
 * admin.users.manage. The check here exists to give a readable answer rather
 * than a silent no-op.
 */
export async function setMemberPlacement(_prev: UserFormState, form: FormData): Promise<UserFormState> {
  const session = await requireSession();
  if (!can(session, "admin.users.manage")) {
    return { error: "You don't have permission to manage users.", ok: null };
  }

  const membershipId = String(form.get("membership_id") ?? "");
  if (!membershipId) return { error: "Couldn't tell which member that was.", ok: null };

  const teamId = String(form.get("team_id") ?? "") || null;
  const departmentId = String(form.get("department_id") ?? "") || null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("edospmis_memberships")
    .update({
      team_id: teamId,
      department_id: teamId ? null : departmentId,
      // Cleared so the trigger derives them rather than keeping a stale
      // ancestor from a previous placement.
      branch_id: null,
      business_unit_id: null,
    })
    .eq("id", membershipId)
    .eq("tenant_id", session.tenant.id);

  if (error) {
    return { error: "Couldn't save where this person sits. Try again.", ok: null };
  }

  await logAudit({
    tenantId: session.tenant.id,
    actorId: session.user.id,
    action: "membership.placement_set",
    entityType: "membership",
    entityId: membershipId,
    after: { team_id: teamId, department_id: departmentId },
  });

  revalidatePath("/app/settings/users");
  return { error: null, ok: "Saved." };
}
