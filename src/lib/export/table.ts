import "server-only";

import { strToU8, zipSync } from "fflate";
import { jsPDF } from "jspdf";
import { toCsv } from "./csv";

/**
 * One table, three files: CSV, Excel and PDF — the same shared engine
 * pattern edos-poa already proved out for its own exports, reused here so
 * EDOSPMIS doesn't reinvent file-format plumbing for every report.
 *
 * - CSV:   text/csv, BOM + formula-injection guard (see ./csv.ts).
 * - Excel: a real .xlsx built by hand as a zip of the OOXML parts it needs —
 *          bold frozen header row, autofilter, numbers as numbers — no
 *          dependency on a heavy spreadsheet library for this.
 * - PDF:   a printable, paginated table with the tenant name, the title,
 *          when it was made and page numbers; landscape when the table is
 *          wide enough to need it.
 */

export type ExportFormat = "csv" | "xlsx" | "pdf";
export type Cell = string | number | null | undefined;

export function formatOf(value: string | null | undefined): ExportFormat {
  const v = (value ?? "").toLowerCase();
  if (v === "xlsx" || v === "excel" || v === "xls") return "xlsx";
  if (v === "pdf") return "pdf";
  return "csv";
}

export interface TableExport {
  /** File name without extension, e.g. "invoices-2026-09-25". */
  name: string;
  /** Heading on the PDF and the Excel sheet name. */
  title: string;
  /** The tenant name, printed above the title on the PDF. */
  tenantName?: string;
  /** A line under the title — the filters or period the table covers. */
  subtitle?: string;
  header: string[];
  rows: Cell[][];
}

export function tableResponse(format: ExportFormat, table: TableExport): Response {
  const safe = table.name.replace(/[^\w.-]/g, "_");
  if (format === "xlsx") {
    return file(xlsx(table), `${safe}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }
  if (format === "pdf") {
    return file(pdf(table), `${safe}.pdf`, "application/pdf");
  }
  return file(strToU8(toCsv(table.header, table.rows)), `${safe}.csv`, "text/csv; charset=utf-8");
}

function file(body: Uint8Array, filename: string, type: string): Response {
  return new Response(body as unknown as BodyInit, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

// ── Excel ───────────────────────────────────────────────────────────────────

function xml(text: string): string {
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function columnName(index: number): string {
  let n = index + 1;
  let name = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    name = String.fromCharCode(65 + r) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function xlsx(t: TableExport): Uint8Array {
  const sheetName = (t.title.replace(/[[\]:*?/\\]/g, " ").trim() || "Sheet1").slice(0, 31);
  const all = [t.header, ...t.rows];
  const widths = t.header.map((_, c) => Math.min(60, Math.max(8, ...all.map((r) => String(r[c] ?? "").length + 2))));

  const cell = (value: Cell, ref: string, header: boolean) => {
    if (header) return `<c r="${ref}" t="inlineStr" s="1"><is><t>${xml(String(value ?? ""))}</t></is></c>`;
    if (typeof value === "number" && Number.isFinite(value)) {
      return `<c r="${ref}" s="${Number.isInteger(value) ? 2 : 3}"><v>${value}</v></c>`;
    }
    const text = String(value ?? "");
    if (!text) return "";
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(text)}</t></is></c>`;
  };

  const rows = all
    .map((r, i) => `<row r="${i + 1}">${r.map((v, c) => cell(v, `${columnName(c)}${i + 1}`, i === 0)).join("")}</row>`)
    .join("");
  const last = `${columnName(Math.max(0, t.header.length - 1))}${all.length}`;

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join("")}</cols><sheetData>${rows}</sheetData><autoFilter ref="A1:${last}"/></worksheet>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1D3557"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

  return zipSync({
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(sheetName)}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${xml(sheetName).replace(/'/g, "''")}'!$A$1:$${columnName(Math.max(0, t.header.length - 1))}$${all.length}</definedName></definedNames></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
    "xl/styles.xml": strToU8(styles),
  });
}

// ── PDF ─────────────────────────────────────────────────────────────────────

/**
 * jsPDF's built-in font covers Latin-1 only; accented characters are folded
 * to their base letter rather than risking text that prints as garbage.
 */
export function latin(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\xff]/g, "?");
}

const BRAND = [29, 53, 87] as const; // #1d3557

function pdf(t: TableExport): Uint8Array {
  const wide = t.header.length > 6;
  const doc = new jsPDF({ orientation: wide ? "landscape" : "portrait", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 32;
  const usable = pageW - margin * 2;
  const rowH = 16;
  const size = t.header.length > 10 ? 7 : 8;

  const text = (v: Cell) => (typeof v === "number" ? v.toLocaleString("en-KE", { maximumFractionDigits: 2 }) : latin(String(v ?? "")));
  const numeric = t.header.map((_, c) => t.rows.length > 0 && t.rows.every((r) => r[c] === "" || r[c] == null || typeof r[c] === "number"));

  doc.setFont("helvetica", "normal");
  doc.setFontSize(size);
  const sample = [t.header, ...t.rows.slice(0, 200)];
  const natural = t.header.map((_, c) => Math.min(180, Math.max(34, ...sample.map((r) => doc.getTextWidth(text(r[c])) + 10))));
  const scale = usable / natural.reduce((a, b) => a + b, 0);
  const widths = natural.map((w) => w * scale);

  const fit = (value: string, width: number) => {
    if (doc.getTextWidth(value) <= width - 6) return value;
    let cut = value;
    while (cut.length > 1 && doc.getTextWidth(`${cut}...`) > width - 6) cut = cut.slice(0, -1);
    return `${cut}...`;
  };

  const made = new Date().toISOString().slice(0, 16).replace("T", " ");
  let y = margin;

  const heading = () => {
    y = margin;
    if (t.tenantName) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...BRAND);
      doc.text(latin(t.tenantName), margin, y);
      y += 16;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(23, 26, 25);
    doc.text(latin(t.title), margin, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(91, 98, 93);
    doc.text(latin(`${t.subtitle ? `${t.subtitle} · ` : ""}${t.rows.length.toLocaleString("en-KE")} rows · made ${made} UTC`), margin, y);
    y += 14;
  };

  const headerRow = () => {
    doc.setFillColor(...BRAND);
    doc.rect(margin, y, usable, rowH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(size);
    doc.setTextColor(255, 255, 255);
    let x = margin;
    t.header.forEach((h, c) => {
      const label = fit(latin(h), widths[c]);
      if (numeric[c]) doc.text(label, x + widths[c] - 3, y + 11, { align: "right" });
      else doc.text(label, x + 3, y + 11);
      x += widths[c];
    });
    y += rowH;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(23, 26, 25);
  };

  heading();
  headerRow();

  t.rows.forEach((row, i) => {
    if (y + rowH > pageH - margin - 12) {
      doc.addPage();
      heading();
      headerRow();
    }
    if (i % 2 === 1) {
      doc.setFillColor(244, 246, 250);
      doc.rect(margin, y, usable, rowH, "F");
    }
    let x = margin;
    row.forEach((v, c) => {
      const value = fit(text(v), widths[c]);
      if (numeric[c]) doc.text(value, x + widths[c] - 3, y + 11, { align: "right" });
      else doc.text(value, x + 3, y + 11);
      x += widths[c];
    });
    y += rowH;
  });

  if (!t.rows.length) {
    doc.setTextColor(91, 98, 93);
    doc.text("Nothing matched.", margin + 3, y + 14);
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5);
    doc.setTextColor(91, 98, 93);
    doc.text(`Page ${p} of ${pages}`, pageW - margin, pageH - 16, { align: "right" });
    doc.text("EDOSPMIS", margin, pageH - 16);
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
