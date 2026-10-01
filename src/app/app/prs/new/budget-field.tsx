"use client";

import { useMemo, useState } from "react";
import { TextArea } from "@/components/ui/field";
import { BudgetPicker } from "./budget-picker";
import { formatMoney } from "@/lib/utils";
import type { BudgetChoice } from "@/lib/data/budgets";

/**
 * Charging a request to a budget line, and saying so when it does not fit.
 *
 * The balance is shown against the running total of the lines being entered,
 * so the requester sees the consequence while they are still typing rather
 * than after an approver bounces it back. Nothing is blocked: an over-budget
 * request goes through with a reason recorded, because a request refused here
 * is a request raised outside the system, which is worse than one that is
 * visible and flagged.
 */
export function BudgetField({
  budgets,
  estimatedCents,
}: {
  budgets: BudgetChoice[];
  /** The running total of the item lines, recomputed as they are typed. */
  estimatedCents: number;
}) {
  const [budgetId, setBudgetId] = useState("");

  const chosen = useMemo(
    () => budgets.find((b) => b.id === budgetId) ?? null,
    [budgets, budgetId],
  );
  const remainingAfter = chosen
    ? chosen.available_cents - estimatedCents
    : null;
  const overBudget = remainingAfter !== null && remainingAfter < 0;

  if (budgets.length === 0) {
    return <input type="hidden" name="budget_id" value="" />;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* The value travels in a hidden input because the picker is a dialog,
          and a dialog portals to document.body — outside this form, so a
          control rendered inside it would not be submitted with it. */}
      <input type="hidden" name="budget_id" value={budgetId} />
      <BudgetPicker
        budgets={budgets}
        value={budgetId}
        onChange={setBudgetId}
        estimatedCents={estimatedCents}
      />

      {chosen && (
        <div
          className={
            overBudget
              ? "rounded-lg border border-critical/25 bg-critical-soft px-3 py-2.5 text-sm text-critical"
              : "rounded-lg border border-good/25 bg-good-soft px-3 py-2.5 text-sm text-good"
          }
        >
          <p className="tnum">
            {formatMoney(chosen.available_cents, { currency: chosen.currency })}{" "}
            available
            {estimatedCents > 0 && (
              <>
                {" · "}
                this request is{" "}
                {formatMoney(estimatedCents, { currency: chosen.currency })}
                {" · "}
                <strong className="font-semibold">
                  {overBudget
                    ? `${formatMoney(Math.abs(remainingAfter ?? 0), { currency: chosen.currency })} over`
                    : `${formatMoney(remainingAfter ?? 0, { currency: chosen.currency })} would remain`}
                </strong>
              </>
            )}
          </p>
          {overBudget && (
            <p className="mt-1 text-xs">
              This can still be submitted. Say why, and the approver will see it
              on the decision.
            </p>
          )}
        </div>
      )}

      {overBudget && (
        <TextArea
          label="Why this exceeds the budget"
          name="budget_override_reason"
          required
          rows={2}
          placeholder="e.g. Emergency replacement — the failed unit stops the line. A transfer from maintenance has been agreed."
        />
      )}
    </div>
  );
}
