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
  title?: string | null;
  status: string;
  when: string | null;
  imageDataUrl?: string | null;
}

export interface DocumentExport {
  tenantName: string;
  tenantAddress?: string | null;
  tenantPhone?: string | null;
  tenantEmail?: string | null;
  tenantRegistrationNumber?: string | null;
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
  signatureNote?: string;
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

  const brandingLine = [d.tenantAddress, d.tenantPhone, d.tenantEmail, d.tenantRegistrationNumber]
    .filter((v): v is string => Boolean(v))
    .join("  ·  ");
  if (brandingLine) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...FAINT);
    doc.text(latin(brandingLine), margin, y + 13);
  }
  y += brandingLine ? 23 : 18;

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

  // ── Signatures — a classic side-by-side block per party (this side vs.
  //    the other side), not a status table, so it reads like a real
  //    signature page: role, signature line, typed name, title, date. ──
  if (d.signatures && d.signatures.length > 0) {
    const gap = 24;
    const colW = (usable - gap) / 2;
    const imgH = 54;
    const blockH = 118;
    const rows = Math.ceil(d.signatures.length / 2);
    ensureSpace(24);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...INK);
    doc.text("Signing parties", margin, y);
    y += 18;

    for (let row = 0; row < rows; row++) {
      ensureSpace(blockH + 12);
      for (let col = 0; col < 2; col++) {
        const s = d.signatures[row * 2 + col];
        if (!s) continue;
        const x = margin + col * (colW + gap);
        let by = y;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(...FAINT);
        doc.text(latin(s.role.toUpperCase()), x, by);
        by += 12;

        doc.setDrawColor(...FAINT);
        doc.setLineWidth(0.5);
        doc.rect(x, by, colW, imgH);
        if (s.imageDataUrl) {
          const format = s.imageDataUrl.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
          try {
            doc.addImage(s.imageDataUrl, format, x + 4, by + 4, colW - 8, imgH - 8, undefined, "FAST");
          } catch {
            // A malformed data URL should never take down the whole export.
          }
        } else {
          doc.setFont("helvetica", "italic");
          doc.setFontSize(8);
          doc.setTextColor(...FAINT);
          doc.text("Not yet signed", x + 6, by + imgH / 2 + 3);
        }
        by += imgH + 14;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(...INK);
        doc.text(latin(s.name), x, by);
        by += 13;

        if (s.title) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8.5);
          doc.setTextColor(...FAINT);
          doc.text(latin(s.title), x, by);
          by += 12;
        }

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...FAINT);
        doc.text(latin(s.status === "signed" && s.when ? `Signed ${s.when}` : s.status), x, by);
      }
      y += blockH;
    }
    y += 6;
  }

  if (d.signatureNote) {
    ensureSpace(20);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(...FAINT);
    const lines: string[] = doc.splitTextToSize(latin(d.signatureNote), usable);
    for (const line of lines) {
      ensureSpace(12);
      doc.text(line, margin, y);
      y += 11;
    }
    y += 8;
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
