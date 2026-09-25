"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { closeCase } from "../../fulfilment/actions";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/field";

export function CloseCaseButton({ caseId, nudge }: { caseId: string; nudge?: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    start(async () => {
      const result = await closeCase(caseId, reason);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  if (!open) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Close case
        </Button>
        {nudge && <p className="max-w-[16rem] text-right text-xs text-ink-faint">{nudge}</p>}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-sm flex-col items-end gap-2 rounded-lg border border-line p-3">
      <TextInput
        label="Closing note"
        name="reason"
        hint="Optional"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="w-full"
      />
      {error && <p className="text-xs text-critical">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" busy={pending} onClick={submit}>
          Confirm close
        </Button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs font-semibold text-ink-faint hover:text-ink">
          Cancel
        </button>
      </div>
    </div>
  );
}
