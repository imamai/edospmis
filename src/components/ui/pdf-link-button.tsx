"use client";

import { useRef, useState } from "react";
import { Download, Printer } from "lucide-react";
import { Modal } from "./modal";

/**
 * Opens a document — purchase order, GRN, invoice, contract, or a report's own
 * PDF — as a pop-up over the app: the document itself, with the page it was
 * opened from still behind it.
 *
 * It is deliberately *one* window. This used to be a padded dialog card with a
 * bordered, rounded frame inside it above a second row of buttons, so the
 * browser's PDF viewer (its own frame, its own toolbar) appeared as a window
 * nested in a window and offered print and save twice. Now the dialog's header
 * is the document's toolbar and the page fills the frame edge to edge.
 *
 * The frame points straight at the export route, which sends
 * `Content-Disposition: inline` (lib/export/document.ts, lib/export/table.ts)
 * — as an attachment the browser would download the file and leave an empty
 * frame here — and answers a refusal with a readable sentence rather than JSON
 * rendered where the document should be (`documentError`).
 */
const toolbarButton =
  "flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:border-brand hover:text-brand";

export function PdfLinkButton({
  href,
  title,
  filename,
  children,
  className,
}: {
  href: string;
  title: string;
  filename: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  function print() {
    try {
      const frame = frameRef.current?.contentWindow;
      if (!frame) throw new Error("The document is still loading.");
      frame.focus();
      frame.print();
    } catch {
      // A few browsers refuse to print a PDF through a frame. Opening the
      // document on its own always prints, so the button never dead-ends.
      window.open(href, "_blank", "noopener");
    }
  }

  // Without an extension the browser saves "INV-0007" with no file type, and
  // the operating system then has nothing to open it with.
  const downloadName = /\.pdf$/i.test(filename) ? filename : `${filename}.pdf`;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        size="full"
        flush
        headerActions={
          <>
            <button type="button" onClick={print} className={toolbarButton}>
              <Printer className="h-3.5 w-3.5" aria-hidden="true" />
              Print
            </button>
            <a href={href} download={downloadName} className={toolbarButton}>
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Save
            </a>
          </>
        }
      >
        <iframe ref={frameRef} src={href} title={title} className="h-full w-full border-0 bg-surface-sunk" />
      </Modal>
    </>
  );
}
