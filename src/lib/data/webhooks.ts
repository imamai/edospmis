import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Webhook, WebhookDelivery } from "@/lib/database.types";

export interface WebhookWithDeliveries extends Omit<Webhook, "secret"> {
  recentDeliveries: WebhookDelivery[];
}

/** The secret is never returned here — it's shown once, at creation, and nowhere else. */
export async function getWebhooks(tenantId: string): Promise<WebhookWithDeliveries[]> {
  const supabase = await createClient();
  const { data: webhooks } = await supabase
    .from("edospmis_webhooks")
    .select("id, tenant_id, url, event_prefixes, is_active, created_by, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (!webhooks || webhooks.length === 0) return [];

  const { data: deliveries } = await supabase
    .from("edospmis_webhook_deliveries")
    .select("*")
    .in("webhook_id", webhooks.map((w) => w.id))
    .order("created_at", { ascending: false });

  const byWebhook = new Map<string, WebhookDelivery[]>();
  for (const d of (deliveries ?? []) as WebhookDelivery[]) {
    const list = byWebhook.get(d.webhook_id) ?? [];
    if (list.length < 10) list.push(d);
    byWebhook.set(d.webhook_id, list);
  }

  return webhooks.map((w) => ({ ...w, recentDeliveries: byWebhook.get(w.id) ?? [] }));
}
