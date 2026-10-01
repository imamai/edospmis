"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { importCatalogueRows } from "./actions";
import {
  findColumn,
  parseMoneyToCents,
  readSpreadsheet,
} from "@/lib/import/spreadsheet";
import type { ImportRow } from "@/lib/data/catalogue";

/**
 * Loading the spreadsheet the business already keeps.
 *
 * The file is read here, in the browser, and only the parsed rows are sent —
 * see lib/import/spreadsheet.ts for why.
 *
 * Nothing is applied until somebody has seen what we understood. A silent
 * import of four hundred rows that quietly mapped the wrong column is far
 * worse than one that asks first, because the damage is only visible later,
 * on a request, as a wrong price.
 */

interface Preview {
  rows: ImportRow[];
  skipped: number;
  columns: {
    description: string;
    code: string | null;
    unit: string | null;
    cost: string | null;
  };
}

const TEMPLATE = [
  "code,description,unit,unit cost,notes",
  'LAP-14,"Laptop, 14-inch, 16GB RAM",pcs,85000,Finance standard build',
  "A4-REAM,A4 paper ream 80gsm,ream,650,",
  "TONER-85A,HP 85A toner cartridge,pcs,7200,",
].join("\n");

export function CatalogueImport() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [reading, setReading] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [notice, setNotice] = useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);

  async function onPick(file: File) {
    setNotice(null);
    setPreview(null);
    setReading(true);
    try {
      const sheet = await readSpreadsheet(file);

      // Matched by the names a real spreadsheet uses, not by position — a
      // file whose columns are in a different order should still import.
      const descAt = findColumn(
        sheet.headers,
        "description",
        "item",
        "item description",
        "name",
        "particulars",
      );
      if (descAt === -1) {
        throw new Error(
          `No description column found. The headers read: ${sheet.headers.filter(Boolean).join(", ") || "(none)"}. One column needs to be called Description, Item or Particulars.`,
        );
      }
      const codeAt = findColumn(
        sheet.headers,
        "code",
        "item code",
        "part number",
        "sku",
        "stock code",
      );
      const unitAt = findColumn(
        sheet.headers,
        "unit",
        "uom",
        "unit of measure",
      );
      const costAt = findColumn(
        sheet.headers,
        "unit cost",
        "price",
        "unit price",
        "cost",
        "rate",
        "amount",
      );
      const notesAt = findColumn(
        sheet.headers,
        "notes",
        "remarks",
        "comment",
        "specification",
      );

      const rows: ImportRow[] = [];
      let skipped = 0;
      for (const row of sheet.rows) {
        const description = row[descAt] ?? "";
        if (!description) {
          skipped++;
          continue;
        }
        rows.push({
          code: (codeAt === -1 ? "" : row[codeAt]) || null,
          description,
          unit: (unitAt === -1 ? "" : row[unitAt]) || null,
          indicative_unit_cost_cents:
            costAt === -1 ? null : parseMoneyToCents(row[costAt] ?? ""),
          notes: (notesAt === -1 ? "" : row[notesAt]) || null,
        });
      }

      if (rows.length === 0)
        throw new Error("Every row in that file had an empty description.");

      setPreview({
        rows,
        skipped,
        columns: {
          description: sheet.headers[descAt] || "description",
          code: codeAt === -1 ? null : sheet.headers[codeAt],
          unit: unitAt === -1 ? null : sheet.headers[unitAt],
          cost: costAt === -1 ? null : sheet.headers[costAt],
        },
      });
    } catch (cause) {
      setNotice({
        tone: "error",
        text:
          cause instanceof Error
            ? cause.message
            : "That file could not be read.",
      });
    } finally {
      setReading(false);
      // Cleared so picking the same file again re-triggers onChange.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function apply() {
    if (!preview) return;
    start(async () => {
      const result = await importCatalogueRows(preview.rows);
      if (result.error) {
        setNotice({ tone: "error", text: result.error });
        return;
      }
      setNotice({ tone: "ok", text: result.ok ?? "Imported." });
      setPreview(null);
      router.refresh();
    });
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "edospmis-catalogue-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          id="catalogue-file"
          type="file"
          accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onPick(file);
          }}
        />
        <Button
          type="button"
          variant="secondary"
          busy={reading}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="mr-1.5 h-4 w-4" />
          {reading ? "Reading" : "Choose a file"}
        </Button>
        <button
          type="button"
          onClick={downloadTemplate}
          className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
          Download a template
        </button>
      </div>

      <p className="text-xs text-ink-faint">
        Needs a <span className="font-medium text-ink-soft">Description</span>{" "}
        column. Code, Unit, Unit cost and Notes are used where present, in any
        order. A row whose code already exists is updated rather than
        duplicated, so a monthly price list can be re-imported safely.
      </p>

      {preview && (
        <div className="rounded-lg border border-line bg-surface-sunk p-3">
          <p className="text-sm font-semibold text-ink">
            {preview.rows.length.toLocaleString()} item
            {preview.rows.length === 1 ? "" : "s"} ready to import
          </p>
          <p className="mt-1 text-xs text-ink-faint">
            Reading{" "}
            <span className="font-medium text-ink-soft">
              {preview.columns.description}
            </span>{" "}
            as the description
            {preview.columns.code
              ? `, ${preview.columns.code} as the code`
              : ", no code column"}
            {preview.columns.unit
              ? `, ${preview.columns.unit} as the unit`
              : ", unit defaulting to pcs"}
            {preview.columns.cost
              ? `, ${preview.columns.cost} as the indicative cost`
              : ", no cost column"}
            .
            {preview.skipped > 0
              ? ` ${preview.skipped} row${preview.skipped === 1 ? "" : "s"} had no description and will be left out.`
              : ""}
          </p>

          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-line text-ink-faint">
                  <th className="pb-1 pr-3 font-medium">Code</th>
                  <th className="pb-1 pr-3 font-medium">Description</th>
                  <th className="pb-1 pr-3 font-medium">Unit</th>
                  <th className="pb-1 font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-b border-line/60 last:border-0">
                    <td className="py-1 pr-3 font-mono text-ink-faint">
                      {row.code ?? "—"}
                    </td>
                    <td className="py-1 pr-3 text-ink">{row.description}</td>
                    <td className="py-1 pr-3 text-ink-soft">
                      {row.unit ?? "pcs"}
                    </td>
                    <td className="tnum py-1 text-ink-soft">
                      {row.indicative_unit_cost_cents === null
                        ? "—"
                        : (
                            row.indicative_unit_cost_cents / 100
                          ).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.rows.length > 5 && (
              <p className="mt-1 text-xs text-ink-faint">
                …and {(preview.rows.length - 5).toLocaleString()} more.
              </p>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" busy={pending} onClick={apply}>
              Import {preview.rows.length.toLocaleString()} item
              {preview.rows.length === 1 ? "" : "s"}
            </Button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-ink-faint hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {notice && (
        <p
          role="status"
          className={
            notice.tone === "ok"
              ? "rounded-lg border border-good/25 bg-good-soft px-3 py-2 text-sm text-good"
              : "rounded-lg border border-critical/25 bg-critical-soft px-3 py-2 text-sm text-critical"
          }
        >
          {notice.text}
        </p>
      )}
    </div>
  );
}
