"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  recordQuotations,
  type QuotationEntry,
} from "@/app/app/procurement/actions";
import { Button } from "@/components/ui/button";
import { ModalFormActions } from "@/components/ui/modal";
import { formatMoney } from "@/lib/utils";
import type { PRItem } from "@/lib/database.types";

/**
 * Recording what came back, all of it, in one sitting.
 *
 * Quotations do not arrive one at a time. A buyer opens their email on the
 * closing date and has four of them — and the form took one supplier per
 * round, so this got done late or not at all.
 *
 * Every invited supplier is listed, including those who have already quoted:
 * they are shown with what they quoted and no input, because the useful thing
 * at this moment is seeing who is still missing, not a tidier list.
 *
 * A total is enough. Opening a supplier's lines is for when you want the
 * comparison to show where the difference is — two bids a hundred thousand
 * apart usually differ on one item, and a pair of totals will not say which.
 * Entering any line price takes over the total, because a total typed next to
 * lines that contradict it is a number nobody can defend later.
 */

export interface QuoteCandidate {
  supplierId: string;
  name: string;
  /** Already on file, in cents. Null when they have not quoted. */
  quotedCents: number | null;
  currency: string;
}

interface Draft {
  total: string;
  notes: string;
  lines: string[];
}

export function RecordQuotationsForm({
  rfqId,
  caseId,
  candidates,
  items,
  onDone,
  onCancel,
}: {
  rfqId: string;
  caseId: string;
  candidates: QuoteCandidate[];
  items: PRItem[];
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const outstanding = candidates.filter((c) => c.quotedCents === null);

  function draftOf(id: string): Draft {
    return drafts[id] ?? { total: "", notes: "", lines: items.map(() => "") };
  }

  function update(id: string, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [id]: { ...draftOf(id), ...patch } }));
  }

  /** The lines, where any were priced — otherwise nothing. */
  function linesOf(id: string) {
    const d = draftOf(id);
    if (!d.lines.some((v) => v.trim() !== "")) return null;
    return items.map((item, i) => ({
      description: item.description,
      qty: item.qty,
      unit: item.unit,
      unit_price_cents: Math.round((Number(d.lines[i]) || 0) * 100),
    }));
  }

  function totalOf(id: string): number {
    const lines = linesOf(id);
    if (lines)
      return lines.reduce((sum, l) => sum + l.qty * l.unit_price_cents, 0);
    return Math.round((Number(draftOf(id).total) || 0) * 100);
  }

  const ready = outstanding.filter((c) => totalOf(c.supplierId) > 0);

  function save() {
    setError(null);
    setPending(true);
    const entries: QuotationEntry[] = ready.map((c) => ({
      supplierId: c.supplierId,
      totalCents: totalOf(c.supplierId),
      notes: draftOf(c.supplierId).notes.trim() || null,
      linePrices: linesOf(c.supplierId),
    }));
    void recordQuotations(rfqId, caseId, entries).then((result) => {
      setPending(false);
      if (result.error) setError(result.error);
      else onDone(result.ok ?? "Recorded.");
    });
  }

  if (outstanding.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink-soft">
          Every invited supplier already has a quotation on this request.
        </p>
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onCancel}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="flex flex-col gap-3"
    >
      <p className="text-xs text-ink-faint">
        Enter what each supplier quoted. Leave a supplier blank if they have not
        replied — you can come back and add them.
      </p>

      <div className="flex flex-col divide-y divide-line rounded-lg border border-line">
        {candidates.map((c) => {
          const quoted = c.quotedCents !== null;
          const d = draftOf(c.supplierId);
          const lines = linesOf(c.supplierId);
          const open = expanded === c.supplierId;
          const derived = totalOf(c.supplierId);

          return (
            <div key={c.supplierId} className="flex flex-col gap-2 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-ink">{c.name}</p>
                {quoted ? (
                  <span className="text-xs text-ink-faint">
                    already quoted{" "}
                    {formatMoney(c.quotedCents!, { currency: c.currency })}
                  </span>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      aria-label={`Total quoted by ${c.name}`}
                      value={lines ? (derived / 100).toFixed(2) : d.total}
                      readOnly={Boolean(lines)}
                      onChange={(e) =>
                        update(c.supplierId, { total: e.target.value })
                      }
                      placeholder="Total"
                      className="h-9 w-32 rounded-md border border-line-strong bg-surface px-2 text-sm tnum focus:border-brand focus:outline-none read-only:bg-surface-sunk read-only:text-ink-faint"
                    />
                    {items.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setExpanded(open ? null : c.supplierId)}
                        className="flex items-center gap-1 text-xs font-semibold text-ink-faint hover:text-ink"
                      >
                        Lines
                        <ChevronDown
                          className={
                            open ? "h-3.5 w-3.5 rotate-180" : "h-3.5 w-3.5"
                          }
                          aria-hidden="true"
                        />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {!quoted && open && (
                <div className="overflow-x-auto rounded-md border border-line">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-line bg-surface-sunk text-ink-faint">
                        <th className="p-2 font-medium">Item</th>
                        <th className="p-2 font-medium">Qty</th>
                        <th className="p-2 font-medium">Unit price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, i) => (
                        <tr
                          key={i}
                          className="border-b border-line last:border-0"
                        >
                          <td className="p-2 text-ink">{item.description}</td>
                          <td className="p-2 tnum text-ink-soft">
                            {item.qty} {item.unit}
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              min="0"
                              aria-label={`${item.description} unit price from ${c.name}`}
                              value={d.lines[i] ?? ""}
                              onChange={(e) =>
                                update(c.supplierId, {
                                  lines: d.lines.map((v, idx) =>
                                    idx === i ? e.target.value : v,
                                  ),
                                })
                              }
                              className="h-8 w-28 rounded-md border border-line-strong bg-surface px-2 text-xs tnum focus:border-brand focus:outline-none"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {!quoted && (
                <input
                  type="text"
                  value={d.notes}
                  onChange={(e) =>
                    update(c.supplierId, { notes: e.target.value })
                  }
                  placeholder="Notes — lead time, terms (optional)"
                  className="h-9 rounded-md border border-line-strong bg-surface px-2 text-sm focus:border-brand focus:outline-none"
                />
              )}
            </div>
          );
        })}
      </div>

      {error && <p className="text-xs text-critical">{error}</p>}

      <ModalFormActions
        onCancel={onCancel}
        submitLabel={
          ready.length > 1
            ? `Record ${ready.length} quotations`
            : "Record quotation"
        }
        busy={pending}
      />
    </form>
  );
}
