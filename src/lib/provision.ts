import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
  return `${base || "workspace"}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Creates the workspace a new account signed up for, if it has none yet.
 *
 * Sign-up cannot do this itself. `edospmis_provision_tenant` runs as the
 * calling user, and when the project requires email confirmation there is no
 * session at sign-up time to run it under — so the organisation name the
 * person typed is parked in their auth metadata and turned into a real tenant
 * at the first moment a session exists.
 *
 * That first moment is one of two places: confirming the emailed link
 * (/welcome), or simply signing in (the login action). Both call this, and
 * calling it twice is harmless — the membership check short-circuits, which
 * is also what keeps an invited teammate out of a workspace of their own.
 *
 * Returns true if this account now has a workspace, so a caller that has to
 * decide where to send somebody does not need a second query to find out.
 */
export async function ensureWorkspace(
  supabase: SupabaseClient,
  user: User,
): Promise<boolean> {
  const { count } = await supabase
    .from("edospmis_memberships")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "active");

  if (count) return true;

  const pendingName = (user.user_metadata?.pending_tenant_name as string | undefined)?.trim();
  if (!pendingName) return false;

  const { error } = await supabase.rpc("edospmis_provision_tenant", {
    p_tenant_name: pendingName,
    p_tenant_slug: slugify(pendingName),
  });

  return !error;
}
