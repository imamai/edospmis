"use client";

import { useState, useTransition } from "react";
import { ChevronDown, CircleAlert, Download, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { openBidDocument } from "@/app/app/procurement/requirement-actions";
import { formatDate, formatMoney } from "@/lib/utils";
import type { BidReview } from "@/lib/data/tender";

/**
 * Everything that came back, in one table.
 *
 * The price and the paperwork used to be two separate lists, so deciding an
 * award meant scrolling between "what they charge" and "what they returned"
 * and holding both in your head. They are one decision, so they are one row:
 * supplier, quotation, whether the pack is complete, and the button.
 *
 * Suppliers who have not replied are listed too, greyed. A tender is as much
 * about who is silent as who answered — and with only the responders shown,
 * two of five replying looked the same as two of two.
 *
 * The cheapest quotation is marked. Marked, not sorted and not recommended:
 * it is one fact among several, and a table that puts it first implies the
 * choice has been made.
 */

export interface ResponseRow {
  supplierId: string;
  name: string;
  /** Null when they have not quoted. */
  quotationId: string | null;
  totalCents: number | null;
  currency: string;
  submittedAt: string | null;
  viaPortal: boolean;
  /** Their tender pack, where one was submitted. */
  bid: BidReview | null;
  inviteStatus: string | null;
}

export function ResponsesTable({
  rows,
  canAward,
  onView,
  onAward,
}: {
  rows: ResponseRow[];
  canAward: boolean;
  onView: (quotationId: string) => void;
  onAward: (quotationId: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (rows.length === 0) return null;

  const quoted = rows.filter((r) => r.totalCents !== null);
  const lowest =
    quoted.length > 1 ? Math.min(...quoted.map((r) => r.totalCents!)) : null;
  const responded = quoted.length;

  function openDoc(id: string) {
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

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-ink">Responses</p>
        <p className="text-xs text-ink-faint">
          {responded} of {rows.length} invited{" "}
          {responded === 1 ? "has" : "have"} quoted
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-sunk text-xs uppercase tracking-wide text-ink-faint">
              <th className="px-3 py-2 font-medium">Supplier</th>
              <th className="px-3 py-2 text-right font-medium">Quotation</th>
              <th className="px-3 py-2 font-medium">Documents</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isOpen = expanded === row.supplierId;
              const hasPack = row.bid !== null;
              const complete = hasPack && row.bid!.outstanding.length === 0;

              return (
                <tr
                  key={row.supplierId}
                  className={
                    row.totalCents === null
                      ? "border-b border-line/60 last:border-0 text-ink-faint"
                      : "border-b border-line/60 last:border-0"
                  }
                >
                  <td className="px-3 py-2.5 align-top">
                    <p className="font-medium text-ink">{row.name}</p>
                    <p className="text-xs text-ink-faint">
                      {row.submittedAt
                        ? `${row.viaPortal ? "Via the portal" : "Entered by hand"} · ${formatDate(row.submittedAt)}`
                        : row.inviteStatus === "declined"
                          ? "Declined"
                          : "No response yet"}
                    </p>
                  </td>

                  <td className="tnum px-3 py-2.5 text-right align-top">
                    {row.totalCents === null ? (
                      <span className="text-xs">—</span>
                    ) : (
                      <>
                        <span className="font-semibold text-ink">
                          {formatMoney(row.totalCents, {
                            currency: row.currency,
                          })}
                        </span>
                        {lowest !== null && row.totalCents === lowest && (
                          <span className="mt-0.5 block text-[11px] font-medium text-good">
                            lowest
                          </span>
                        )}
                      </>
                    )}
                  </td>

                  <td className="px-3 py-2.5 align-top">
                    {!hasPack ? (
                      <span className="text-xs text-ink-faint">
                        Not submitted
                      </span>
                    ) : complete ? (
                      <button
                        type="button"
                        onClick={() =>
                          setExpanded(isOpen ? null : row.supplierId)
                        }
                        className="flex items-center gap-1 text-xs font-medium text-good hover:underline"
                      >
                        <Badge tone="good">complete</Badge>
                        <ChevronDown
                          className={
                            isOpen ? "h-3.5 w-3.5 rotate-180" : "h-3.5 w-3.5"
                          }
                          aria-hidden="true"
                        />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setExpanded(isOpen ? null : row.supplierId)
                        }
                        className="flex flex-col items-start gap-0.5 text-left"
                      >
                        <Badge tone="critical">
                          {row.bid!.outstanding.length} missing
                        </Badge>
                        <span className="flex items-center gap-1 text-[11px] text-critical">
                          <CircleAlert
                            className="h-3 w-3 shrink-0"
                            aria-hidden="true"
                          />
                          {row.bid!.outstanding.join(", ")}
                        </span>
                      </button>
                    )}

                    {isOpen && hasPack && (
                      <ul className="mt-2 flex flex-col gap-1">
                        {row.bid!.documents.map((doc) => (
                          <li
                            key={doc.id}
                            className="flex items-center justify-between gap-2"
                          >
                            <span className="truncate text-[11px] text-ink-soft">
                              {doc.requirement ?? "Sent unasked"} —{" "}
                              {doc.filename}
                            </span>
                            <button
                              type="button"
                              onClick={() => openDoc(doc.id)}
                              disabled={pending}
                              className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-brand hover:underline disabled:opacity-50"
                            >
                              <Download className="h-3 w-3" />
                              Open
                            </button>
                          </li>
                        ))}
                        {row.bid!.templates.map((t) => (
                          <li
                            key={t.name}
                            className="text-[11px] text-ink-soft"
                          >
                            {t.name} — {t.filename ?? "completed in the page"}
                          </li>
                        ))}
                        {row.bid!.signed_at && (
                          <li className="flex items-center gap-1 text-[11px] text-ink-faint">
                            <ShieldCheck
                              className="h-3 w-3 shrink-0"
                              aria-hidden="true"
                            />
                            Signed by {row.bid!.signed_name}
                            {row.bid!.signed_position
                              ? `, ${row.bid!.signed_position}`
                              : ""}{" "}
                            on {formatDate(row.bid!.signed_at)}
                          </li>
                        )}
                      </ul>
                    )}
                  </td>

                  <td className="px-3 py-2.5 text-right align-top">
                    {row.quotationId && (
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onView(row.quotationId!)}
                        >
                          View
                        </Button>
                        {canAward && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => onAward(row.quotationId!)}
                          >
                            Award
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {error && (
        <p role="alert" className="text-xs text-critical">
          {error}
        </p>
      )}
    </div>
  );
}
