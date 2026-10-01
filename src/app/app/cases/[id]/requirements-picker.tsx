"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
  setRfqRequirements,
  type RequirementChoice,
} from "@/app/app/procurement/requirement-actions";
import type {
  ProcurementTemplate,
  RfqRequirement,
  SupplierDocType,
} from "@/lib/tender-types";

/**
 * What this tender asks a bidder for, as a tick list.
 *
 * Two lists, because they are answered differently: a document is uploaded,
 * a template is completed and signed. Each ticked item is then either
 * required — which blocks award until it is returned — or merely asked for.
 *
 * The distinction matters and is not decoration. A works tender genuinely
 * cannot proceed without an NCA registration; an audited account is often
 * worth seeing and not worth refusing a good bid over. Marking everything
 * mandatory is how a gate stops being taken seriously.
 */
export function RequirementsPicker({
  rfqId,
  caseId,
  docTypes,
  templates,
  current,
  locked,
  canEdit,
}: {
  rfqId: string;
  caseId: string;
  docTypes: SupplierDocType[];
  templates: ProcurementTemplate[];
  current: RfqRequirement[];
  /** A bid is already in, so what the tender asks for can no longer change. */
  locked: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Keyed by the thing's own id, holding whether it is mandatory. Absent means
  // not asked for at all, which is why this is not a pair of booleans.
  const [picked, setPicked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      current.map((r) => [(r.doc_type_id ?? r.template_id)!, r.is_mandatory]),
    ),
  );

  const chosenCount = Object.keys(picked).length;
  const mandatoryCount = Object.values(picked).filter(Boolean).length;

  function toggle(id: string, defaultMandatory: boolean) {
    setPicked((prev) => {
      const next = { ...prev };
      if (id in next) delete next[id];
      else next[id] = defaultMandatory;
      return next;
    });
  }

  function save() {
    setError(null);
    const choices: RequirementChoice[] = [];
    for (const doc of docTypes) {
      if (doc.id in picked)
        choices.push({ docTypeId: doc.id, isMandatory: picked[doc.id] });
    }
    for (const tpl of templates) {
      if (tpl.id in picked)
        choices.push({ templateId: tpl.id, isMandatory: picked[tpl.id] });
    }
    start(async () => {
      const result = await setRfqRequirements(rfqId, caseId, choices);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  const summary =
    current.length === 0
      ? "Nothing beyond a price"
      : `${current.length} item${current.length === 1 ? "" : "s"}, ${current.filter((r) => r.is_mandatory).length} required`;

  return (
    <div className="rounded-lg border border-line bg-surface-sunk p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <ClipboardCheck className="h-4 w-4 text-brand" aria-hidden="true" />
            What bidders must return
          </p>
          <p className="mt-0.5 text-xs text-ink-faint">
            {summary}
            {locked && " · fixed, a bid has been submitted"}
          </p>
        </div>
        {canEdit && !locked && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => setOpen(true)}
          >
            {current.length === 0 ? "Set requirements" : "Change"}
          </Button>
        )}
        {locked && (
          <Lock className="h-4 w-4 text-ink-faint" aria-hidden="true" />
        )}
      </div>

      {current.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {current.map((r) => (
            <li
              key={r.requirement_id}
              className={
                r.is_mandatory
                  ? "rounded-md border border-brand/30 bg-brand/10 px-2 py-0.5 text-xs text-brand"
                  : "rounded-md border border-line px-2 py-0.5 text-xs text-ink-faint"
              }
            >
              {r.name}
              {!r.is_mandatory && " (optional)"}
            </li>
          ))}
        </ul>
      )}

      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title="What bidders must return"
          description="Tick what this tender needs. Required items block award until they are returned."
          size="lg"
          dismissible={!pending}
        >
          <div className="flex flex-col gap-4">
            <Section
              heading="Documents to upload"
              empty="No document types set up yet. Add them under Settings → Tender requirements."
              rows={docTypes
                .filter((d) => d.is_active)
                .map((d) => ({
                  id: d.id,
                  name: d.name,
                  description: d.description,
                  defaultMandatory: d.default_required,
                }))}
              picked={picked}
              onToggle={toggle}
              onMandatory={(id, v) => setPicked((p) => ({ ...p, [id]: v }))}
              disabled={pending}
            />

            <Section
              heading="Templates to complete and sign"
              empty="No templates set up yet. Add one under Settings → Tender requirements."
              rows={templates
                .filter((t) => t.is_active)
                .map((t) => ({
                  id: t.id,
                  name: t.name,
                  description:
                    t.description ??
                    (t.kind === "form"
                      ? `${t.fields.length} question${t.fields.length === 1 ? "" : "s"} answered in the page`
                      : "Downloaded, completed and returned signed"),
                  defaultMandatory: true,
                }))}
              picked={picked}
              onToggle={toggle}
              onMandatory={(id, v) => setPicked((p) => ({ ...p, [id]: v }))}
              disabled={pending}
            />

            {error && (
              <p
                role="alert"
                className="rounded-lg border border-critical/25 bg-critical-soft px-3 py-2 text-sm text-critical"
              >
                {error}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-ink-faint">
                {chosenCount === 0
                  ? "Nothing ticked — bidders will be asked only for a price."
                  : `${chosenCount} ticked, ${mandatoryCount} required.`}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-ink-faint hover:text-ink disabled:opacity-50"
                >
                  Cancel
                </button>
                <Button type="button" busy={pending} onClick={save}>
                  Save
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Section({
  heading,
  empty,
  rows,
  picked,
  onToggle,
  onMandatory,
  disabled,
}: {
  heading: string;
  empty: string;
  rows: {
    id: string;
    name: string;
    description: string | null;
    defaultMandatory: boolean;
  }[];
  picked: Record<string, boolean>;
  onToggle: (id: string, defaultMandatory: boolean) => void;
  onMandatory: (id: string, value: boolean) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
        {heading}
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-faint">{empty}</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {rows.map((row) => {
            const on = row.id in picked;
            return (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-3 px-3 py-2.5"
              >
                <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={disabled}
                    onChange={() => onToggle(row.id, row.defaultMandatory)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm text-ink">{row.name}</span>
                    {row.description && (
                      <span className="block text-xs text-ink-faint">
                        {row.description}
                      </span>
                    )}
                  </span>
                </label>

                {on && (
                  <div className="flex shrink-0 gap-1 rounded-md border border-line bg-surface p-0.5">
                    {([true, false] as const).map((value) => (
                      <button
                        key={String(value)}
                        type="button"
                        disabled={disabled}
                        onClick={() => onMandatory(row.id, value)}
                        className={
                          picked[row.id] === value
                            ? "rounded px-2 py-1 text-xs font-semibold text-white " +
                              (value ? "bg-brand" : "bg-ink-faint")
                            : "rounded px-2 py-1 text-xs font-semibold text-ink-faint hover:text-ink"
                        }
                      >
                        {value ? "Required" : "Optional"}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
