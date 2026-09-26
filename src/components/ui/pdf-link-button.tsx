"use client";

import { useState } from "react";
import { PdfPreviewModal } from "./pdf-preview-modal";

/**
 * Drops into any server-rendered table cell as the one client island it
 * needs — opens the shared PdfPreviewModal instead of navigating away.
 */
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
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      <PdfPreviewModal open={open} onClose={() => setOpen(false)} src={href} title={title} filename={filename} />
    </>
  );
}
