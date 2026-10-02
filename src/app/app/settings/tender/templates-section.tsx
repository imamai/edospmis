"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  FileSignature,
  ListChecks,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DocumentViewer,
  type ViewerTarget,
} from "@/components/ui/document-viewer";
import { TextArea, TextInput } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";
import {
  addDocumentTemplate,
  addFormTemplate,
  setTemplateActive,
  templateFileUrl,
} from "./actions";
import {
  BID_BUCKET,
  type ProcurementTemplate,
  type TemplateField,
} from "@/lib/tender-types";

/**
 * The templates a bidder completes and signs back.
 *
 * Two kinds, because real practice has both. An uploaded **document** is the
 * tender file a buyer already uses — the bidder downloads it, completes it,
 * and returns a signed copy; this is what most organisations actually do. A
 * **form** is rendered as questions in the bidder's own page, which is better
 * where the answers need comparing across bidders rather than reading one PDF
 * at a time.
 *
 * The shared "Form of tender" belongs to every workspace, so it is listed but
 * not editable here.
 */

const MAX_BYTES = 15 * 1024 * 1024;

const ACCEPTED = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

type Mode = null | "document" | "form";

export function TemplatesSection({
  templates,
  tenantId,
  canEdit,
}: {
  templates: ProcurementTemplate[];
  tenantId: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [questions, setQuestions] = useState<TemplateField[]>([
    { key: "q1", label: "", type: "text", required: true },
  ]);
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);

  function reset() {
    setMode(null);
    setName("");
    setDescription("");
    setInstructions("");
    setQuestions([{ key: "q1", label: "", type: "text", required: true }]);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function uploadDocument(file: File) {
    setNotice(null);
    if (!name.trim()) {
      setNotice({
        tone: "error",
        text: "Give the template a name before choosing a file.",
      });
      return;
    }
    if (file.size > MAX_BYTES) {
      setNotice({
        tone: "error",
        text: `Keep the file under ${MAX_BYTES / (1024 * 1024)}MB.`,
      });
      return;
    }
    if (file.type && !ACCEPTED.includes(file.type)) {
      setNotice({
        tone: "error",
        text: "Upload a PDF, Word document or spreadsheet.",
      });
      return;
    }

    setBusy(true);
    const ext = file.name.includes(".")
      ? file.name.split(".").pop()!.slice(0, 8)
      : "bin";
    const path = `${tenantId}/templates/${crypto.randomUUID()}.${ext}`;
    const supabase = createClient();
    const { error } = await supabase.storage
      .from(BID_BUCKET)
      .upload(path, file, {
        contentType: file.type || "application/octet-stream",
      });
    if (error) {
      setBusy(false);
      setNotice({ tone: "error", text: error.message });
      return;
    }

    start(async () => {
      const result = await addDocumentTemplate({
        name,
        description: description.trim() || null,
        instructions: instructions.trim() || null,
        storagePath: path,
        filename: file.name,
        contentType: file.type || null,
        byteSize: file.size,
      });
      setBusy(false);
      if (result.error) {
        // Already uploaded, and now unreferenced — removed rather than left
        // as something the workspace pays for and nobody can reach.
        await supabase.storage.from(BID_BUCKET).remove([path]);
        setNotice({ tone: "error", text: result.error });
        return;
      }
      setNotice({ tone: "ok", text: result.ok ?? "Added." });
      reset();
      router.refresh();
    });
  }

  function saveForm() {
    setNotice(null);
    const cleaned = questions
      .map((q, i) => ({
        ...q,
        key: q.key.trim() || `q${i + 1}`,
        label: q.label.trim(),
      }))
      .filter((q) => q.label !== "");
    if (cleaned.length === 0) {
      setNotice({ tone: "error", text: "Give at least one question a label." });
      return;
    }
    start(async () => {
      const result = await addFormTemplate({
        name,
        description: description.trim() || null,
        instructions: instructions.trim() || null,
        fields: cleaned,
      });
      if (result.error) {
        setNotice({ tone: "error", text: result.error });
        return;
      }
      setNotice({ tone: "ok", text: result.ok ?? "Added." });
      reset();
      router.refresh();
    });
  }

  const [viewing, setViewing] = useState<ViewerTarget | null>(null);

  function openFile(id: string, filename: string, label: string) {
    start(async () => {
      const url = await templateFileUrl(id);
      if (!url) {
        setNotice({ tone: "error", text: "That file could not be opened." });
        return;
      }
      setViewing({ url, filename, label });
    });
  }

  function toggle(template: ProcurementTemplate) {
    start(async () => {
      await setTemplateActive(template.id, !template.is_active);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col divide-y divide-line">
        {templates.map((template) => (
          <li
            key={template.id}
            className="flex flex-wrap items-center justify-between gap-2 py-2.5"
          >
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm">
                <span
                  className={
                    template.is_active
                      ? "text-ink"
                      : "text-ink-faint line-through"
                  }
                >
                  {template.name}
                </span>
                <Badge tone={template.kind === "form" ? "brand" : "neutral"}>
                  {template.kind === "form"
                    ? `${template.fields.length} question${template.fields.length === 1 ? "" : "s"}`
                    : "document"}
                </Badge>
                {template.tenant_id === null && (
                  <Badge tone="neutral">standard</Badge>
                )}
              </p>
              {template.description && (
                <p className="mt-0.5 text-xs text-ink-faint">
                  {template.description}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {template.kind === "document" && template.tenant_id !== null && (
                <button
                  type="button"
                  onClick={() =>
                    openFile(
                      template.id,
                      template.filename ?? template.name,
                      template.name,
                    )
                  }
                  disabled={pending}
                  className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs font-semibold text-ink-soft hover:border-brand hover:text-brand disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  {template.filename ?? "Open"}
                </button>
              )}
              {template.tenant_id !== null && canEdit && (
                <button
                  type="button"
                  onClick={() => toggle(template)}
                  disabled={pending}
                  className="text-xs font-semibold text-brand hover:underline disabled:opacity-50"
                >
                  {template.is_active ? "Withdraw" : "Restore"}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {canEdit && mode === null && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setMode("document")}
          >
            <Upload className="mr-1.5 h-4 w-4" />
            Upload a tender document
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setMode("form")}
          >
            <ListChecks className="mr-1.5 h-4 w-4" />
            Build a form
          </Button>
        </div>
      )}

      {canEdit && mode !== null && (
        <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-sunk p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <FileSignature className="h-4 w-4 text-brand" />
            {mode === "document" ? "Upload a tender document" : "Build a form"}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput
              label="Template name"
              name="template_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Tender document — works"
            />
            <TextInput
              label="What it is"
              name="template_description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Shown beside it when you pick it for a tender"
            />
          </div>

          <TextArea
            label="Instructions to the bidder"
            name="template_instructions"
            rows={2}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder={
              mode === "document"
                ? "e.g. Complete every section, sign and stamp page 4, and upload the whole document."
                : "e.g. Answer every question. Your signature covers these answers, your documents and your prices."
            }
          />

          {mode === "document" ? (
            <>
              <input
                ref={fileRef}
                id="tender-template-file"
                type="file"
                className="hidden"
                accept={ACCEPTED.join(",")}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadDocument(file);
                }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  busy={busy || pending}
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="mr-1.5 h-4 w-4" />
                  {busy ? "Uploading" : "Choose the file"}
                </Button>
                <span className="text-xs text-ink-faint">
                  PDF, Word or spreadsheet, up to {MAX_BYTES / (1024 * 1024)}MB.
                </span>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-ink-soft">Questions</p>
              {questions.map((q, i) => (
                <div key={i} className="grid grid-cols-12 items-end gap-2">
                  <div className="col-span-12 sm:col-span-6">
                    <TextInput
                      label={i === 0 ? "Question" : ""}
                      name={`q_label_${i}`}
                      value={q.label}
                      onChange={(e) =>
                        setQuestions((qs) =>
                          qs.map((x, j) =>
                            j === i ? { ...x, label: e.target.value } : x,
                          ),
                        )
                      }
                      placeholder="e.g. Delivery lead time in days"
                    />
                  </div>
                  <div className="col-span-5 sm:col-span-3">
                    <label className="text-xs text-ink-soft">
                      {i === 0 ? "Answer type" : ""}
                      <select
                        value={q.type}
                        onChange={(e) =>
                          setQuestions((qs) =>
                            qs.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    type: e.target
                                      .value as TemplateField["type"],
                                  }
                                : x,
                            ),
                          )
                        }
                        className="mt-1 h-11 w-full rounded-lg border border-line bg-surface px-2 text-sm text-ink focus:border-brand focus:outline-none"
                      >
                        <option value="text">Short text</option>
                        <option value="textarea">Long text</option>
                        <option value="number">Number</option>
                        <option value="date">Date</option>
                      </select>
                    </label>
                  </div>
                  <label className="col-span-5 flex items-center gap-1.5 pb-3 text-xs text-ink-soft sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={q.required ?? false}
                      onChange={(e) =>
                        setQuestions((qs) =>
                          qs.map((x, j) =>
                            j === i ? { ...x, required: e.target.checked } : x,
                          ),
                        )
                      }
                      className="h-4 w-4"
                    />
                    Required
                  </label>
                  <div className="col-span-2 flex justify-end pb-2 sm:col-span-1">
                    {questions.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setQuestions((qs) => qs.filter((_, j) => j !== i))
                        }
                        aria-label="Remove question"
                        className="rounded-md p-2 text-ink-faint hover:text-critical"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setQuestions((qs) => [
                    ...qs,
                    {
                      key: `q${qs.length + 1}`,
                      label: "",
                      type: "text",
                      required: true,
                    },
                  ])
                }
                className="self-start text-xs font-semibold text-brand hover:underline"
              >
                <Plus className="mr-1 inline h-3.5 w-3.5" />
                Add a question
              </button>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {mode === "form" && (
              <Button type="button" busy={pending} onClick={saveForm}>
                Save form
              </Button>
            )}
            <button
              type="button"
              onClick={reset}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-ink-faint hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {notice && (
        <p
          role="status"
          className={
            notice.tone === "ok"
              ? "rounded-lg border border-good/25 bg-good-soft px-3 py-2 text-sm text-good"
              : "rounded-lg border border-critical/25 bg-critical-soft px-3 py-2 text-sm text-critical"
          }
        >
          {notice.text}
        </p>
      )}
      <DocumentViewer target={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
