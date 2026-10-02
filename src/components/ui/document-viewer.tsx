"use client";

import { useState } from "react";
import { Download, ExternalLink, FileText } from "lucide-react";
import { Modal } from "@/components/ui/modal";

/**
 * Looking at a file without leaving the page.
 *
 * Every document in this app opened in a new tab: a supplier's CR12, a case
 * attachment, a tender template. That is four clicks to compare two bidders'
 * tax certificates, and it drops the person out of the case they were reading
 * — on a phone it switches app, and coming back means finding the tab again.
 * Worse, the tab opens on a signed URL, so what they see has no header, no
 * case number and nothing saying whose document it is.
 *
 * Here it opens over the page, titled, and closes back to exactly where they
 * were.
 *
 * WHAT CAN AND CANNOT BE SHOWN. A browser renders PDFs and images itself.
 * Word and Excel it cannot, at any price short of shipping a renderer or
 * posting the file to a third party — neither of which is worth it for a tax
 * certificate. Those get an honest panel with Download and Open in a new tab,
 * rather than an empty frame that looks broken.
 */

export type ViewerTarget = {
  /** The signed URL. Short-lived, so it is fetched when opening, not earlier. */
  url: string;
  filename: string;
  /** What this document is, for the dialog title. Falls back to the filename. */
  label?: string;
};

function kindOf(filename: string, url: string): "pdf" | "image" | "other" {
  const name = filename.toLowerCase();
  // The URL is checked too: a signed link can carry the real extension when
  // the stored filename has lost it.
  const probe = `${name} ${url.split("?")[0].toLowerCase()}`;
  if (probe.includes(".pdf")) return "pdf";
  if (/\.(png|jpe?g|gif|webp|avif|svg)\b/.test(probe)) return "image";
  return "other";
}

export function DocumentViewer({
  target,
  onClose,
}: {
  /** Null closes it. Mounting only while open means each file starts fresh. */
  target: ViewerTarget | null;
  onClose: () => void;
}) {
  // Which file failed, not whether one did. Derived rather than reset in an
  // effect, so opening a second document after a broken first one starts
  // clean without a render that shows the wrong thing first.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (!target) return null;

  const failed = failedUrl === target.url;
  const kind = kindOf(target.filename, target.url);
  const inline = kind !== "other" && !failed;

  return (
    <Modal
      open
      onClose={onClose}
      title={target.label ?? target.filename}
      description={target.label ? target.filename : undefined}
      size={inline ? "full" : "lg"}
      flush={inline}
      headerActions={
        <div className="flex items-center gap-1">
          <a
            href={target.url}
            download={target.filename}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-ink-soft hover:bg-surface-sunk hover:text-ink"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </a>
          <a
            href={target.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-ink-soft hover:bg-surface-sunk hover:text-ink"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            New tab
          </a>
        </div>
      }
    >
      {kind === "image" && !failed ? (
        <div className="flex h-full items-center justify-center overflow-auto bg-surface-sunk p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={target.url}
            alt={target.filename}
            onError={() => setFailedUrl(target.url)}
            className="max-h-full max-w-full object-contain"
          />
        </div>
      ) : kind === "pdf" && !failed ? (
        <iframe
          src={target.url}
          title={target.filename}
          onError={() => setFailedUrl(target.url)}
          className="h-full w-full border-0 bg-surface-sunk"
        />
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-line bg-surface-sunk px-4 py-8 text-center">
          <FileText className="h-7 w-7 text-ink-faint" aria-hidden="true" />
          <p className="text-sm font-medium text-ink">{target.filename}</p>
          <p className="max-w-sm text-xs text-ink-faint">
            {failed
              ? "This file couldn't be shown here. Download it or open it in a new tab."
              : "Word and Excel files can't be shown in the browser. Download it to read it."}
          </p>
          <a
            href={target.url}
            download={target.filename}
            className="mt-1 inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-semibold text-white hover:opacity-90"
          >
            <Download className="h-4 w-4" />
            Download
          </a>
        </div>
      )}
    </Modal>
  );
}
