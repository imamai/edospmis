"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { setMatchTolerances, type FinanceState } from "../../finance/actions";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/field";
import type { MatchTolerances } from "@/lib/data/finance";

const initial: FinanceState = { error: null, ok: null };

export function ToleranceForm({ tolerances }: { tolerances: MatchTolerances }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(setMatchTolerances, initial);
  const [pct, setPct] = useState(tolerances.price_pct);
  const [amount, setAmount] = useState(tolerances.price_cents / 100);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  const off = Number(pct) === 0 && Number(amount) === 0;

  return (
    <form action={action} className="flex flex-col gap-3">
      <p className="text-sm text-ink-soft">
        How far a supplier&rsquo;s price may differ from the price you ordered at before it is raised as a match exception.
        The more generous of the two applies, so a small flat figure can cover rounding on cheap lines while a percentage
        covers freight or exchange movement on expensive ones.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <NumberInput
          label="Percentage of the ordered price"
          name="price_pct"
          min={0}
          max={100}
          decimals
          value={pct}
          onChange={(e) => setPct(Number(e.target.value))}
          unit="%"
        />
        <NumberInput
          label="Or a flat amount per unit"
          name="price_amount"
          min={0}
          decimals
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          unit="KES"
        />
      </div>
      <p className="text-xs text-ink-faint">
        {off
          ? "Both are zero, so every difference is an exception — including a one-shilling rounding."
          : "Differences inside the tolerance pass the match; anything beyond it is still raised."}
      </p>
      {state.error && <p className="text-xs text-critical">{state.error}</p>}
      <div>
        <Button type="submit" size="sm" busy={pending}>
          Save tolerance
        </Button>
      </div>
    </form>
  );
}
