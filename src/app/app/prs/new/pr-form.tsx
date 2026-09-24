"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { createPR, type PRFormState } from "../actions";
import { Button } from "@/components/ui/button";
import { NumberInput, SelectInput, TextArea, TextInput } from "@/components/ui/field";
import type { Category, Client } from "@/lib/database.types";

const initial: PRFormState = { error: null, ok: null };

interface ItemRow {
  id: number;
}

export function PRForm({ categories, clients }: { categories: Category[]; clients: Client[] }) {
  const [state, action, pending] = useActionState(createPR, initial);
  const [rows, setRows] = useState<ItemRow[]>([{ id: 1 }]);
  let nextId = rows.length + 1;

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput label="Title" name="title" required placeholder="e.g. Office laptops — Finance team" />
        <SelectInput label="Category" name="category_id">
          <option value="">Not set</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectInput>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SelectInput label="Client" name="client_id" hint="Optional">
          <option value="">Not set</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectInput>
        <SelectInput label="Priority" name="priority" defaultValue="normal">
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </SelectInput>
        <TextInput label="Required by" name="required_by" type="date" hint="Optional" />
      </div>

      <TextArea label="Justification" name="justification" rows={2} hint="Optional — why this is needed" />

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-ink">Items</p>
          <button
            type="button"
            onClick={() => setRows((r) => [...r, { id: nextId++ }])}
            className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
          >
            <Plus className="h-3.5 w-3.5" />
            Add item
          </button>
        </div>
        {rows.map((row, i) => (
          <div key={row.id} className="grid grid-cols-12 items-end gap-2 rounded-lg border border-line p-3">
            <div className="col-span-12 sm:col-span-5">
              <TextInput label={i === 0 ? "Description" : ""} name="item_description" placeholder="e.g. Laptop, 14-inch" />
            </div>
            <div className="col-span-4 sm:col-span-2">
              <NumberInput label={i === 0 ? "Qty" : ""} name="item_qty" min={0} decimals defaultValue={1} />
            </div>
            <div className="col-span-4 sm:col-span-2">
              <TextInput label={i === 0 ? "Unit" : ""} name="item_unit" placeholder="pcs" />
            </div>
            <div className="col-span-3 sm:col-span-2">
              <NumberInput label={i === 0 ? "Cost each (KES)" : ""} name="item_cost" min={0} decimals />
            </div>
            <div className="col-span-1 flex justify-end">
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => setRows((r) => r.filter((x) => x.id !== row.id))}
                  aria-label="Remove item"
                  className="rounded-md p-2 text-ink-faint hover:bg-surface-sunk hover:text-critical"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {state.error && (
        <p role="alert" className="rounded-lg border border-critical/25 bg-critical-soft px-3 py-2 text-sm text-critical">
          {state.error}
        </p>
      )}

      <div>
        <Button type="submit" busy={pending}>
          {pending ? "Saving" : "Save as draft"}
        </Button>
        <p className="mt-2 text-xs text-ink-faint">
          Saved as a draft first — you&rsquo;ll review and submit it for approval from the case page.
        </p>
      </div>
    </form>
  );
}
