"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import {
  createPR,
  findSimilarPRs,
  suggestPRFromText,
  type PRFormState,
  type DuplicateCheckState,
  type SimilarPR,
  type SuggestState,
} from "../actions";
import { Button } from "@/components/ui/button";
import { NumberInput, SelectInput, TextArea, TextInput } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import type { Category, Client, Priority } from "@/lib/database.types";

const initial: PRFormState = { error: null, ok: null };
const initialDuplicates: DuplicateCheckState = { error: null, matches: null };
const initialSuggestion: SuggestState = { error: null, suggestion: null };

interface ItemRow {
  id: number;
  description?: string;
  qty?: number;
  unit?: string;
}

export function PRForm({
  categories,
  clients,
  aiAvailable,
}: {
  categories: Category[];
  clients: Client[];
  aiAvailable: boolean;
}) {
  const [state, action, pending] = useActionState(createPR, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const [rows, setRows] = useState<ItemRow[]>([{ id: 1 }]);
  let nextId = rows.length + 1;

  const [categoryId, setCategoryId] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");

  const [duplicates, setDuplicates] = useState<DuplicateCheckState>(initialDuplicates);
  const [checkingDuplicates, startDuplicateCheck] = useTransition();

  const [suggestion, setSuggestion] = useState<SuggestState>(initialSuggestion);
  const [suggesting, startSuggest] = useTransition();

  function checkDuplicates() {
    if (!formRef.current) return;
    const form = new FormData(formRef.current);
    startDuplicateCheck(async () => {
      const result = await findSimilarPRs(initialDuplicates, form);
      setDuplicates(result);
    });
  }

  function suggestDetails() {
    if (!formRef.current) return;
    const form = new FormData(formRef.current);
    startSuggest(async () => {
      const result = await suggestPRFromText(initialSuggestion, form);
      setSuggestion(result);
    });
  }

  function applySuggestion(s: NonNullable<SuggestState["suggestion"]>) {
    if (s.category_name) {
      const match = categories.find((c) => c.name.toLowerCase() === s.category_name!.toLowerCase());
      if (match) setCategoryId(match.id);
    }
    if (s.priority) setPriority(s.priority);
    if (s.items.length > 0) {
      setRows(s.items.map((item, i) => ({ id: i + 1, description: item.description, qty: item.qty, unit: item.unit })));
    }
    setSuggestion(initialSuggestion);
  }

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <TextInput label="Title" name="title" required placeholder="e.g. Office laptops — Finance team" />
          <button
            type="button"
            onClick={checkDuplicates}
            disabled={checkingDuplicates}
            className="self-start text-xs font-semibold text-brand hover:underline disabled:opacity-50"
          >
            {checkingDuplicates ? "Checking…" : "Check for similar requests"}
          </button>
        </div>
        <SelectInput
          label="Category"
          name="category_id"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">Not set</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectInput>
      </div>

      {duplicates.error && <p className="text-xs text-critical">{duplicates.error}</p>}
      {duplicates.matches && (
        <div className="rounded-lg border border-line bg-surface-sunk px-3 py-2.5">
          {duplicates.matches.length === 0 ? (
            <p className="text-xs text-ink-faint">No similar requests found — looks new.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-ink">Similar requests already on file:</p>
              {duplicates.matches.map((m: SimilarPR) => (
                <Link
                  key={m.pr_id}
                  href={`/app/cases/${m.case_id}`}
                  target="_blank"
                  className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-surface"
                >
                  <span className="truncate text-ink-soft">
                    {m.case_number} · {m.title}
                  </span>
                  <span className="shrink-0 text-ink-faint">{Math.round(m.similarity * 100)}% alike</span>
                </Link>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setDuplicates(initialDuplicates)}
            className="mt-1.5 text-xs font-semibold text-ink-faint hover:text-ink"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <SelectInput label="Client" name="client_id" hint="Optional">
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
        <TextInput label="Required by" name="required_by" type="date" hint="Optional" />
      </div>

      <TextArea label="Justification" name="justification" rows={2} hint="Optional — why this is needed" />

      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-line p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ink">Describe what you need (optional)</p>
          {aiAvailable ? (
            <button
              type="button"
              onClick={suggestDetails}
              disabled={suggesting}
              className="flex shrink-0 items-center gap-1 text-xs font-semibold text-brand hover:underline disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {suggesting ? "Reading…" : "Suggest details with AI"}
            </button>
          ) : (
            <span className="shrink-0 text-xs text-ink-faint">AI suggestions not configured</span>
          )}
        </div>
        <TextArea
          label=""
          name="free_text"
          rows={2}
          placeholder="e.g. Need 5 laptops for the new finance hires, urgent, roughly KES 80,000 each"
        />
        {suggestion.error && <p className="text-xs text-critical">{suggestion.error}</p>}
        {suggestion.suggestion && (
          <div className="flex flex-col gap-2 rounded-lg border border-brand/25 bg-brand-tint px-3 py-2.5">
            <p className="text-xs text-ink-soft">{suggestion.suggestion.reasoning || "Suggested from the text above — review before applying."}</p>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {suggestion.suggestion.category_name && <Badge tone="brand">{suggestion.suggestion.category_name}</Badge>}
              {suggestion.suggestion.priority && <Badge tone="neutral">{suggestion.suggestion.priority}</Badge>}
              <span className="text-ink-faint">{suggestion.suggestion.items.length} item(s) found</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => applySuggestion(suggestion.suggestion!)}
                className="text-xs font-semibold text-brand hover:underline"
              >
                Apply to form
              </button>
              <button
                type="button"
                onClick={() => setSuggestion(initialSuggestion)}
                className="text-xs font-semibold text-ink-faint hover:text-ink"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>

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
              <TextInput
                label={i === 0 ? "Description" : ""}
                name="item_description"
                placeholder="e.g. Laptop, 14-inch"
                defaultValue={row.description ?? ""}
              />
            </div>
            <div className="col-span-4 sm:col-span-2">
              <NumberInput label={i === 0 ? "Qty" : ""} name="item_qty" min={0} decimals defaultValue={row.qty ?? 1} />
            </div>
            <div className="col-span-4 sm:col-span-2">
              <TextInput label={i === 0 ? "Unit" : ""} name="item_unit" placeholder="pcs" defaultValue={row.unit ?? ""} />
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
