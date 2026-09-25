import "server-only";

import { jsPDF } from "jspdf";
import { latin } from "./table";

/**
 * A single business document — a PO to send a supplier, an invoice, a
 * signed contract — as opposed to ./table.ts's flat data-table exports.
 * Same jsPDF primitive, a document layout instead: letterhead, a meta grid,
 * an optional line-items table, an optional totals block, an optional body
 * of running text (a contract's terms), and an optional signatures table.
 */

export interface DocumentField {
  label: string;
  value: string;
}

export interface DocumentLineItem {
  description: string;
  qty?: string | number;
  unit?: string;
  unitCost?: string;
  total?: string;
}

export interface DocumentSignature {
  role: string;
  name: string;
  status: string;
  when: string | null;
}

export interface DocumentExport {
  tenantName: string;
  docType: string;
  docNumber: string;
  statusLabel?: string;
  fields: DocumentField[];
  itemColumns?: string[];
  items?: DocumentLineItem[];
  totals?: { label: string; value: string; strong?: boolean }[];
  bodyTitle?: string;
  bodyText?: string;
  signatures?: DocumentSignature[];
  footerNote?: string;
}

const BRAND = [29, 53, 87] as const; // #1d3557
const INK = [23, 26, 25] as const;
const FAINT = [91, 98, 93] as const;
const ROW_ALT = [244, 246, 250] as const;

function file(body: Uint8Array, filename: string): Response {
  return new Response(body as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.-]/g, "_")}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

export function documentResponse(filename: string, doc: DocumentExport): Response {
  return file(documentPdf(doc), filename);
}

export function documentPdf(d: DocumentExport): Uint8Array {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const usable = pageW - margin * 2;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - margin - 20) {
      doc.addPage();
      y = margin;
    }
  };

  // ── Letterhead ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...BRAND);
  doc.text(latin(d.tenantName), margin, y);

  doc.setFontSize(16);
  doc.setTextColor(...INK);
  doc.text(latin(d.docType.toUpperCase()), pageW - margin, y, { align: "right" });
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...FAINT);
  doc.text(latin(d.docNumber), pageW - margin, y, { align: "right" });
  if (d.statusLabel) {
    y += 14;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BRAND);
    doc.text(latin(d.statusLabel.toUpperCase()), pageW - margin, y, { align: "right" });
    doc.setFont("helvetica", "normal");
  }
  y += 10;
  doc.setDrawColor(...BRAND);
  doc.setLineWidth(1.2);
  doc.line(margin, y, pageW - margin, y);
  y += 20;

  // ── Meta field grid (two columns) ──
  const colW = usable / 2;
  d.fields.forEach((f, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = margin + col * colW;
    const rowY = y + row * 28;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...FAINT);
    doc.text(latin(f.label.toUpperCase()), x, rowY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...INK);
    doc.text(latin(f.value || "—"), x, rowY + 13);
  });
  y += Math.ceil(d.fields.length / 2) * 28 + 12;

  // ── Line items ──
  if (d.items && d.items.length > 0 && d.itemColumns) {
    const cols = d.itemColumns;
    const widths = cols.map((c, i) => (i === 0 ? usable * 0.4 : (usable * 0.6) / (cols.length - 1)));
    const rowH = 18;

    const headerRow = () => {
      doc.setFillColor(...BRAND);
      doc.rect(margin, y, usable, rowH, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(255, 255, 255);
      let x = margin;
      cols.forEach((c, i) => {
        if (i === 0) doc.text(latin(c), x + 4, y + 12);
        else doc.text(latin(c), x + widths[i] - 4, y + 12, { align: "right" });
        x += widths[i];
      });
      y += rowH;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...INK);
    };

    ensureSpace(rowH * 2);
    headerRow();

    d.items.forEach((item, i) => {
      ensureSpace(rowH);
      if (i % 2 === 1) {
        doc.setFillColor(...ROW_ALT);
        doc.rect(margin, y, usable, rowH, "F");
      }
      const cells = [item.description, String(item.qty ?? ""), item.unit ?? "", item.unitCost ?? "", item.total ?? ""].filter(
        (_, idx) => idx < cols.length,
      );
      let x = margin;
      doc.setFontSize(9);
      cells.forEach((val, idx) => {
        if (idx === 0) doc.text(latin(val ?? ""), x + 4, y + 12);
        else doc.text(latin(val ?? ""), x + widths[idx] - 4, y + 12, { align: "right" });
        x += widths[idx];
      });
      y += rowH;
    });
    y += 10;
  }

  // ── Totals ──
  if (d.totals && d.totals.length > 0) {
    ensureSpace(d.totals.length * 16 + 10);
    const totalsW = 220;
    const x0 = pageW - margin - totalsW;
    d.totals.forEach((t) => {
      doc.setFont("helvetica", t.strong ? "bold" : "normal");
      doc.setFontSize(t.strong ? 11 : 9.5);
      if (t.strong) doc.setTextColor(...BRAND);
      else doc.setTextColor(...INK);
      doc.text(latin(t.label), x0, y);
      doc.text(latin(t.value), pageW - margin, y, { align: "right" });
      y += t.strong ? 18 : 15;
    });
    y += 10;
  }

  // ── Body text (contract terms) ──
  if (d.bodyText) {
    ensureSpace(24);
    if (d.bodyTitle) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(...INK);
      doc.text(latin(d.bodyTitle), margin, y);
      y += 16;
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    const lines: string[] = doc.splitTextToSize(latin(d.bodyText), usable);
    for (const line of lines) {
      ensureSpace(14);
      doc.text(line, margin, y);
      y += 13;
    }
    y += 10;
  }

  // ── Signatures ──
  if (d.signatures && d.signatures.length > 0) {
    ensureSpace(20 + d.signatures.length * 20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...INK);
    doc.text("Signing parties", margin, y);
    y += 16;
    const widths = [usable * 0.28, usable * 0.28, usable * 0.22, usable * 0.22];
    const cols = ["Role", "Name", "Status", "Signed"];
    doc.setFillColor(...BRAND);
    doc.rect(margin, y, usable, 16, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    let x = margin;
    cols.forEach((c, i) => {
      doc.text(latin(c), x + 4, y + 11);
      x += widths[i];
    });
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK);
    d.signatures.forEach((s, i) => {
      ensureSpace(18);
      if (i % 2 === 1) {
        doc.setFillColor(...ROW_ALT);
        doc.rect(margin, y, usable, 18, "F");
      }
      let cx = margin;
      [s.role, s.name, s.status, s.when ?? "—"].forEach((val, idx) => {
        doc.setFontSize(9);
        doc.text(latin(val), cx + 4, y + 12);
        cx += widths[idx];
      });
      y += 18;
    });
    y += 10;
  }

  if (d.footerNote) {
    ensureSpace(20);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(...FAINT);
    const lines: string[] = doc.splitTextToSize(latin(d.footerNote), usable);
    for (const line of lines) {
      doc.text(line, margin, y);
      y += 10;
    }
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...FAINT);
    doc.text(`Page ${p} of ${pages}`, pageW - margin, pageH - 16, { align: "right" });
    doc.text("Generated by EDOSPMIS", margin, pageH - 16);
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
