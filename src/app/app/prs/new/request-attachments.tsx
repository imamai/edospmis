"use client";

import { useRef } from "react";
import { Paperclip, Trash2, Upload } from "lucide-react";
import { SelectInput, TextInput } from "@/components/ui/field";
import {
  ATTACHMENT_KIND_LABEL,
  type AttachmentKind,
} from "@/lib/attachment-kinds";

/**
 * Attaching evidence while the request is still being written.
 *
 * It used to be on the case page only, which meant filling the form, saving a
 * draft, landing somewhere else and then remembering to come back with the
 * price list. Most people did not come back. Keeping it on the same form is
 * the whole point: one screen, everything the approver will need.
 *
 * The files are held here, unsent, until the request is saved. There is
 * nowhere to put them before that — an attachment belongs to a case, and the
 * case does not exist yet. The form uploads them the moment it has an id.
 */

export interface PendingAttachment {
  /** Local only — the row's real id comes from the server after upload. */
  key: string;
  file: File;
  kind: AttachmentKind;
  note: string;
}

const MAX_BYTES = 15 * 1024 * 1024;

export const ACCEPTED_ATTACHMENTS = [
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

export function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function RequestAttachments({
  files,
  onChange,
  onError,
  disabled,
}: {
  files: PendingAttachment[];
  onChange: (next: PendingAttachment[]) => void;
  onError: (message: string | null) => void;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function add(file: File) {
    onError(null);
    if (file.size > MAX_BYTES) {
      onError(
        `Keep files under ${MAX_BYTES / (1024 * 1024)}MB. ${file.name} is ${sizeLabel(file.size)}.`,
      );
      return;
    }
    if (file.type && !ACCEPTED_ATTACHMENTS.includes(file.type)) {
      onError("Attach a PDF, an image, a spreadsheet or a document.");
      return;
    }
    onChange([
      ...files,
      { key: crypto.randomUUID(), file, kind: "price_list", note: "" },
    ]);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Paperclip className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
          Attachments
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline disabled:opacity-50"
        >
          <Upload className="h-3.5 w-3.5" />
          Add a file
        </button>
      </div>

      <p className="text-xs text-ink-faint">
        A price list, a flyer, a quote you were given — whatever you based this
        on. It goes forward with the request, so the approver sees what you saw.
        Sent when you save.
      </p>

      <input
        ref={inputRef}
        id="request-attachment-file"
        type="file"
        className="hidden"
        accept={ACCEPTED_ATTACHMENTS.join(",")}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) add(file);
          // Cleared so choosing the same file twice still registers.
          e.target.value = "";
        }}
      />

      {files.length > 0 && (
        <ul className="flex flex-col gap-2">
          {files.map((item) => (
            <li
              key={item.key}
              className="grid grid-cols-12 items-end gap-2 rounded-lg border border-line p-2.5"
            >
              <div className="col-span-12 sm:col-span-4">
                <p className="truncate text-xs font-medium text-ink">
                  {item.file.name}
                </p>
                <p className="text-[11px] text-ink-faint">
                  {sizeLabel(item.file.size)}
                </p>
              </div>
              <div className="col-span-6 sm:col-span-3">
                <SelectInput
                  label="What is it"
                  name={`attachment_kind_${item.key}`}
                  value={item.kind}
                  disabled={disabled}
                  onChange={(e) =>
                    onChange(
                      files.map((f) =>
                        f.key === item.key
                          ? { ...f, kind: e.target.value as AttachmentKind }
                          : f,
                      ),
                    )
                  }
                >
                  {(Object.keys(ATTACHMENT_KIND_LABEL) as AttachmentKind[]).map(
                    (k) => (
                      <option key={k} value={k}>
                        {ATTACHMENT_KIND_LABEL[k]}
                      </option>
                    ),
                  )}
                </SelectInput>
              </div>
              <div className="col-span-5 sm:col-span-4">
                <TextInput
                  label="Note"
                  name={`attachment_note_${item.key}`}
                  value={item.note}
                  disabled={disabled}
                  placeholder="e.g. quoted by Text Book Centre"
                  onChange={(e) =>
                    onChange(
                      files.map((f) =>
                        f.key === item.key ? { ...f, note: e.target.value } : f,
                      ),
                    )
                  }
                />
              </div>
              <div className="col-span-1 flex justify-end">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    onChange(files.filter((f) => f.key !== item.key))
                  }
                  aria-label={`Remove ${item.file.name}`}
                  className="rounded-md p-2 text-ink-faint hover:bg-surface-sunk hover:text-critical disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
