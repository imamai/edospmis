"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Printer, Search } from "lucide-react";
import { ExportLinks } from "@/components/ui/export-links";
import { FilterCard, FilterField, filterControl } from "@/components/ui/filter-card";
import { PERIOD_OPTIONS, type ReportFilterFlags } from "@/lib/report-filters";

/**
 * The filters above a report, and the things you can do with the result — the
 * shape edos-poa and EDOS CRM use for theirs.
 *
 * A client component rather than a plain GET form for one reason: a GET form
 * submits every control it holds, so narrowing by period alone produced
 * `?period=year&from=&to=&q=&status=&priority=` — a link that works but reads
 * as debris when someone sends it on. This writes only the values that are
 * actually set, so a narrowed report is a clean, sendable URL, and the download
 * and print links point at the same query against the export route.
 */
export interface FilterOptions {
  statuses: { value: string; label: string }[];
  priorities: string[];
  stages: { value: string; label: string }[];
  departments: string[];
}

export interface FilterState {
  period: string;
  from: string;
  to: string;
  q: string;
  status: string;
  priority: string;
  stage: string;
  dept: string;
}

export function ReportFilterForm({
  reportKey,
  flags,
  initial,
  options,
  canExport,
  periodLabel,
}: {
  reportKey: string;
  flags: ReportFilterFlags;
  initial: FilterState;
  options: FilterOptions;
  canExport: boolean;
  periodLabel: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof FilterState>(k: K, v: FilterState[K]) => setValues((f) => ({ ...f, [k]: v }));

  const query = () => {
    const p = new URLSearchParams();
    if (flags.dates) {
      // An explicit From/To beats the preset — the same precedence
      // `resolvePeriod` applies on the server.
      if (values.from || values.to) {
        if (values.from) p.set("from", values.from);
        if (values.to) p.set("to", values.to);
      } else if (values.period && values.period !== "all") {
        p.set("period", values.period);
      }
    }
    if (flags.search && values.q.trim()) p.set("q", values.q.trim());
    if (flags.status && values.status) p.set("status", values.status);
    if (flags.priority && values.priority) p.set("priority", values.priority);
    if (flags.stage && values.stage) p.set("stage", values.stage);
    if (flags.dept && values.dept) p.set("dept", values.dept);
    return p.toString();
  };

  const q = query();
  const exportBase = `/api/export/report/${reportKey}${q ? `?${q}` : ""}`;
  const isClear = q === "";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        router.push(q ? `/app/reports/${reportKey}?${q}` : `/app/reports/${reportKey}`);
        setTimeout(() => setBusy(false), 1200);
      }}
    >
      <FilterCard
        note={`Showing ${periodLabel.toLowerCase()}.`}
        actions={
          <>
            <button
              type="submit"
              disabled={busy}
              className="h-11 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-mid disabled:opacity-60"
            >
              {busy ? "Applying…" : "Apply"}
            </button>
            {!isClear && (
              <button
                type="button"
                onClick={() => {
                  setValues({ period: "all", from: "", to: "", q: "", status: "", priority: "", stage: "", dept: "" });
                  router.push(`/app/reports/${reportKey}`);
                }}
                className="px-1 text-sm font-semibold text-ink-faint hover:text-ink"
              >
                Clear
              </button>
            )}
            {canExport && (
              <>
                <ExportLinks base={exportBase} />
                {/* Printing the screen stops wherever the browser breaks the
                    page. This opens the report's own PDF — the same query, run
                    again on the server, every row — and they print that. */}
                <a
                  href={`${exportBase}${q ? "&" : "?"}format=pdf`}
                  target="_blank"
                  rel="noopener"
                  className="flex h-11 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium text-ink-soft transition-colors hover:border-brand hover:text-brand"
                >
                  <Printer className="h-4 w-4" aria-hidden="true" />
                  Print
                </a>
              </>
            )}
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {flags.dates && (
            <>
              <FilterField label="Period" htmlFor="period">
                <select
                  id="period"
                  value={values.from || values.to ? "custom" : values.period || "all"}
                  onChange={(e) => {
                    // Choosing a preset clears a custom range, so the two can't
                    // silently disagree about what the report covers.
                    if (e.target.value === "custom") return;
                    setValues((f) => ({ ...f, period: e.target.value, from: "", to: "" }));
                  }}
                  className={filterControl}
                >
                  {PERIOD_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                  <option value="custom">Custom range…</option>
                </select>
              </FilterField>
              <FilterField label="From" htmlFor="from">
                <input id="from" type="date" value={values.from} onChange={(e) => set("from", e.target.value)} className={filterControl} />
              </FilterField>
              <FilterField label="To" htmlFor="to">
                <input id="to" type="date" value={values.to} onChange={(e) => set("to", e.target.value)} className={filterControl} />
              </FilterField>
            </>
          )}

          {flags.search && (
            <FilterField label="Search" htmlFor="q">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
                <input
                  id="q"
                  type="search"
                  value={values.q}
                  onChange={(e) => set("q", e.target.value)}
                  placeholder={flags.searchHint}
                  className={`${filterControl} pl-9`}
                />
              </div>
            </FilterField>
          )}

          {flags.status && (
            <FilterField label="Status" htmlFor="status">
              <select id="status" value={values.status} onChange={(e) => set("status", e.target.value)} className={filterControl}>
                <option value="">Any status</option>
                {options.statuses.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </FilterField>
          )}

          {flags.priority && (
            <FilterField label="Priority" htmlFor="priority">
              <select id="priority" value={values.priority} onChange={(e) => set("priority", e.target.value)} className={filterControl}>
                <option value="">Any priority</option>
                {options.priorities.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </FilterField>
          )}

          {flags.stage && (
            <FilterField label="Stage" htmlFor="stage">
              <select id="stage" value={values.stage} onChange={(e) => set("stage", e.target.value)} className={filterControl}>
                <option value="">Every stage</option>
                {options.stages.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </FilterField>
          )}

          {flags.dept && (
            <FilterField label="Department" htmlFor="dept">
              <select id="dept" value={values.dept} onChange={(e) => set("dept", e.target.value)} className={filterControl}>
                <option value="">All departments</option>
                {options.departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </FilterField>
          )}
        </div>
      </FilterCard>
    </form>
  );
}
