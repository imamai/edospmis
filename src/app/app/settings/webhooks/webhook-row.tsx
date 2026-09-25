"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { setWebhookActive, deleteWebhook, checkDelivery } from "./actions";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import type { WebhookWithDeliveries } from "@/lib/data/webhooks";

export function WebhookRow({ webhook }: { webhook: WebhookWithDeliveries }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [pending, start] = useTransition();
  const [checkingId, setCheckingId] = useState<string | null>(null);

  function toggle() {
    start(async () => {
      await setWebhookActive(webhook.id, !webhook.is_active);
      router.refresh();
    });
  }

  function remove() {
    if (!confirm(`Delete the webhook to ${webhook.url}? This can't be undone.`)) return;
    start(async () => {
      await deleteWebhook(webhook.id);
      router.refresh();
    });
  }

  function refreshStatus(deliveryId: string) {
    setCheckingId(deliveryId);
    start(async () => {
      await checkDelivery(deliveryId);
      setCheckingId(null);
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-line">
      <div className="flex items-center justify-between gap-3 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{webhook.url}</p>
          <p className="text-xs text-ink-faint">
            {webhook.event_prefixes.length === 0 ? "All events" : webhook.event_prefixes.join(", ")} · added {formatDate(webhook.created_at)}
          </p>
        </div>
        <Badge tone={webhook.is_active ? "good" : "neutral"}>{webhook.is_active ? "active" : "paused"}</Badge>
        <button type="button" onClick={toggle} disabled={pending} className="text-xs font-semibold text-ink-faint hover:text-ink disabled:opacity-50">
          {webhook.is_active ? "Pause" : "Enable"}
        </button>
        <button type="button" onClick={remove} disabled={pending} className="text-xs font-semibold text-critical hover:underline disabled:opacity-50">
          Delete
        </button>
        <button type="button" onClick={() => setExpanded((e) => !e)} className="text-ink-faint hover:text-ink" aria-label="Toggle deliveries">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>
      {expanded && (
        <div className="flex flex-col divide-y divide-line border-t border-line px-3">
          {webhook.recentDeliveries.length === 0 ? (
            <p className="py-3 text-xs text-ink-faint">No deliveries yet.</p>
          ) : (
            webhook.recentDeliveries.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 py-2.5 text-xs">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{d.event}</p>
                  <p className="text-ink-faint">{formatDate(d.created_at)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {d.response_status ? (
                    <Badge tone={d.response_status < 300 ? "good" : "critical"}>{d.response_status}</Badge>
                  ) : d.response_body ? (
                    <Badge tone="critical">failed</Badge>
                  ) : (
                    <Badge tone="neutral">sent, unconfirmed</Badge>
                  )}
                  {!d.checked_at && d.request_id && (
                    <button
                      type="button"
                      onClick={() => refreshStatus(d.id)}
                      disabled={pending}
                      className="flex items-center gap-1 text-ink-faint hover:text-ink disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3 w-3 ${checkingId === d.id ? "animate-spin" : ""}`} />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
