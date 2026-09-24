"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startProcurement } from "../../procurement/actions";
import { Button } from "@/components/ui/button";

export function StartProcurementButton({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    start(async () => {
      const result = await startProcurement(caseId);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button onClick={submit} busy={pending}>
        Start procurement
      </Button>
      {error && <p className="text-xs text-critical">{error}</p>}
    </div>
  );
}
