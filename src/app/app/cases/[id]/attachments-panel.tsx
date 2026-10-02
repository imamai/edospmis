"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, Paperclip, Trash2, Upload } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DocumentViewer,
  type ViewerTarget,
} from "@/components/ui/document-viewer";
import { SelectInput, TextInput } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";
import {
  getAttachmentUrl,
  recordAttachment,
  removeAttachment,
} from "./attachment-actions";
import {
  ATTACHMENT_KIND_LABEL,
  type AttachmentKind,
  type CaseAttachment,
} from "@/lib/attachment-kinds";
import { formatDate } from "@/lib/utils";

/**
 * What the requester already had in their hand, travelling with the request.
 *
 * A request for something unusual nearly always comes with evidence the
 * requester gathered: a supplier's price list, a flyer, a quote somebody
 * emailed them, a photograph of the failed part. Without this it arrives by
 * email to whoever they think approves things, and the approver decides
 * without it.
 *
 * The file goes from here straight to Storage — a server action is not a
 * sensible pipe for binary — and only then is it recorded. An upload that
 * succeeds but fails to record is cleaned up rather than left paid for and
 * unreachable.
 *
 * Read-only once the request is submitted. What an approver is deciding on
 * has to stop moving, or the decision cannot be read afterwards.
 */

const BUCKET = "edospmis-attachments";
const MAX_BYTES = 15 * 1024 * 1024;

const ACCEPTED = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.ms-excel",
  "text/csv",
  "text/plain",
];

function sizeLabel(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentsPanel({
  tenantId,
  caseId,
  attachments,
  canEdit,
}: {
  tenantId: string;
  caseId: string;
  attachments: CaseAttachment[];
  /** Draft, and the requester's own — the server re-checks both. */
  canEdit: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<AttachmentKind>("price_list");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File) {
    setError(null);
    if (file.size > MAX_BYTES) {
      setError(
        `Keep files under ${MAX_BYTES / (1024 * 1024)}MB. That one is ${sizeLabel(file.size)}.`,
      );
      return;
    }
    if (file.type && !ACCEPTED.includes(file.type)) {
      setError("Attach a PDF, an image, a spreadsheet or a document.");
      return;
    }

    setBusy(true);
    // A random name, keeping only the extension. The original filename is
    // kept in the row instead: a supplier's name in a storage path would be
    // readable by anyone who ever saw a signed URL.
    const ext = file.name.includes(".")
      ? file.name.split(".").pop()!.slice(0, 8)
      : "bin";
    const path = `${tenantId}/${caseId}/${crypto.randomUUID()}.${ext}`;

    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, {
        contentType: file.type || "application/octet-stream",
      });

    if (uploadError) {
      setBusy(false);
      setError(uploadError.message);
      return;
    }

    start(async () => {
      const result = await recordAttachment({
        caseId,
        storagePath: path,
        filename: file.name,
        contentType: file.type || null,
        byteSize: file.size,
        kind,
        note: note.trim() || null,
      });
      setBusy(false);
      if (result.error) {
        // The object is already up. Leaving it would be an orphan nobody can
        // see and the workspace still pays for.
        await supabase.storage.from(BUCKET).remove([path]);
        setError(result.error);
        return;
      }
      setNote("");
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    });
  }

  // Opens over the case, not in a new tab: an approver checking a quote
  // against the request should not lose the request to look at it.
  const [viewing, setViewing] = useState<ViewerTarget | null>(null);

  function open(id: string, filename: string) {
    start(async () => {
      const url = await getAttachmentUrl(id);
      if (!url) {
        setError("That file could not be opened. It may have been removed.");
        return;
      }
      setViewing({ url, filename });
    });
  }

  function remove(id: string, filename: string) {
    if (!window.confirm(`Remove ${filename}? This cannot be undone.`)) return;
    start(async () => {
      const result = await removeAttachment(caseId, id);
      if (result.error) setError(result.error);
      router.refresh();
    });
  }

  // Nothing attached and nothing can be: no empty card on an approver's screen.
  if (attachments.length === 0 && !canEdit) return null;

  return (
    <Card>
      <CardHeader
        title={`Attachments${attachments.length > 0 ? ` (${attachments.length})` : ""}`}
        icon={<Paperclip className="h-4 w-4" />}
        subtitle={
          canEdit
            ? "A price list, a flyer, a quote you were given — whatever you based this on. It goes forward with the request, so the approver sees what you saw."
            : "What the requester based this request on."
        }
      />
      <CardBody className="flex flex-col gap-4">
        {attachments.length > 0 && (
          <ul className="flex flex-col divide-y divide-line">
            {attachments.map((file) => (
              <li
                key={file.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{file.filename}</p>
                  <p className="text-xs text-ink-faint">
                    {ATTACHMENT_KIND_LABEL[file.kind]}
                    {file.byte_size ? ` · ${sizeLabel(file.byte_size)}` : ""}
                    {file.uploaded_by_name ? ` · ${file.uploaded_by_name}` : ""}
                    {` · ${formatDate(file.created_at)}`}
                  </p>
                  {file.note && (
                    <p className="mt-0.5 text-xs text-ink-soft">{file.note}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => open(file.id, file.filename)}
                    disabled={pending}
                    className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs font-semibold text-ink-soft hover:border-brand hover:text-brand disabled:opacity-50"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Open
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => remove(file.id, file.filename)}
                      disabled={pending}
                      aria-label={`Remove ${file.filename}`}
                      className="rounded-md p-1.5 text-ink-faint hover:bg-surface-sunk hover:text-critical disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {canEdit && (
          <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-sunk p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectInput
                label="What is it"
                name="attachment_kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as AttachmentKind)}
              >
                {(Object.keys(ATTACHMENT_KIND_LABEL) as AttachmentKind[]).map(
                  (k) => (
                    <option key={k} value={k}>
                      {ATTACHMENT_KIND_LABEL[k]}
                    </option>
                  ),
                )}
              </SelectInput>
              <TextInput
                label="Note"
                name="attachment_note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Quoted by Text Book Centre, valid 30 days"
              />
            </div>

            <input
              ref={inputRef}
              id="case-attachment-file"
              type="file"
              className="hidden"
              accept={ACCEPTED.join(",")}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onFile(file);
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                busy={busy || pending}
                onClick={() => inputRef.current?.click()}
              >
                <Upload className="mr-1.5 h-4 w-4" />
                {busy ? "Uploading" : "Choose a file"}
              </Button>
              <span className="text-xs text-ink-faint">
                PDF, image, spreadsheet or document, up to{" "}
                {MAX_BYTES / (1024 * 1024)}MB.
              </span>
            </div>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-critical/25 bg-critical-soft px-3 py-2 text-sm text-critical"
          >
            {error}
          </p>
        )}
        <DocumentViewer target={viewing} onClose={() => setViewing(null)} />
      </CardBody>
    </Card>
  );
}
