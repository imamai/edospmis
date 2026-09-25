"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dispatchDelivery, scheduleDelivery, confirmDelivery, type FulfilmentState } from "../../fulfilment/actions";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SelectInput, TextArea, TextInput } from "@/components/ui/field";
import { formatDate } from "@/lib/utils";
import type { Delivery, DeliveryStatus } from "@/lib/database.types";

const initial: FulfilmentState = { error: null, ok: null };
const STATUS_TONE: Record<DeliveryStatus, "neutral" | "info" | "good" | "critical"> = {
  scheduled: "info",
  dispatched: "info",
  delivered: "good",
  confirmed: "good",
  cancelled: "critical",
};

export function DeliveryPanel({
  caseId,
  delivery,
  canAssign,
  canDispatch,
  canComplete,
}: {
  caseId: string;
  delivery: Delivery | null;
  canAssign: boolean;
  canDispatch: boolean;
  canComplete: boolean;
}) {
  const router = useRouter();
  const [scheduling, setScheduling] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [dispatchPending, startDispatch] = useTransition();
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  const [scheduleState, setScheduleState] = useState<FulfilmentState>(initial);
  const [schedulePending, startSchedule] = useTransition();
  const [confirmState, setConfirmState] = useState<FulfilmentState>(initial);
  const [confirmPending, startConfirm] = useTransition();

  function dispatch() {
    if (!delivery) return;
    startDispatch(async () => {
      const result = await dispatchDelivery(delivery.id, caseId);
      if (result.error) setDispatchError(result.error);
      else router.refresh();
    });
  }

  function submitSchedule(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startSchedule(async () => {
      const result = await scheduleDelivery(initial, form);
      setScheduleState(result);
      if (result.ok) {
        setScheduling(false);
        router.refresh();
      }
    });
  }

  function submitConfirm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startConfirm(async () => {
      const result = await confirmDelivery(initial, form);
      setConfirmState(result);
      if (result.ok) {
        setConfirming(false);
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardHeader title="Delivery" subtitle="Final handover or service completion to the client" />
      <CardBody className="flex flex-col gap-4">
        {delivery && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-3">
            <div>
              <div className="flex items-center gap-2">
                <Badge tone={STATUS_TONE[delivery.status]}>{delivery.status}</Badge>
                {delivery.scheduled_at && <p className="text-xs text-ink-faint">Scheduled {formatDate(delivery.scheduled_at)}</p>}
              </div>
              {delivery.dispatched_at && <p className="mt-1 text-xs text-ink-faint">Dispatched {formatDate(delivery.dispatched_at)}</p>}
              {delivery.client_confirmed_at && (
                <p className="mt-1 text-xs text-ink-faint">
                  Confirmed {formatDate(delivery.client_confirmed_at)}
                  {delivery.proof_type && delivery.proof_type !== "none" ? ` · ${delivery.proof_type}${delivery.proof_ref ? ` (${delivery.proof_ref})` : ""}` : ""}
                </p>
              )}
              {delivery.notes && <p className="mt-1 text-xs text-ink-soft">&ldquo;{delivery.notes}&rdquo;</p>}
            </div>

            {canDispatch && delivery.status === "scheduled" && (
              <div className="flex flex-col items-end gap-1">
                <Button size="sm" busy={dispatchPending} onClick={dispatch}>
                  Mark dispatched
                </Button>
                {dispatchError && <p className="text-xs text-critical">{dispatchError}</p>}
              </div>
            )}
          </div>
        )}

        {canComplete && delivery && delivery.status === "dispatched" && (
          confirming ? (
            <form onSubmit={submitConfirm} className="flex flex-col gap-2.5 rounded-lg border border-line p-3">
              <input type="hidden" name="delivery_id" value={delivery.id} />
              <input type="hidden" name="case_id" value={caseId} />
              <SelectInput label="Proof of delivery" name="proof_type" defaultValue="none">
                <option value="none">None</option>
                <option value="signature">Signature</option>
                <option value="photo">Photo</option>
                <option value="otp">OTP</option>
              </SelectInput>
              <TextInput label="Reference" name="proof_ref" hint="Optional — a signee name, photo filename or OTP code" />
              <TextArea label="Notes" name="notes" rows={2} hint="Optional" />
              {confirmState.error && <p className="text-xs text-critical">{confirmState.error}</p>}
              <div className="flex gap-2">
                <Button type="submit" size="sm" busy={confirmPending}>
                  Confirm delivered
                </Button>
                <button type="button" onClick={() => setConfirming(false)} className="text-xs font-semibold text-ink-faint hover:text-ink">
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setConfirming(true)}>
              Confirm delivered
            </Button>
          )
        )}

        {canAssign && (!delivery || delivery.status === "scheduled") && (
          scheduling ? (
            <form onSubmit={submitSchedule} className="flex flex-col gap-2.5 rounded-lg border border-line p-3">
              <input type="hidden" name="case_id" value={caseId} />
              <TextInput
                label="Scheduled for"
                name="scheduled_at"
                type="datetime-local"
                required
                defaultValue={delivery?.scheduled_at ? delivery.scheduled_at.slice(0, 16) : undefined}
              />
              <TextArea label="Notes" name="notes" rows={2} hint="Optional" defaultValue={delivery?.notes ?? ""} />
              {scheduleState.error && <p className="text-xs text-critical">{scheduleState.error}</p>}
              <div className="flex gap-2">
                <Button type="submit" size="sm" busy={schedulePending}>
                  {delivery ? "Update schedule" : "Schedule delivery"}
                </Button>
                <button type="button" onClick={() => setScheduling(false)} className="text-xs font-semibold text-ink-faint hover:text-ink">
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setScheduling(true)}>
              {delivery ? "Reschedule" : "Schedule delivery"}
            </Button>
          )
        )}
      </CardBody>
    </Card>
  );
}
