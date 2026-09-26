"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PauseCircle, ShieldAlert } from "lucide-react";
import { setCaseHold, setCaseBlocked } from "../actions";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/field";
import { Modal, ModalFormActions } from "@/components/ui/modal";

/**
 * On hold / blocked are flags orthogonal to the status pipeline (a case can
 * be, say, "receiving" AND on hold at the same time) — so they're a banner
 * plus a toggle here, not another chevron stage.
 */
export function HoldBlockedControls({
  caseId,
  onHold,
  onHoldReason,
  blocked,
  blockedReason,
}: {
  caseId: string;
  onHold: boolean;
  onHoldReason: string | null;
  blocked: boolean;
  blockedReason: string | null;
}) {
  const router = useRouter();
  const [prompt, setPrompt] = useState<"hold" | "blocked" | null>(null);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(kind: "hold" | "blocked", next: boolean, withReason: string) {
    start(async () => {
      const result = kind === "hold" ? await setCaseHold(caseId, next, withReason) : await setCaseBlocked(caseId, next, withReason);
      if (result.error) setError(result.error);
      else {
        setPrompt(null);
        setReason("");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 print:hidden">
      {(onHold || blocked) && (
        <div className="flex flex-col gap-1.5">
          {onHold && (
            <p className="flex items-center gap-1.5 rounded-lg border border-attention/30 bg-attention-soft px-3 py-2 text-sm text-attention">
              <PauseCircle className="h-4 w-4 shrink-0" />
              On hold{onHoldReason ? ` — ${onHoldReason}` : ""}
            </p>
          )}
          {blocked && (
            <p className="flex items-center gap-1.5 rounded-lg border border-critical/30 bg-critical-soft px-3 py-2 text-sm text-critical">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              Blocked{blockedReason ? ` — ${blockedReason}` : ""}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {onHold ? (
          <Button size="sm" variant="secondary" busy={pending} onClick={() => toggle("hold", false, "")}>
            Release hold
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => setPrompt("hold")}>
            Put on hold
          </Button>
        )}
        {blocked ? (
          <Button size="sm" variant="secondary" busy={pending} onClick={() => toggle("blocked", false, "")}>
            Clear blocked
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => setPrompt("blocked")}>
            Mark blocked
          </Button>
        )}
      </div>

      <Modal
        open={prompt !== null}
        onClose={() => setPrompt(null)}
        title={prompt === "hold" ? "Put case on hold" : "Mark case blocked"}
        dismissible={!pending}
        size="sm"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (prompt) toggle(prompt, true, reason);
          }}
          className="flex flex-col gap-3"
        >
          <TextInput
            label={prompt === "hold" ? "Reason for hold" : "Reason for block"}
            hint="Optional"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          {error && <p className="text-xs text-critical">{error}</p>}
          <ModalFormActions onCancel={() => setPrompt(null)} submitLabel="Confirm" busy={pending} />
        </form>
      </Modal>
    </div>
  );
}
