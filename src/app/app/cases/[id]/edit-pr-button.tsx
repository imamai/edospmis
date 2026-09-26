"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { updatePR, type PRFormState } from "../../prs/actions";
import { Button } from "@/components/ui/button";
import { Modal, ModalFormActions } from "@/components/ui/modal";
import { NumberInput, SelectInput, TextArea, TextInput } from "@/components/ui/field";
import type { Category, Client, PR, Priority } from "@/lib/database.types";

const initial: PRFormState = { error: null, ok: null };

interface ItemRow {
  id: number;
  description: string;
  qty: number;
  unit: string;
  unitCost: number;
}

/**
 * The correction path a returned PR was always missing (ARCHITECTURE.md's
 * draft/returned split): edospmis_decide_approval resets pr.status to
 * 'draft' and SubmitButton reappears, but nothing has ever let the
 * requester actually change what triggered the return — only resubmit the
 * same content. Shown wherever SubmitButton is (`canSubmit` on the case
 * page), not only when returned, since a fresh draft has the identical gap.
 */
export function EditPrButton({
  caseId,
  pr,
  categories,
  clients,
}: {
  caseId: string;
  pr: PR;
  categories: Category[];
  clients: Client[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<PRFormState>(initial);
  const [pending, startTransition] = useTransition();

  const [rows, setRows] = useState<ItemRow[]>(
    pr.items.length > 0
      ? pr.items.map((i, idx) => ({ id: idx + 1, description: i.description, qty: i.qty, unit: i.unit, unitCost: i.estimated_unit_cost_cents / 100 }))
      : [{ id: 1, description: "", qty: 1, unit: "", unitCost: 0 }],
  );
  let nextId = rows.length + 1;
  const [categoryId, setCategoryId] = useState(pr.category_id ?? "");
  const [clientId, setClientId] = useState(pr.client_id ?? "");
  const [priority, setPriority] = useState<Priority>(pr.priority);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updatePR(initial, form);
      setState(result);
      if (result.ok) {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4" />
        Edit request
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Edit request" dismissible={!pending} size="lg">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <input type="hidden" name="pr_id" value={pr.id} />
          <input type="hidden" name="case_id" value={caseId} />

          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="Title" name="title" required defaultValue={pr.title} />
            <SelectInput label="Category" name="category_id" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Not set</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectInput>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <SelectInput label="Client" name="client_id" value={clientId} onChange={(e) => setClientId(e.target.value)} hint="Optional">
              <option value="">Not set</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectInput>
            <SelectInput label="Priority" name="priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </SelectInput>
            <TextInput label="Required by" name="required_by" type="date" defaultValue={pr.required_by ?? ""} hint="Optional" />
          </div>

          <TextArea label="Justification" name="justification" rows={2} defaultValue={pr.justification ?? ""} hint="Optional" />

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">Items</p>
              <button
                type="button"
                onClick={() => setRows((r) => [...r, { id: nextId++, description: "", qty: 1, unit: "", unitCost: 0 }])}
                className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
              >
                <Plus className="h-3.5 w-3.5" />
                Add item
              </button>
            </div>
            {rows.map((row, i) => (
              <div key={row.id} className="grid grid-cols-12 items-end gap-2 rounded-lg border border-line p-3">
                <div className="col-span-12 sm:col-span-5">
                  <TextInput label={i === 0 ? "Description" : ""} name="item_description" defaultValue={row.description} placeholder="e.g. Laptop, 14-inch" />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <NumberInput label={i === 0 ? "Qty" : ""} name="item_qty" min={0} decimals defaultValue={row.qty} />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <TextInput label={i === 0 ? "Unit" : ""} name="item_unit" defaultValue={row.unit} placeholder="pcs" />
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <NumberInput label={i === 0 ? "Cost each" : ""} name="item_cost" min={0} decimals defaultValue={row.unitCost} />
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

          {state.error && <p className="text-xs text-critical">{state.error}</p>}
          <ModalFormActions onCancel={() => setOpen(false)} submitLabel="Save changes" busy={pending} />
        </form>
      </Modal>
    </>
  );
}
