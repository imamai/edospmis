"use client";

import { useActionState, useState } from "react";
import { Check } from "lucide-react";
import { choosePlan, recordPayment, type BillingState } from "./actions";
import { Button } from "@/components/ui/button";
import { SelectInput, TextInput } from "@/components/ui/field";
import { priceLabel, seatLabel, type Plan, type PlanCode } from "@/lib/plans";
import { cn } from "@/lib/utils";

const initial: BillingState = { error: null, ok: null };

function Notice({ state }: { state: BillingState }) {
  if (state.error) {
    return (
      <p
        role="alert"
        className="rounded-lg border border-critical/25 bg-critical-soft px-3 py-2 text-sm text-critical"
      >
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p className="rounded-lg border border-good/25 bg-good-soft px-3 py-2 text-sm text-good">
        {state.ok}
      </p>
    );
  }
  return null;
}

export function PlanChooser({
  plans,
  current,
}: {
  plans: Plan[];
  current: PlanCode;
}) {
  const [state, action, pending] = useActionState(choosePlan, initial);
  const [picked, setPicked] = useState<PlanCode>(current);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="plan_code" value={picked} />

      <div className="grid gap-3 sm:grid-cols-3">
        {plans.map((plan) => {
          const selected = picked === plan.code;
          return (
            <button
              type="button"
              key={plan.code}
              onClick={() => setPicked(plan.code)}
              aria-pressed={selected}
              className={cn(
                "flex flex-col rounded-xl border p-4 text-left transition-colors",
                selected
                  ? "border-brand bg-brand-tint ring-1 ring-brand/20"
                  : "border-line hover:border-brand/40",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-semibold text-ink">{plan.name}</span>
                {plan.code === current && (
                  <span className="rounded-full bg-surface-sunk px-2 py-0.5 text-[0.6875rem] font-medium text-ink-faint">
                    Current
                  </span>
                )}
              </span>
              <span className="mt-2 text-lg font-semibold text-ink tnum">{priceLabel(plan)}</span>
              <span className="text-xs text-ink-faint">
                per {plan.billingPeriod} · {seatLabel(plan)}
              </span>
              {selected && (
                <ul className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3">
                  {plan.features.slice(0, 4).map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-xs text-ink-soft">
                      <Check className="mt-0.5 h-3 w-3 shrink-0 text-good" aria-hidden="true" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              )}
            </button>
          );
        })}
      </div>

      <Notice state={state} />

      <div className="flex items-center gap-3">
        <Button type="submit" busy={pending} disabled={picked === current}>
          {pending ? "Saving" : picked === current ? "This is your plan" : `Move to ${picked}`}
        </Button>
        <p className="text-xs text-ink-faint">
          Changing the plan does not charge anything. It sets what you will be invoiced for.
        </p>
      </div>
    </form>
  );
}

export function PaymentForm({ plans, current }: { plans: Plan[]; current: PlanCode }) {
  const [state, action, pending] = useActionState(recordPayment, initial);
  const [kind, setKind] = useState<"subscription" | "onboarding">("subscription");

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectInput
          label="What was paid for"
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as "subscription" | "onboarding")}
        >
          <option value="subscription">Subscription</option>
          <option value="onboarding">One-off onboarding fee</option>
        </SelectInput>

        <SelectInput label="Plan" name="plan_code" defaultValue={current}>
          {plans.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name} — {priceLabel(p)}/{p.billingPeriod}
            </option>
          ))}
        </SelectInput>

        <SelectInput label="Paid by" name="provider" defaultValue="mpesa">
          <option value="mpesa">M-Pesa</option>
          <option value="bank">Bank transfer</option>
          <option value="cash">Cash</option>
          <option value="other">Other</option>
        </SelectInput>

        <TextInput
          label="Reference"
          name="reference"
          placeholder="e.g. SJ48KD91XM"
          hint="The M-Pesa code or bank reference"
        />

        <TextInput
          label="Amount (KES)"
          name="amount"
          inputMode="decimal"
          required
          placeholder="4500"
        />

        {kind === "subscription" && (
          <TextInput
            label="Months covered"
            name="months"
            type="number"
            min={1}
            defaultValue={1}
            required
            hint="The paid period extends by this many months"
          />
        )}

        <TextInput
          label="Paid on"
          name="paid_at"
          type="date"
          hint="Leave blank for today"
        />
      </div>

      <TextInput label="Note" name="note" placeholder="Optional — what this covers" />

      <Notice state={state} />

      <div>
        <Button type="submit" busy={pending}>
          {pending ? "Recording" : "Record this payment"}
        </Button>
      </div>
    </form>
  );
}
