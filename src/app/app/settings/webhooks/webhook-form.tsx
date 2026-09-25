"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createWebhook, type WebhookFormState } from "./actions";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/field";

const initial: WebhookFormState = { error: null, ok: null };

export function WebhookForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<WebhookFormState>(initial);
  const [pending, start] = useTransition();
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    start(async () => {
      const result = await createWebhook(initial, form);
      setState(result);
      if (result.ok) {
        formRef.current?.reset();
        if (result.secret) setRevealedSecret(result.secret);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <form ref={formRef} onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <TextInput label="Endpoint URL" name="url" type="url" required hint=" " placeholder="https://example.com/webhooks/edospmis" className="flex-1" />
        <TextInput label="Events" name="event_prefixes" hint="Optional, e.g. invoice.,po. — blank means everything." className="flex-1" />
        <Button type="submit" busy={pending}>
          <Plus className="h-4 w-4" />
          Add webhook
        </Button>
      </form>
      {state.error && <p className="text-xs text-critical">{state.error}</p>}
      {revealedSecret && (
        <div className="rounded-lg border border-good/30 bg-good-soft px-3 py-2.5 text-sm">
          <p className="font-medium text-ink">Signing secret — copy it now, it won&rsquo;t be shown again:</p>
          <code className="mt-1 block break-all rounded bg-surface px-2 py-1.5 text-xs text-ink">{revealedSecret}</code>
          <button type="button" onClick={() => setRevealedSecret(null)} className="mt-1.5 text-xs font-semibold text-ink-faint hover:text-ink">
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
