"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelCase } from "../actions";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/field";
import { Modal, ModalFormActions } from "@/components/ui/modal";

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
      else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Cancel case
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Cancel this case" dismissible={!pending} size="sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex flex-col gap-3"
        >
          <TextInput
            label="Reason"
            name="reason"
            hint="Optional"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          {error && <p className="text-xs text-critical">{error}</p>}
          <ModalFormActions onCancel={() => setOpen(false)} submitLabel="Confirm cancel" busy={pending} danger />
        </form>
      </Modal>
    </>
  );
}
