"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { decideApproval, type DecisionState } from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { TextArea } from "@/components/ui/field";
import { Modal, ModalFormActions } from "@/components/ui/modal";

const initial: DecisionState = { error: null, ok: null };

const DECISION_TITLE: Record<"approved" | "rejected" | "returned", string> = {
  approved: "Approve this request",
  rejected: "Reject this request",
  returned: "Return for correction",
};

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

  // A successful decision closes the dialog. Derived rather than stored, so
  // there is no second render that has to un-set it — the old version cleared
  // this from inside an effect, which is a cascading render.
  const openDecision = state.ok ? null : decision;

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <Card raised>
      <CardHeader title="Your decision" subtitle={`Waiting on the ${roleName} role`} />
      <CardBody>
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

        <Modal
          open={openDecision !== null}
          onClose={() => setDecision(null)}
          title={openDecision ? DECISION_TITLE[openDecision] : ""}
          dismissible={!pending}
          size="sm"
        >
          <form action={action} className="flex flex-col gap-3">
            <input type="hidden" name="approval_id" value={approvalId} />
            <input type="hidden" name="case_id" value={caseId} />
            <input type="hidden" name="decision" value={openDecision ?? ""} />

            {(openDecision === "rejected" || openDecision === "returned") && (
              <TextArea
                label={openDecision === "rejected" ? "Why is this being rejected?" : "What needs correcting?"}
                name="comment"
                required
                autoFocus
              />
            )}
            {openDecision === "approved" && <TextArea label="Comment" name="comment" hint="Optional" />}

            {state.error && (
              <p role="alert" className="text-xs text-critical">
                {state.error}
              </p>
            )}

            <ModalFormActions
              onCancel={() => setDecision(null)}
              submitLabel={`Confirm ${openDecision === "approved" ? "approval" : openDecision === "rejected" ? "rejection" : "return"}`}
              busy={pending}
              danger={openDecision === "rejected"}
            />
          </form>
        </Modal>
      </CardBody>
    </Card>
  );
}
