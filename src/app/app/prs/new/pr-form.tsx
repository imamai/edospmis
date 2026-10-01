"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Boxes, Plus, Sparkles, Trash2 } from "lucide-react";
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
import {
  NumberInput,
  SelectInput,
  TextArea,
  TextInput,
} from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { PlacementPicker } from "@/components/app/placement-picker";
import { BudgetField } from "./budget-field";
import { CataloguePicker, type PickedItem } from "./catalogue-picker";
import {
  RequestAttachments,
  type PendingAttachment,
} from "./request-attachments";
import { recordAttachment } from "@/app/app/cases/[id]/attachment-actions";
import { createClient } from "@/lib/supabase/client";
import { ATTACHMENT_BUCKET } from "@/lib/attachment-kinds";
import type { BudgetChoice } from "@/lib/data/budgets";
import type {
  Category,
  Client,
  Placement,
  PlacementOptions,
  Priority,
} from "@/lib/database.types";

const initial: PRFormState = { error: null, ok: null };
const initialDuplicates: DuplicateCheckState = { error: null, matches: null };
const initialSuggestion: SuggestState = { error: null, suggestion: null };

interface ItemRow {
  id: number;
  description?: string;
  qty?: number;
  unit?: string;
  /** In whole currency units. Pre-filled from the catalogue's indicative cost. */
  cost?: number;
  /** The catalogue row this line came from, or undefined where it was typed. */
  catalogueItemId?: string;
}

export function PRForm({
  categories,
  clients,
  budgets,
  placementOptions,
  myPlacement,
  aiAvailable,
  tenantId,
}: {
  categories: Category[];
  clients: Client[];
  budgets: BudgetChoice[];
  placementOptions: PlacementOptions;
  /** Defaulted from the requester's own placement — most requests are for their own department. */
  myPlacement: Placement | null;
  aiAvailable: boolean;
  /** Needed to build the storage path the attachments go to. */
  tenantId: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<PRFormState>(initial);
  const [pending, startSave] = useTransition();
  const [files, setFiles] = useState<PendingAttachment[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [rows, setRows] = useState<ItemRow[]>([{ id: 1 }]);
  /**
   * A counter that only ever goes up.
   *
   * The item inputs are uncontrolled and keyed by row id, so an id that comes
   * round again means React reuses the existing DOM node and the row's new
   * `defaultValue` is never applied — the field silently keeps what was in it.
   * Deriving the next id from the row count did exactly that, both after a
   * deletion and whenever the rows were refilled.
   */
  const nextRowId = useRef(2);
  const takeRowId = () => nextRowId.current++;
  const [catalogueOpen, setCatalogueOpen] = useState(false);

  const [categoryId, setCategoryId] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [estimatedCents, setEstimatedCents] = useState(0);

  /**
   * The running total of the item lines, so the budget balance moves while
   * somebody is still typing rather than after an approver bounces it back.
   *
   * Read off the DOM on input rather than by making every quantity and cost a
   * controlled field: the rows are added and removed dynamically, and turning
   * them into state would rebuild the whole item editor to show one number.
   */
  function recalcEstimate() {
    const form = formRef.current;
    if (!form) return;
    const qtys = Array.from(
      form.querySelectorAll<HTMLInputElement>('input[name="item_qty"]'),
    );
    const costs = Array.from(
      form.querySelectorAll<HTMLInputElement>('input[name="item_cost"]'),
    );
    let total = 0;
    qtys.forEach((qtyInput, i) => {
      const qty = Number(qtyInput.value);
      const cost = Number(costs[i]?.value);
      if (
        !Number.isFinite(qty) ||
        qty <= 0 ||
        !Number.isFinite(cost) ||
        cost <= 0
      )
        return;
      total += Math.round(qty * cost * 100);
    });
    setEstimatedCents(total);
  }

  const [duplicates, setDuplicates] =
    useState<DuplicateCheckState>(initialDuplicates);
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
      const match = categories.find(
        (c) => c.name.toLowerCase() === s.category_name!.toLowerCase(),
      );
      if (match) setCategoryId(match.id);
    }
    if (s.priority) setPriority(s.priority);
    if (s.items.length > 0) {
      setRows(
        s.items.map((item) => ({
          id: takeRowId(),
          description: item.description,
          qty: item.qty,
          unit: item.unit,
        })),
      );
    }
    setSuggestion(initialSuggestion);
  }

  /**
   * Catalogue lines, appended to what is already there.
   *
   * Appended rather than replacing, because somebody may have typed a line
   * that is not in the catalogue and losing it would be the worst possible
   * reward for using this. The one exception is a single untouched empty row,
   * which is the form's starting state and not anybody's work.
   */
  function addFromCatalogue(picked: PickedItem[]) {
    if (picked.length === 0) return;
    const fresh: ItemRow[] = picked.map((item) => ({
      id: takeRowId(),
      description: item.description,
      qty: item.qty,
      unit: item.unit,
      cost: item.cost ?? undefined,
      catalogueItemId: item.catalogueItemId,
    }));
    setRows((current) => {
      const blank =
        current.length === 1 &&
        !current[0].description &&
        !current[0].catalogueItemId;
      return blank ? fresh : [...current, ...fresh];
    });
    // The estimate is read off the DOM, so it can only be recalculated once
    // the new rows have actually rendered.
    window.setTimeout(recalcEstimate, 0);
  }

  /**
   * Save the request, then send the files it came with.
   *
   * In that order because an attachment belongs to a case, and the case does
   * not exist until the request is saved — which is also why `createPR`
   * returns an id rather than redirecting: a server redirect ended the page
   * before anything could be uploaded.
   *
   * If a file fails after the request is saved, the request still exists and
   * must not be thrown away. The failure is named, and the page stays put
   * with a way through to the case, where it can be attached again.
   */
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setState(initial);
    setProgress(null);

    startSave(async () => {
      const result = await createPR(initial, data);
      if (result.error || !result.caseId) {
        setState(result);
        return;
      }
      const caseId = result.caseId;

      const failed: string[] = [];
      const supabase = createClient();

      for (let i = 0; i < files.length; i++) {
        const item = files[i];
        setProgress(`Saved. Sending attachment ${i + 1} of ${files.length}…`);

        const ext = item.file.name.includes(".")
          ? item.file.name.split(".").pop()!.slice(0, 8)
          : "bin";
        const path = `${tenantId}/${caseId}/${crypto.randomUUID()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from(ATTACHMENT_BUCKET)
          .upload(path, item.file, {
            contentType: item.file.type || "application/octet-stream",
          });
        if (uploadError) {
          failed.push(item.file.name);
          continue;
        }

        const recorded = await recordAttachment({
          caseId,
          storagePath: path,
          filename: item.file.name,
          contentType: item.file.type || null,
          byteSize: item.file.size,
          kind: item.kind,
          note: item.note.trim() || null,
        });
        if (recorded.error) {
          // Uploaded but unreferenced — removed rather than left as something
          // the workspace pays for and nobody can see.
          await supabase.storage.from(ATTACHMENT_BUCKET).remove([path]);
          failed.push(item.file.name);
        }
      }

      setProgress(null);

      if (failed.length > 0) {
        setState({
          error: `The request was saved, but ${failed.join(", ")} could not be attached. Open the request and try again.`,
          ok: null,
          caseId,
        });
        return;
      }

      router.push(`/app/cases/${caseId}`);
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={save}
      onInput={recalcEstimate}
      className="flex flex-col gap-5"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <TextInput
            label="Title"
            name="title"
            required
            placeholder="e.g. Office laptops — Finance team"
          />
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

      {duplicates.error && (
        <p className="text-xs text-critical">{duplicates.error}</p>
      )}
      {duplicates.matches && (
        <div className="rounded-lg border border-line bg-surface-sunk px-3 py-2.5">
          {duplicates.matches.length === 0 ? (
            <p className="text-xs text-ink-faint">
              No similar requests found — looks new.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-ink">
                Similar requests already on file:
              </p>
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
                  <span className="shrink-0 text-ink-faint">
                    {Math.round(m.similarity * 100)}% alike
                  </span>
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

      <div className="rounded-lg border border-line bg-surface-sunk p-3.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
          Who is asking
        </p>
        <p className="mt-0.5 mb-3 text-xs text-ink-faint">
          Defaulted to where you sit. Change it if you are raising this on
          behalf of another part of the organisation — every departmental report
          reads from this.
        </p>
        <PlacementPicker options={placementOptions} value={myPlacement} />
      </div>

      <BudgetField budgets={budgets} estimatedCents={estimatedCents} />

      <div className="grid gap-4 sm:grid-cols-3">
        <SelectInput
          label="Client"
          name="client_id"
          hint="Who this is being procured for — optional"
        >
          <option value="">Not set</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectInput>
        <SelectInput
          label="Priority"
          name="priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
        >
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </SelectInput>
        <TextInput
          label="Required by"
          name="required_by"
          type="date"
          hint="Optional"
        />
      </div>

      <TextArea
        label="Justification"
        name="justification"
        rows={2}
        hint="Optional — why this is needed"
      />

      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-line p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ink">
            Describe what you need (optional)
          </p>
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
            <span className="shrink-0 text-xs text-ink-faint">
              AI suggestions not configured
            </span>
          )}
        </div>
        <TextArea
          label=""
          name="free_text"
          rows={2}
          placeholder="e.g. Need 5 laptops for the new finance hires, urgent, roughly KES 80,000 each"
        />
        {suggestion.error && (
          <p className="text-xs text-critical">{suggestion.error}</p>
        )}
        {suggestion.suggestion && (
          <div className="flex flex-col gap-2 rounded-lg border border-brand/25 bg-brand-tint px-3 py-2.5">
            <p className="text-xs text-ink-soft">
              {suggestion.suggestion.reasoning ||
                "Suggested from the text above — review before applying."}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {suggestion.suggestion.category_name && (
                <Badge tone="brand">
                  {suggestion.suggestion.category_name}
                </Badge>
              )}
              {suggestion.suggestion.priority && (
                <Badge tone="neutral">{suggestion.suggestion.priority}</Badge>
              )}
              <span className="text-ink-faint">
                {suggestion.suggestion.items.length} item(s) found
              </span>
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
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setCatalogueOpen(true)}
              className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
            >
              <Boxes className="h-3.5 w-3.5" />
              Add from catalogue
            </button>
            <button
              type="button"
              onClick={() => setRows((r) => [...r, { id: takeRowId() }])}
              className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
            >
              <Plus className="h-3.5 w-3.5" />
              Add item
            </button>
          </div>
        </div>
        {rows.map((row, i) => (
          <div
            key={row.id}
            className="grid grid-cols-12 items-end gap-2 rounded-lg border border-line p-3"
          >
            <div className="col-span-12 sm:col-span-5">
              <TextInput
                label={i === 0 ? "Description" : ""}
                name="item_description"
                placeholder="e.g. Laptop, 14-inch"
                defaultValue={row.description ?? ""}
              />
            </div>
            <div className="col-span-4 sm:col-span-2">
              <NumberInput
                label={i === 0 ? "Qty" : ""}
                name="item_qty"
                min={0}
                decimals
                defaultValue={row.qty ?? 1}
              />
            </div>
            <div className="col-span-4 sm:col-span-2">
              <TextInput
                label={i === 0 ? "Unit" : ""}
                name="item_unit"
                placeholder="pcs"
                defaultValue={row.unit ?? ""}
              />
            </div>
            <div className="col-span-3 sm:col-span-2">
              <NumberInput
                label={i === 0 ? "Cost each (KES)" : ""}
                name="item_cost"
                min={0}
                decimals
                defaultValue={row.cost ?? ""}
              />
            </div>
            {/* Positional, read back alongside the item fields, so spend can be
                reported by catalogue item without re-matching free text. Empty
                for a line somebody typed, which stays entirely allowed. */}
            <input
              type="hidden"
              name="item_catalogue_id"
              value={row.catalogueItemId ?? ""}
            />
            <div className="col-span-1 flex justify-end">
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setRows((r) => r.filter((x) => x.id !== row.id))
                  }
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

      <RequestAttachments
        files={files}
        onChange={setFiles}
        onError={(message) => setState({ error: message, ok: null })}
        disabled={pending}
      />

      {state.error && (
        <div className="rounded-lg border border-critical/25 bg-critical-soft px-3 py-2 text-sm text-critical">
          <p role="alert">{state.error}</p>
          {state.caseId && (
            <Link
              href={`/app/cases/${state.caseId}`}
              className="mt-1 inline-block font-semibold underline"
            >
              Open the request
            </Link>
          )}
        </div>
      )}

      {progress && (
        <p role="status" className="text-xs text-ink-faint">
          {progress}
        </p>
      )}

      {/* Mounted only while open, so each opening starts from fresh state and
          last request's selection cannot leak into this one. */}
      {catalogueOpen && (
        <CataloguePicker
          open
          onClose={() => setCatalogueOpen(false)}
          onPick={addFromCatalogue}
        />
      )}

      <div>
        <Button type="submit" busy={pending}>
          {pending ? "Saving" : "Save as draft"}
        </Button>
        <p className="mt-2 text-xs text-ink-faint">
          Saved as a draft first — you&rsquo;ll review and submit it for
          approval from the case page.
        </p>
      </div>
    </form>
  );
}
