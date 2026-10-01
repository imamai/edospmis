/**
 * Reading the spreadsheet a business already keeps.
 *
 * Nobody maintains their item list in our system first. It lives in an Excel
 * file or a CSV export, and asking somebody to retype four hundred rows is
 * the reason a catalogue feature goes unused. So we read the file they have.
 *
 * This runs in the browser, on purpose. The file never leaves the machine
 * until it is a small array of parsed rows, which means no upload limit to
 * trip over, no server memory spent holding a workbook, and nothing to clean
 * up if somebody abandons the import halfway. `DOMParser` is a browser API —
 * importing this module from a server component will not work, and is not
 * meant to.
 *
 * .xlsx is a zip of XML, so `fflate` unzips it and the two parts that matter
 * are read directly: the shared string table and the first worksheet. That is
 * a fraction of a full spreadsheet library, and avoids one whose npm build
 * carries its own advisories.
 *
 * What it deliberately does not do: formulas are read as their last cached
 * result, dates are left as the text Excel displayed, and only the first
 * sheet is read. An item list is names, units and prices — none of that needs
 * a calculation engine, and pretending to be one invites files we cannot
 * honestly handle.
 */

import { unzipSync, strFromU8 } from "fflate";

export interface Sheet {
  /** First row, lower-cased and trimmed, so header matching is forgiving. */
  headers: string[];
  /** Every row after the header, as text. Short rows are padded. */
  rows: string[][];
}

/** "A" → 0, "Z" → 25, "AA" → 26. Needed because empty cells are simply absent. */
function columnIndex(ref: string): number {
  const letters = ref.replace(/[0-9]/g, "").toUpperCase();
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * One CSV row at a time, honouring quotes.
 *
 * Hand-written rather than pulled in, because the whole specification that
 * matters here is: commas separate, quotes group, and a doubled quote inside
 * a quoted field is one quote. A newline inside quotes is part of the field,
 * which is why this cannot be a split on "\n".
 */
function parseCsv(text: string): string[][] {
  // Excel writes a byte-order mark, which would otherwise become part of the
  // first header and stop it matching anything.
  const input = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      // Treat CRLF as one break, not two.
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  // A file with no trailing newline still has a last row.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parseXlsx(buffer: ArrayBuffer): string[][] {
  const files = unzipSync(new Uint8Array(buffer));
  const parser = new DOMParser();

  // The shared string table: most text in a workbook is stored once here and
  // referenced by index from the cells.
  const shared: string[] = [];
  const sharedPart = files["xl/sharedStrings.xml"];
  if (sharedPart) {
    const doc = parser.parseFromString(
      strFromU8(sharedPart),
      "application/xml",
    );
    for (const si of Array.from(doc.getElementsByTagName("si"))) {
      // A styled string is split into <r> runs, each with its own <t>. The
      // value is all of them joined — taking only the first would truncate
      // any cell where somebody bolded a word.
      shared.push(
        Array.from(si.getElementsByTagName("t"))
          .map((t) => t.textContent ?? "")
          .join(""),
      );
    }
  }

  // Only the first worksheet. Sorted by length then name so sheet2 never
  // sorts before sheet10 and, more importantly, sheet1 wins over sheet11.
  const sheetPath = Object.keys(files)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort((a, b) => a.length - b.length || a.localeCompare(b))[0];
  if (!sheetPath) throw new Error("That file has no worksheets in it.");

  const doc = parser.parseFromString(
    strFromU8(files[sheetPath]),
    "application/xml",
  );
  const rows: string[][] = [];

  for (const rowEl of Array.from(doc.getElementsByTagName("row"))) {
    const cells: string[] = [];
    for (const cell of Array.from(rowEl.getElementsByTagName("c"))) {
      const ref = cell.getAttribute("r") ?? "";
      const at = ref ? columnIndex(ref) : cells.length;
      const type = cell.getAttribute("t");

      let value = "";
      if (type === "s") {
        const index = Number(
          cell.getElementsByTagName("v")[0]?.textContent ?? "",
        );
        value = Number.isInteger(index) ? (shared[index] ?? "") : "";
      } else if (type === "inlineStr") {
        value = Array.from(cell.getElementsByTagName("t"))
          .map((t) => t.textContent ?? "")
          .join("");
      } else {
        // Numbers, booleans, and a formula's cached result all live in <v>.
        value = cell.getElementsByTagName("v")[0]?.textContent ?? "";
      }

      // Pad the gap: an empty cell is absent from the XML entirely, so
      // without this every row after a blank cell would shift left.
      while (cells.length < at) cells.push("");
      cells[at] = value;
    }
    rows.push(cells);
  }
  return rows;
}

/**
 * Reads the file and returns its header row and body.
 *
 * Leading blank rows are skipped — a spreadsheet that opens with a title and
 * a gap above the real table is the common case, not the exception.
 */
export async function readSpreadsheet(file: File): Promise<Sheet> {
  const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";
  let table = isCsv
    ? parseCsv(await file.text())
    : parseXlsx(await file.arrayBuffer());

  // Drop rows that are entirely empty, wherever they are: the title row above
  // the table, the gap under it, and the trailing blanks Excel leaves behind.
  table = table.filter((row) => row.some((cell) => cell.trim() !== ""));
  if (table.length === 0) throw new Error("That file has no rows in it.");

  const [header, ...body] = table;
  const headers = header.map((h) => h.trim().toLowerCase());
  const width = headers.length;

  return {
    headers,
    rows: body.map((row) => {
      const padded = row.slice(0, width);
      while (padded.length < width) padded.push("");
      return padded.map((cell) => cell.trim());
    }),
  };
}

/**
 * Finds a column by any of the names a real spreadsheet might use for it.
 *
 * Returns -1 when none match, which the caller reports as a named missing
 * column — far more use than "import failed".
 */
export function findColumn(headers: string[], ...names: string[]): number {
  for (const name of names) {
    const at = headers.indexOf(name.toLowerCase());
    if (at !== -1) return at;
  }
  // Fall back to a contains match, so "item description" finds "description".
  for (const name of names) {
    const at = headers.findIndex((h) => h.includes(name.toLowerCase()));
    if (at !== -1) return at;
  }
  return -1;
}

/**
 * A price as written by a human, in cents.
 *
 * Accepts "1,250", "KES 1,250.50", "1250.5" and a bare number. Returns null
 * for anything else, including an empty cell — which the import treats as
 * "no price given" rather than "free".
 */
export function parseMoneyToCents(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}
