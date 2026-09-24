"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { decideApproval, type DecisionState } from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { TextArea } from "@/components/ui/field";

const initial: DecisionState = { error: null, ok: null };

export function ApprovalPanel({
  approvalId,
  caseId,
  roleName,
}: {
  approvalId: string;
  caseId: string;
  roleName: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(decideApproval, initial);
  const [decision, setDecision] = useState<"approved" | "rejected" | "returned" | null>(null);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <Card raised>
      <CardHeader title="Your decision" subtitle={`Waiting on the ${roleName} role`} />
      <CardBody>
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="approval_id" value={approvalId} />
          <input type="hidden" name="case_id" value={caseId} />
          <input type="hidden" name="decision" value={decision ?? ""} />

          {(decision === "rejected" || decision === "returned") && (
            <TextArea
              label={decision === "rejected" ? "Why is this being rejected?" : "What needs correcting?"}
              name="comment"
              required
              autoFocus
            />
          )}
          {decision === "approved" && <TextArea label="Comment" name="comment" hint="Optional" />}

          {state.error && (
            <p role="alert" className="text-xs text-critical">
              {state.error}
            </p>
          )}

          {decision === null ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => setDecision("approved")}>
                Approve
              </Button>
              <Button type="button" variant="secondary" onClick={() => setDecision("returned")}>
                Return for correction
              </Button>
              <Button type="button" variant="danger" onClick={() => setDecision("rejected")}>
                Reject
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button type="submit" busy={pending}>
                Confirm {decision === "approved" ? "approval" : decision === "rejected" ? "rejection" : "return"}
              </Button>
              <button type="button" onClick={() => setDecision(null)} className="text-sm font-semibold text-ink-faint hover:text-ink">
                Cancel
              </button>
            </div>
          )}
        </form>
      </CardBody>
    </Card>
  );
}
