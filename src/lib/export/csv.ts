/**
 * CSV that opens correctly in Excel and doesn't run as a formula.
 *
 * A byte-order mark, or Excel reads UTF-8 as Windows-1252 and an accented
 * name arrives as mojibake. And any cell starting with = + - or @ is
 * prefixed with an apostrophe: a supplier name typed as `=HYPERLINK(...)`
 * would otherwise run as a formula the moment someone opens the file —
 * the same CSV-formula-injection guard every export in this app now shares.
 */
export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const cell = (value: string | number | null | undefined) => {
    let text = value === null || value === undefined ? "" : String(value);
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}
