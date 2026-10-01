"use client";

import { useState, useTransition } from "react";
import {
  CircleAlert,
  Download,
  FileSignature,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { openBidDocument } from "@/app/app/procurement/requirement-actions";
import { formatDate } from "@/lib/utils";
import type { BidReview } from "@/lib/data/tender";

/**
 * What each bidder sent back.
 *
 * Without this the tender pack was write-only: a supplier could upload a CR12
 * and nobody on the buying side could see it — which makes the award gate feel
 * arbitrary, because a refusal names a document the evaluator has no way to
 * confirm is missing.
 *
 * "Still missing" comes from the same database function the gate itself uses,
 * so what is read here and what is enforced at award cannot drift apart.
 */
export function BidReviewList({
  reviews,
  names,
}: {
  reviews: BidReview[];
  /** supplier_id → the name to show. */
  names: Record<string, string>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function open(id: string) {
    setError(null);
    start(async () => {
      const url = await openBidDocument(id);
      if (!url) {
        setError("That file could not be opened. It may have been removed.");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    });
  }

  if (reviews.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold text-ink">What bidders returned</p>

      {reviews.map((bid) => (
        <div
          key={bid.submission_id}
          className="rounded-lg border border-line p-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">
                {names[bid.supplier_id] ?? "Supplier"}
                {bid.version > 1 && (
                  <span className="ml-2 text-xs font-normal text-ink-faint">
                    resubmitted — version {bid.version}
                  </span>
                )}
              </p>
              {bid.signed_at && (
                <p className="text-xs text-ink-faint">
                  Signed by {bid.signed_name}
                  {bid.signed_position
                    ? `, ${bid.signed_position}`
                    : ""} on {formatDate(bid.signed_at)}
                </p>
              )}
            </div>
            {bid.outstanding.length === 0 ? (
              <Badge tone="good">complete</Badge>
            ) : (
              <Badge tone="critical">{bid.outstanding.length} missing</Badge>
            )}
          </div>

          {bid.outstanding.length > 0 && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-critical">
              <CircleAlert
                className="mt-0.5 h-3.5 w-3.5 shrink-0"
                aria-hidden="true"
              />
              Still missing: {bid.outstanding.join(", ")}. Award is blocked
              until these are returned, or a reason is recorded.
            </p>
          )}

          {(bid.documents.length > 0 || bid.templates.length > 0) && (
            <ul className="mt-2 flex flex-col divide-y divide-line">
              {bid.documents.map((doc) => (
                <li
                  key={doc.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-1.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs text-ink">
                      <span className="font-medium">
                        {doc.requirement ?? "Sent unasked"}
                      </span>
                      {" — "}
                      {doc.filename}
                    </p>
                    {doc.note && (
                      <p className="text-[11px] text-ink-faint">{doc.note}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => open(doc.id)}
                    disabled={pending}
                    className="flex shrink-0 items-center gap-1 rounded-md border border-line px-2 py-1 text-xs font-semibold text-ink-soft hover:border-brand hover:text-brand disabled:opacity-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Open
                  </button>
                </li>
              ))}

              {bid.templates.map((tpl) => (
                <li
                  key={tpl.name}
                  className="flex items-center gap-1.5 py-1.5 text-xs text-ink"
                >
                  <FileSignature
                    className="h-3.5 w-3.5 shrink-0 text-ink-faint"
                    aria-hidden="true"
                  />
                  <span className="font-medium">{tpl.name}</span>
                  <span className="text-ink-faint">
                    {tpl.filename
                      ? `— ${tpl.filename}`
                      : "— completed in the page"}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {bid.content_hash && (
            <p
              className="mt-2 flex items-center gap-1 text-[11px] text-ink-faint"
              title="A digest of the answers, documents and prices exactly as submitted. Any later change produces a different value, so this is what makes the signature evidence of what was signed."
            >
              <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
              Signature covers content {bid.content_hash.slice(0, 12)}
            </p>
          )}
        </div>
      ))}

      {error && (
        <p role="alert" className="text-xs text-critical">
          {error}
        </p>
      )}
    </div>
  );
}
