"use server";

import { revalidatePath } from "next/cache";
import { requireSession, can } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { BID_BUCKET, type TemplateField } from "@/lib/tender-types";

export interface TenderSettingsState {
  error: string | null;
  ok: string | null;
}

const DOC_DENIED = "You don't have permission to change supplier requirements.";
const TPL_DENIED = "You don't have permission to change tender templates.";

// ── Document types ────────────────────────────────────────────────────

export async function addDocType(
  _prev: TenderSettingsState,
  form: FormData,
): Promise<TenderSettingsState> {
  const session = await requireSession();
  if (!can(session, "procurement.supplier.manage"))
    return { error: DOC_DENIED, ok: null };

  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "Give the document a name.", ok: null };

  const supabase = await createClient();
  const { error } = await supabase.from("edospmis_supplier_doc_types").insert({
    tenant_id: session.tenant.id,
    name,
    description: String(form.get("description") ?? "").trim() || null,
    default_required: form.get("default_required") === "on",
    // After the shared library, so a tenant's own additions sit below the
    // standard ones rather than interleaved by accident.
    sort_order: 200,
  });
  if (error) return { error: "Couldn't save that document type.", ok: null };

  await logAudit({
    tenantId: session.tenant.id,
    actorId: session.user.id,
    action: "supplier_doc_type.created",
    entityType: "supplier_doc_type",
    after: { name },
  });

  revalidatePath("/app/settings/tender");
  return { error: null, ok: `Added ${name}.` };
}

export async function setDocTypeActive(
  docTypeId: string,
  isActive: boolean,
): Promise<TenderSettingsState> {
  const session = await requireSession();
  if (!can(session, "procurement.supplier.manage"))
    return { error: DOC_DENIED, ok: null };

  const supabase = await createClient();
  // Scoped to this tenant's own rows, so the shared library cannot be
  // withdrawn by one workspace for everybody.
  const { error } = await supabase
    .from("edospmis_supplier_doc_types")
    .update({ is_active: isActive })
    .eq("id", docTypeId)
    .eq("tenant_id", session.tenant.id);
  if (error) return { error: "Couldn't update that document type.", ok: null };

  revalidatePath("/app/settings/tender");
  return { error: null, ok: isActive ? "Available again." : "Withdrawn." };
}

// ── Templates ─────────────────────────────────────────────────────────

/**
 * A template as an uploaded file — the tender document a buyer already has.
 *
 * The file goes from the browser straight to Storage, as every other upload
 * in this app does; this records it. The path is checked against the tenant's
 * own templates folder so a crafted one cannot point at another workspace.
 */
export async function addDocumentTemplate(input: {
  name: string;
  description: string | null;
  instructions: string | null;
  storagePath: string;
  filename: string;
  contentType: string | null;
  byteSize: number;
}): Promise<TenderSettingsState> {
  const session = await requireSession();
  if (!can(session, "procurement.rfq.create"))
    return { error: TPL_DENIED, ok: null };

  const name = input.name.trim();
  if (!name) return { error: "Give the template a name.", ok: null };
  if (!input.storagePath.startsWith(`${session.tenant.id}/templates/`)) {
    return {
      error: "That file was not stored where it should be. Try again.",
      ok: null,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("edospmis_procurement_templates")
    .insert({
      tenant_id: session.tenant.id,
      name,
      description: input.description,
      kind: "document",
      storage_path: input.storagePath,
      filename: input.filename,
      content_type: input.contentType,
      byte_size: input.byteSize,
      instructions: input.instructions,
      created_by: session.user.id,
    });
  if (error) return { error: "Couldn't save that template.", ok: null };

  await logAudit({
    tenantId: session.tenant.id,
    actorId: session.user.id,
    action: "procurement_template.created",
    entityType: "procurement_template",
    after: { name, kind: "document", filename: input.filename },
  });

  revalidatePath("/app/settings/tender");
  return { error: null, ok: `Added ${name}.` };
}

/** A template as questions rendered in the bidder's page. */
export async function addFormTemplate(input: {
  name: string;
  description: string | null;
  instructions: string | null;
  fields: TemplateField[];
}): Promise<TenderSettingsState> {
  const session = await requireSession();
  if (!can(session, "procurement.rfq.create"))
    return { error: TPL_DENIED, ok: null };

  const name = input.name.trim();
  if (!name) return { error: "Give the template a name.", ok: null };
  if (input.fields.length === 0) {
    return { error: "A form needs at least one question.", ok: null };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("edospmis_procurement_templates")
    .insert({
      tenant_id: session.tenant.id,
      name,
      description: input.description,
      kind: "form",
      fields: input.fields,
      instructions: input.instructions,
      created_by: session.user.id,
    });
  if (error) return { error: "Couldn't save that template.", ok: null };

  await logAudit({
    tenantId: session.tenant.id,
    actorId: session.user.id,
    action: "procurement_template.created",
    entityType: "procurement_template",
    after: { name, kind: "form", questions: input.fields.length },
  });

  revalidatePath("/app/settings/tender");
  return { error: null, ok: `Added ${name}.` };
}

export async function setTemplateActive(
  templateId: string,
  isActive: boolean,
): Promise<TenderSettingsState> {
  const session = await requireSession();
  if (!can(session, "procurement.rfq.create"))
    return { error: TPL_DENIED, ok: null };

  const supabase = await createClient();
  const { error } = await supabase
    .from("edospmis_procurement_templates")
    .update({ is_active: isActive })
    .eq("id", templateId)
    .eq("tenant_id", session.tenant.id);
  if (error) return { error: "Couldn't update that template.", ok: null };

  revalidatePath("/app/settings/tender");
  return { error: null, ok: isActive ? "Available again." : "Withdrawn." };
}

/** A link to a template file, for a buyer checking what they issue. */
export async function templateFileUrl(
  templateId: string,
): Promise<string | null> {
  const session = await requireSession();
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("edospmis_procurement_templates")
    .select("storage_path")
    .eq("id", templateId)
    .eq("tenant_id", session.tenant.id)
    .maybeSingle<{ storage_path: string | null }>();
  if (!row?.storage_path) return null;
  const { data } = await supabase.storage
    .from(BID_BUCKET)
    .createSignedUrl(row.storage_path, 600);
  return data?.signedUrl ?? null;
}
