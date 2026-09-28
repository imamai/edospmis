/**
 * How long a request spent between two gates.
 *
 * Every "Days from X to Y" column in the procure-to-receive report is this one
 * function, so a gap can never be counted one way in the table and another in
 * the export. Client-safe: no database access, no `server-only`.
 */

/**
 * Elapsed days between two recorded moments, to one decimal place.
 *
 * Null whenever either end is missing, which is the honest answer for a
 * request that has not reached that gate yet — zero would read as "it
 * happened immediately", and the two are not the same thing at all.
 *
 * Deliberately *not* whole days. Most of a procurement cycle is measured in
 * hours, and rounding a four-hour approval to "0 days" makes a report that
 * exists to show delay look like it is showing nothing.
 */
export function dayGap(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.round(((end - start) / 86_400_000) * 10) / 10;
}

/** `2.4 d`, or an em dash where the request has not reached that gate. */
export function dayGapLabel(days: number | null): string {
  if (days === null) return "—";
  return `${days.toFixed(1)} d`;
}

/**
 * The average of the gaps that exist, ignoring the ones that don't.
 *
 * A request still sitting at approval has no approval-to-PO gap; counting it
 * as zero would drag the average down and make a slow pipeline look fast.
 * Null when nothing has completed that step yet, so the caller shows "—"
 * rather than a confident 0.0.
 */
export function averageGap(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) return null;
  return Math.round((present.reduce((sum, v) => sum + v, 0) / present.length) * 10) / 10;
}

// ─────────────────────────────────────────────────────────────────────────
// The delivery window
// ─────────────────────────────────────────────────────────────────────────

/**
 * Midnight UTC on the calendar day a timestamp falls on.
 *
 * A delivery window is a promise about a *day*, not a moment: an order due on
 * the 5th that arrives at nine in the morning on the 5th is on time, and so
 * is one that arrives at eleven at night. Measuring the two ends in hours
 * would make the second one late by most of a day.
 */
function utcDay(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Whole days between the date an order was promised for and the day the goods
 * actually turned up. Positive is late, negative is early, zero is on the day.
 *
 * Null when the order carries no expected date, or nothing has been received
 * against it — neither is a variance of zero, and reporting it as one is how
 * a supplier with no agreed window comes out looking punctual.
 */
export function deliveryVariance(expected: string | null, received: string | null): number | null {
  if (!expected || !received) return null;
  const due = utcDay(expected);
  const got = utcDay(received);
  if (due === null || got === null) return null;
  return Math.round((got - due) / 86_400_000);
}

/**
 * Days an order is past its window with nothing received yet.
 *
 * Zero rather than null when it is still within the window, so the caller can
 * treat "not late" as a number; null only where there is no window to be late
 * against or the goods have already arrived (use `deliveryVariance` then).
 */
export function overdueDays(
  expected: string | null,
  received: string | null,
  now: Date = new Date(),
): number | null {
  if (!expected || received) return null;
  const due = utcDay(expected);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (due === null) return null;
  return Math.max(0, Math.round((today - due) / 86_400_000));
}

export type DeliveryState = "no_window" | "on_time" | "early" | "late" | "awaiting" | "overdue";

/** What to say about an order's delivery window, in one word. */
export function deliveryState(
  expected: string | null,
  received: string | null,
  now: Date = new Date(),
): DeliveryState {
  if (!expected) return "no_window";
  if (received) {
    const variance = deliveryVariance(expected, received);
    if (variance === null) return "no_window";
    if (variance > 0) return "late";
    if (variance < 0) return "early";
    return "on_time";
  }
  return (overdueDays(expected, received, now) ?? 0) > 0 ? "overdue" : "awaiting";
}

/** `4 days late`, `2 days early`, `On the day` — the variance said in words. */
export function deliveryVarianceLabel(days: number | null): string {
  if (days === null) return "—";
  if (days === 0) return "On the day";
  const n = Math.abs(days);
  return `${n} ${n === 1 ? "day" : "days"} ${days > 0 ? "late" : "early"}`;
}
