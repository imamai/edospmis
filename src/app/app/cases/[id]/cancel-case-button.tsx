"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelCase } from "../actions";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/field";

export function CancelCaseButton({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    start(async () => {
      const result = await cancelCase(caseId, reason);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  if (!open) {
    return (
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Cancel case
      </Button>
    );
  }

  return (
    <div className="flex w-full max-w-sm flex-col items-end gap-2 rounded-lg border border-line p-3">
      <TextInput label="Reason" name="reason" hint="Optional" value={reason} onChange={(e) => setReason(e.target.value)} className="w-full" />
      {error && <p className="text-xs text-critical">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" variant="danger" busy={pending} onClick={submit}>
          Confirm cancel
        </Button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs font-semibold text-ink-faint hover:text-ink">
          Back
        </button>
      </div>
    </div>
  );
}
