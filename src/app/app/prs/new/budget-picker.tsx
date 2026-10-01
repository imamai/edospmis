"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Search, Wallet } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { formatMoney } from "@/lib/utils";
import type { BudgetChoice } from "@/lib/data/budgets";

/**
 * Choosing the budget line a request is charged to.
 *
 * A dropdown was fine while a workspace had four lines. A real chart of
 * accounts is a line per department per category per period, which is
 * hundreds — and in a dropdown the right answer is unfindable, so spend lands
 * on whichever line was nearest the top. Searchable, with the balance beside
 * each one, because the balance is usually what decides it.
 *
 * Filtered in the browser: the lines are already on the page, having been
 * fetched for the balance display, so a round trip per keystroke would be
 * slower and no more correct.
 */
export function BudgetPicker({
  budgets,
  value,
  onChange,
  /** The running total of the item lines, so "what would be left" is honest. */
  estimatedCents,
}: {
  budgets: BudgetChoice[];
  value: string;
  onChange: (id: string) => void;
  estimatedCents: number;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const chosen = useMemo(
    () => budgets.find((b) => b.id === value) ?? null,
    [budgets, value],
  );

  const shown = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (!needle) return budgets;
    return budgets.filter((b) => b.label.toLowerCase().includes(needle));
  }, [budgets, term]);

  // Focus only. The search term is cleared where the dialog is opened, in the
  // handler below — doing it here would be a setState inside an effect, which
  // is a cascading render for no reason.
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => searchRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [open]);

  function openPicker() {
    setTerm("");
    setOpen(true);
  }

  function choose(id: string) {
    onChange(id);
    setOpen(false);
  }

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-ink-soft">Budget line</span>
        <button
          type="button"
          onClick={openPicker}
          className="flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 text-left text-sm text-ink hover:border-brand focus:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
        >
          <span
            className={chosen ? "truncate text-ink" : "truncate text-ink-faint"}
          >
            {chosen ? chosen.label : "Not set — choose a budget line"}
          </span>
          <Wallet
            className="h-4 w-4 shrink-0 text-ink-faint"
            aria-hidden="true"
          />
        </button>
        <span className="text-[11px] text-ink-faint">
          What this is to be met from
        </span>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Choose a budget line"
        description="Every open line is listed, not only your own — requests are charged to a central line all the time."
        size="lg"
      >
        <div className="flex flex-col gap-3">
          <label className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
              aria-hidden="true"
            />
            <input
              ref={searchRef}
              id="budget-picker-search"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search by line, department or period"
              aria-label="Search budget lines"
              className="h-11 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
            />
          </label>

          <div className="max-h-[48dvh] overflow-y-auto rounded-lg border border-line">
            {shown.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-ink-faint">
                No budget line matches &ldquo;{term.trim()}&rdquo;.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                <li>
                  <button
                    type="button"
                    onClick={() => choose("")}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-surface-sunk"
                  >
                    <span className="text-sm text-ink-faint">
                      Not set — decide later
                      <span className="mt-0.5 block text-xs">
                        Allowed, but an approver sees no balance against this
                        request.
                      </span>
                    </span>
                    {value === "" && (
                      <Check
                        className="h-4 w-4 shrink-0 text-brand"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                </li>

                {shown.map((budget) => {
                  // What this request would leave behind — the number that
                  // actually decides whether this is the right line.
                  const after = budget.available_cents - estimatedCents;
                  const over = estimatedCents > 0 && after < 0;
                  return (
                    <li key={budget.id}>
                      <button
                        type="button"
                        onClick={() => choose(budget.id)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-surface-sunk"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-ink">
                            {budget.label}
                          </span>
                          <span className="tnum mt-0.5 block text-xs text-ink-faint">
                            {formatMoney(budget.available_cents, {
                              currency: budget.currency,
                            })}{" "}
                            of{" "}
                            {formatMoney(budget.allocated_cents, {
                              currency: budget.currency,
                            })}{" "}
                            left
                            {estimatedCents > 0 && (
                              <span
                                className={over ? "text-critical" : "text-good"}
                              >
                                {" · "}
                                {over
                                  ? `${formatMoney(Math.abs(after), { currency: budget.currency })} over`
                                  : `${formatMoney(after, { currency: budget.currency })} would remain`}
                              </span>
                            )}
                          </span>
                        </span>
                        {value === budget.id && (
                          <Check
                            className="h-4 w-4 shrink-0 text-brand"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <p className="text-xs text-ink-faint">
            An over-budget line can still be chosen. You will be asked why, and
            the approver sees the reason on the decision — a request refused
            here is a request raised outside the system.
          </p>
        </div>
      </Modal>
    </>
  );
}
