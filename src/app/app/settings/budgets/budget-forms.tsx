"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createBudget, createBudgetPeriod, type BudgetFormState } from "./actions";
import { Button } from "@/components/ui/button";
import { SelectInput, TextInput } from "@/components/ui/field";
import { PlacementPicker } from "@/components/app/placement-picker";
import type { Category, PlacementOptions } from "@/lib/database.types";
import type { BudgetPeriod } from "@/lib/data/budgets";

const initial: BudgetFormState = { error: null, ok: null };

function Notice({ state }: { state: BudgetFormState }) {
  if (state.error) {
    return (
      <p role="alert" className="rounded-lg border border-critical/25 bg-critical-soft px-3 py-2 text-sm text-critical">
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return <p className="rounded-lg border border-good/25 bg-good-soft px-3 py-2 text-sm text-good">{state.ok}</p>;
  }
  return null;
}

export function PeriodForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState(createBudgetPeriod, initial);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <TextInput label="Period name" name="name" required placeholder="e.g. FY2026" />
        <TextInput label="Starts on" name="starts_on" type="date" required />
        <TextInput label="Ends on" name="ends_on" type="date" required />
      </div>
      <Notice state={state} />
      <div>
        <Button type="submit" busy={pending}>
          {pending ? "Creating" : "Create period"}
        </Button>
      </div>
    </form>
  );
}

export function BudgetLineForm({
  periods,
  categories,
  placementOptions,
}: {
  periods: BudgetPeriod[];
  categories: Category[];
  placementOptions: PlacementOptions;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createBudget, initial);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  if (periods.length === 0) {
    return (
      <p className="text-sm text-ink-faint">
        Create a period first — a budget line has to belong to one, so that what is left can be
        counted against a span of time rather than against all of history.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectInput label="Period" name="period_id" required defaultValue={periods[0]?.id}>
          {periods.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </SelectInput>
        <TextInput label="Line name" name="name" required placeholder="e.g. IT capital expenditure" />
        <TextInput label="Code" name="code" hint="Optional — your own general-ledger reference" />
        <TextInput
          label="Amount (KES)"
          name="amount"
          required
          inputMode="decimal"
          placeholder="1,500,000"
        />
        <SelectInput label="Category" name="category_id" hint="Optional — leave unset for any spend">
          <option value="">Any category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </SelectInput>
      </div>

      <div className="rounded-lg border border-line bg-surface-sunk p-3.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Whose budget this is</p>
        <p className="mt-0.5 mb-3 text-xs text-ink-faint">
          Set the deepest level that owns the money. A line held at a department covers every team
          in it.
        </p>
        <PlacementPicker options={placementOptions} />
      </div>

      <Notice state={state} />
      <div>
        <Button type="submit" busy={pending}>
          {pending ? "Creating" : "Create budget line"}
        </Button>
      </div>
    </form>
  );
}
