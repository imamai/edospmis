import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Filters, gathered into one panel instead of scattered above a table — the
 * same shape edos-poa and EDOS CRM give their reports.
 *
 * Before this, a report carried two separate filter blocks: a row of period
 * chips, then a card of everything else. That meant two places to look, two
 * interactions to narrow one report, and the period had to be smuggled through
 * the second form as hidden inputs. One card, one Apply.
 *
 * `print:hidden` because the filters describe the report; they aren't part of
 * it. What gets printed or downloaded is the table underneath.
 */
export function FilterCard({
  title = "Filters",
  actions,
  note,
  children,
  className,
}: {
  title?: string;
  /** Buttons under the controls — apply, clear, export, print. */
  actions?: React.ReactNode;
  /** A quiet line beside the actions saying what the result covers. */
  note?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-line bg-surface p-4 shadow-card print:hidden", className)}>
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
        <SlidersHorizontal className="h-4 w-4 text-ink-faint" aria-hidden="true" />
        {title}
      </h2>

      <div className="mt-3 flex flex-col gap-3">{children}</div>

      {(actions || note) && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {actions}
          {note && <p className="text-xs text-ink-faint">{note}</p>}
        </div>
      )}
    </section>
  );
}

/** A labelled control inside the card, so each one says what it narrows. */
export function FilterField({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-ink-soft">
        {label}
      </label>
      {children}
    </div>
  );
}

/** "Displaying 10 of 40 rows." — the count edos-poa puts under a report's table. */
export function RecordCount({
  shown,
  total,
  noun = "row",
  plural,
}: {
  shown: number;
  total?: number;
  noun?: string;
  /** Pass this wherever adding an "s" is wrong — "category" -> "categories". */
  plural?: string;
}) {
  const many = plural ?? `${noun}s`;
  const word = shown === 1 ? noun : many;
  return (
    <p className="px-1 pt-3 text-xs text-ink-faint">
      {total !== undefined && total > shown
        ? `Displaying ${shown.toLocaleString("en-KE")} of ${total.toLocaleString("en-KE")} ${many}.`
        : `Displaying ${shown.toLocaleString("en-KE")} ${word}.`}
    </p>
  );
}

/** The shared control styling, so every filter input matches. */
export const filterControl =
  "h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none";
