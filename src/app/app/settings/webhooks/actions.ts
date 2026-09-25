"use server";

import { revalidatePath } from "next/cache";
import { requireSession, can } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";

export interface WebhookFormState {
  error: string | null;
  ok: string | null;
  secret?: string;
}

function parsePrefixes(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function createWebhook(_prev: WebhookFormState, form: FormData): Promise<WebhookFormState> {
  const session = await requireSession();
  if (!can(session, "admin.webhooks.manage")) {
    return { error: "You don't have permission to manage webhooks.", ok: null };
  }
  const url = String(form.get("url") ?? "").trim();
  const prefixes = parsePrefixes(String(form.get("event_prefixes") ?? ""));
  if (!url) return { error: "Give the endpoint URL.", ok: null };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("edospmis_create_webhook", {
    p_tenant_id: session.tenant.id,
    p_url: url,
    p_event_prefixes: prefixes,
  });
  if (error) return { error: error.message, ok: null };

  revalidatePath("/app/settings/webhooks");
  return { error: null, ok: "Webhook created — copy the signing secret now, it won't be shown again.", secret: data?.[0]?.secret };
}

export async function setWebhookActive(webhookId: string, isActive: boolean): Promise<WebhookFormState> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_set_webhook_active", { p_webhook_id: webhookId, p_is_active: isActive });
  if (error) return { error: error.message, ok: null };
  revalidatePath("/app/settings/webhooks");
  return { error: null, ok: isActive ? "Webhook enabled." : "Webhook paused." };
}

export async function deleteWebhook(webhookId: string): Promise<WebhookFormState> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_delete_webhook", { p_webhook_id: webhookId });
  if (error) return { error: error.message, ok: null };
  revalidatePath("/app/settings/webhooks");
  return { error: null, ok: "Webhook deleted." };
}

export async function checkDelivery(deliveryId: string): Promise<WebhookFormState> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_check_webhook_delivery", { p_delivery_id: deliveryId });
  if (error) return { error: error.message, ok: null };
  revalidatePath("/app/settings/webhooks");
  return { error: null, ok: "Status refreshed." };
}
