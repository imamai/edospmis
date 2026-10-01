"use client";

import { useActionState } from "react";
import { Plus } from "lucide-react";
import { addCatalogueItem, type CatalogueFormState } from "./actions";
import { Button } from "@/components/ui/button";
import { NumberInput, TextInput } from "@/components/ui/field";

const initial: CatalogueFormState = { error: null, ok: null };

export function CatalogueItemForm() {
  const [state, action, pending] = useActionState(addCatalogueItem, initial);

  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-12">
        <div className="sm:col-span-3">
          <TextInput label="Code" name="code" placeholder="e.g. LAP-14" />
        </div>
        <div className="sm:col-span-5">
          <TextInput
            label="Description"
            name="description"
            required
            placeholder="e.g. Laptop, 14-inch, 16GB RAM"
          />
        </div>
        <div className="sm:col-span-2">
          <TextInput label="Unit" name="unit" placeholder="pcs" />
        </div>
        <div className="sm:col-span-2">
          <NumberInput
            label="Indicative cost"
            name="indicative_cost"
            min={0}
            decimals
          />
        </div>
      </div>

      <p className="text-xs text-ink-faint">
        The indicative cost pre-fills a requester&rsquo;s estimate. It is not a
        quoted price and commits nobody — the price that counts comes from a
        supplier quotation.
      </p>

      {state.error && (
        <p
          role="alert"
          className="rounded-lg border border-critical/25 bg-critical-soft px-3 py-2 text-sm text-critical"
        >
          {state.error}
        </p>
      )}
      {state.ok && (
        <p
          role="status"
          className="rounded-lg border border-good/25 bg-good-soft px-3 py-2 text-sm text-good"
        >
          {state.ok}
        </p>
      )}

      <div>
        <Button type="submit" busy={pending}>
          <Plus className="mr-1.5 h-4 w-4" />
          {pending ? "Saving" : "Add to catalogue"}
        </Button>
      </div>
    </form>
  );
}
