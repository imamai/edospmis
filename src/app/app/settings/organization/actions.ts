"use server";

import { revalidatePath } from "next/cache";
import { requireSession, can } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { isSafeLogoUrl } from "@/lib/safe-url";
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
    return {
      error: "You don't have permission to manage the organization profile.",
      ok: null,
    };
  }
  const name = String(form.get("name") ?? "").trim();
  const numberingFormat = String(form.get("numbering_format") ?? "").trim();
  const requiresPoApproval = form.get("requires_po_approval") === "on";
  const vatEnabled = form.get("vat_enabled") === "on";
  // The rate field is only rendered while VAT is on, so an absent value means
  // "unchanged" rather than zero — turning VAT off must not silently wipe the
  // rate somebody will want back when they turn it on again.
  const rateRaw = form.get("vat_rate");
  const vatRate =
    rateRaw === null || String(rateRaw).trim() === ""
      ? session.tenant.vat_rate
      : Number(rateRaw);
  if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) {
    return {
      error: "That VAT rate isn't a percentage between 0 and 100.",
      ok: null,
    };
  }
  if (!name) return { error: "Give your workspace a name.", ok: null };
  if (!numberingFormat)
    return { error: "Give a case numbering format.", ok: null };

  const accentColor = String(form.get("accent_color") ?? "").trim();

  const branding: TenantBranding = {
    ...session.tenant.branding,
    address: String(form.get("address") ?? "").trim() || null,
    phone: String(form.get("phone") ?? "").trim() || null,
    email: String(form.get("email") ?? "").trim() || null,
    registration_number:
      String(form.get("registration_number") ?? "").trim() || null,
    accent_color: /^#[0-9a-f]{6}$/i.test(accentColor) ? accentColor : null,
  };

  const supabase = await createClient();
  const { error } = await supabase
    .from("edospmis_tenants")
    .update({
      name,
      numbering_format: numberingFormat,
      requires_po_approval: requiresPoApproval,
      vat_enabled: vatEnabled,
      vat_rate: vatRate,
      branding,
    })
    .eq("id", session.tenant.id);
  if (error)
    return { error: "Couldn't save the organization profile.", ok: null };

  revalidatePath("/app/settings/organization");
  return { error: null, ok: "Saved." };
}

/** Called after the browser has already uploaded the file straight to
 * Storage (see logo-upload.tsx) — this only records the resulting public
 * URL. Binary bytes never pass through a server action. */
export async function setTenantLogo(
  logoUrl: string | null,
): Promise<{ error: string | null }> {
  const session = await requireSession();
  if (!can(session, "admin.org.manage")) {
    return {
      error: "You don't have permission to manage the organization profile.",
    };
  }

  // Checked here as well as at the point of fetching: a value that can never
  // be stored is a smaller problem than one that is stored and has to be
  // refused every time it is read.
  if (!isSafeLogoUrl(logoUrl)) {
    return { error: "That logo URL isn't one this workspace uploaded." };
  }

  const branding: TenantBranding = {
    ...session.tenant.branding,
    logo_url: logoUrl,
  };
  const supabase = await createClient();
  const { error } = await supabase
    .from("edospmis_tenants")
    .update({ branding })
    .eq("id", session.tenant.id);
  if (error) return { error: "Couldn't save the logo." };

  revalidatePath("/app/settings/organization");
  return { error: null };
}
