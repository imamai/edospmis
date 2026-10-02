"use client";

import { useState } from "react";
import { returnBidForCorrection } from "@/app/app/procurement/requirement-actions";
import { ModalFormActions } from "@/components/ui/modal";
import { TextArea } from "@/components/ui/field";
import type { RfqRequirement } from "@/lib/tender-types";

/**
 * Handing a bid back, for named documents only.
 *
 * The buyer ticks what is at fault and says why. A blanket "do it again"
 * invites a bidder to revise things nobody asked about, which is how a
 * correction turns into a second bite at the tender.
 *
 * The price is not on this screen and cannot be put on it. That is stated
 * plainly rather than left to be discovered, because the obvious reason to
 * reach for this button is a price that looks wrong, and the answer to that
 * is a rejection, not a correction.
 */
export function ReturnBidForm({
  caseId,
  submissionId,
  supplierName,
  requirements,
  onDone,
  onCancel,
}: {
  caseId: string;
  submissionId: string;
  supplierName: string;
  requirements: RfqRequirement[];
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    setError(null);
    setPending(true);
    const docTypeIds = requirements
      .filter((r) => r.doc_type_id && picked.has(r.requirement_id))
      .map((r) => r.doc_type_id!);
    const templateIds = requirements
      .filter((r) => r.template_id && picked.has(r.requirement_id))
      .map((r) => r.template_id!);

    void returnBidForCorrection(
      caseId,
      submissionId,
      reason,
      docTypeIds,
      templateIds,
    ).then((result) => {
      setPending(false);
      if (result.error) setError(result.error);
      else onDone(result.ok ?? "Sent back.");
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-3"
    >
      <p className="rounded-lg border border-attention/25 bg-attention-soft px-3 py-2 text-xs text-attention">
        {supplierName}&rsquo;s price stands as submitted and cannot be changed
        by a correction. Only the documents you tick are cleared; everything
        else they sent is carried over. If the price itself is wrong, reject the
        bid instead.
      </p>

      <div>
        <p className="mb-1.5 text-xs font-semibold tracking-wide text-ink-faint uppercase">
          What needs replacing
        </p>
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
          {requirements.map((r) => (
            <li key={r.requirement_id}>
              <label className="flex cursor-pointer items-start gap-2.5 px-3 py-2.5 hover:bg-surface-sunk">
                <input
                  type="checkbox"
                  checked={picked.has(r.requirement_id)}
                  onChange={() => toggle(r.requirement_id)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong text-brand focus:ring-brand/25"
                />
                <span className="min-w-0">
                  <span className="block text-sm text-ink">{r.name}</span>
                  {!r.is_mandatory && (
                    <span className="text-xs text-ink-faint">optional</span>
                  )}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>

      <TextArea
        label="Why"
        name="reason"
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        hint="The supplier reads this, in the email and on their page. Say what is wrong with each one."
        required
      />

      {error && <p className="text-xs text-critical">{error}</p>}

      <ModalFormActions
        onCancel={onCancel}
        submitLabel={
          picked.size > 1
            ? `Send back ${picked.size} documents`
            : "Send back for correction"
        }
        busy={pending}
      />
    </form>
  );
}
