"use client";

import { useRef } from "react";
import { Download, Printer } from "lucide-react";
import { Modal } from "./modal";

/**
 * Every PO/invoice "view this document" link across the app opens this,
 * instead of a plain `target="_blank"` navigation — a pop preview with
 * View (the embedded PDF itself), Download and Print, per explicit user
 * request. Relies on the export route sending Content-Disposition: inline
 * (see lib/export/document.ts) so the browser's own PDF viewer renders
 * straight into the iframe instead of trying to download it.
 */
export function PdfPreviewModal({
  open,
  onClose,
  src,
  title,
  filename,
}: {
  open: boolean;
  onClose: () => void;
  src: string;
  title: string;
  filename: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  function handlePrint() {
    iframeRef.current?.contentWindow?.focus();
    iframeRef.current?.contentWindow?.print();
  }

  return (
    <Modal open={open} onClose={onClose} title={title} size="xl">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-soft hover:border-brand hover:text-brand"
          >
            <Printer className="h-3.5 w-3.5" />
            Print
          </button>
          <a
            href={src}
            download={filename}
            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-soft hover:border-brand hover:text-brand"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </a>
        </div>
        {open && <iframe ref={iframeRef} src={src} title={title} className="h-[70vh] w-full rounded-lg border border-line" />}
      </div>
    </Modal>
  );
}
