"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { closeCase } from "../../fulfilment/actions";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/field";
import { Modal, ModalFormActions } from "@/components/ui/modal";

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
      else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Close case
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Close this case" dismissible={!pending} size="sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex flex-col gap-3"
        >
          {nudge && <p className="text-xs text-ink-faint">{nudge}</p>}
          <TextInput
            label="Closing note"
            name="reason"
            hint="Optional"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          {error && <p className="text-xs text-critical">{error}</p>}
          <ModalFormActions onCancel={() => setOpen(false)} submitLabel="Confirm close" busy={pending} />
        </form>
      </Modal>
    </>
  );
}
