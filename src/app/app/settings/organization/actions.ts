"use server";

import { revalidatePath } from "next/cache";
import { requireSession, can } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import type { TenantBranding } from "@/lib/database.types";

export interface OrganizationFormState {
  error: string | null;
  ok: string | null;
}

export async function updateOrganization(
  _prev: OrganizationFormState,
  form: FormData,
): Promise<OrganizationFormState> {
  const session = await requireSession();
  if (!can(session, "admin.org.manage")) {
    return { error: "You don't have permission to manage the organization profile.", ok: null };
  }
  const name = String(form.get("name") ?? "").trim();
  const numberingFormat = String(form.get("numbering_format") ?? "").trim();
  const requiresPoApproval = form.get("requires_po_approval") === "on";
  if (!name) return { error: "Give your workspace a name.", ok: null };
  if (!numberingFormat) return { error: "Give a case numbering format.", ok: null };

  const accentColor = String(form.get("accent_color") ?? "").trim();

  const branding: TenantBranding = {
    ...session.tenant.branding,
    address: String(form.get("address") ?? "").trim() || null,
    phone: String(form.get("phone") ?? "").trim() || null,
    email: String(form.get("email") ?? "").trim() || null,
    registration_number: String(form.get("registration_number") ?? "").trim() || null,
    accent_color: /^#[0-9a-f]{6}$/i.test(accentColor) ? accentColor : null,
  };

  const supabase = await createClient();
  const { error } = await supabase
    .from("edospmis_tenants")
    .update({ name, numbering_format: numberingFormat, requires_po_approval: requiresPoApproval, branding })
    .eq("id", session.tenant.id);
  if (error) return { error: "Couldn't save the organization profile.", ok: null };

  revalidatePath("/app/settings/organization");
  return { error: null, ok: "Saved." };
}

/** Called after the browser has already uploaded the file straight to
 * Storage (see logo-upload.tsx) — this only records the resulting public
 * URL. Binary bytes never pass through a server action. */
export async function setTenantLogo(logoUrl: string | null): Promise<{ error: string | null }> {
  const session = await requireSession();
  if (!can(session, "admin.org.manage")) {
    return { error: "You don't have permission to manage the organization profile." };
  }

  const branding: TenantBranding = { ...session.tenant.branding, logo_url: logoUrl };
  const supabase = await createClient();
  const { error } = await supabase.from("edospmis_tenants").update({ branding }).eq("id", session.tenant.id);
  if (error) return { error: "Couldn't save the logo." };

  revalidatePath("/app/settings/organization");
  return { error: null };
}
