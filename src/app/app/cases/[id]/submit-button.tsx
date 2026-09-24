"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitPR } from "../../prs/actions";
import { Button } from "@/components/ui/button";

export function SubmitButton({ caseId, prId }: { caseId: string; prId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    start(async () => {
      const result = await submitPR(caseId, prId);
      if (result.error) setError(result.error);
      else {
        setError(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button onClick={submit} busy={pending}>
        Submit for approval
      </Button>
      {error && <p className="text-xs text-critical">{error}</p>}
    </div>
  );
}
