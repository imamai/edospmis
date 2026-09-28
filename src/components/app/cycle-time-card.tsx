import Link from "next/link";
import { ArrowRight, Timer } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { dayGapLabel } from "@/lib/cycle-time";
import type { CycleSummary } from "@/lib/data/procurement-reports";

/**
 * Where the procurement cycle spends its time, as one bar.
 *
 * A stacked bar rather than four figures side by side, because the question
 * this answers is comparative — which gate is the slow one — and a row of
 * numbers makes the reader do that comparison in their head. The widest
 * segment is the bottleneck, and that reads at a glance from across a desk.
 *
 * The colour split is not decoration: the first three segments are the
 * organisation deciding, in one hue; the last is the supplier delivering, in
 * another. A cycle that is slow because of your own approvals is a different
 * problem from one that is slow because suppliers are late, and the bar
 * should say which it is before anyone reads a label.
 */

const RAMP: Record<string, { bar: string; dot: string }> = {
  pr_approval: { bar: "bg-brand-darker", dot: "bg-brand-darker" },
  sourcing: { bar: "bg-brand", dot: "bg-brand" },
  po_approval: { bar: "bg-brand-mid", dot: "bg-brand-mid" },
  delivery: { bar: "bg-info", dot: "bg-info" },
};

export function CycleTimeCard({ summary }: { summary: CycleSummary }) {
  // "Nothing measured yet" and "everything happened the same day" are
  // different answers, and a workspace fast enough to clear a whole cycle
  // inside a day should not be told it has no data. So the empty state keys
  // off whether any gate has a figure at all, not off the total being zero.
  const measured = summary.gates.filter((g) => g.avgDays !== null);
  const measurable = measured.filter((g) => (g.avgDays ?? 0) > 0);
  const spread = measurable.reduce((sum, g) => sum + (g.avgDays ?? 0), 0);

  return (
    <Card>
      <CardHeader
        title="Procure-to-receive cycle time"
        subtitle={`Requests raised in the last ${summary.windowDays} days`}
        icon={<Timer className="h-4 w-4" />}
        action={
          <Link
            href="/app/reports/cycle-time"
            className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
          >
            Full report
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        }
      />
      <CardBody>
        {measured.length === 0 ? (
          <div className="empty-frame flex flex-col items-center gap-2 px-6 py-8 text-center">
            <p className="text-sm font-medium text-ink">Nothing to measure yet</p>
            <p className="max-w-sm text-xs text-ink-faint">
              Once a request has been approved and an order raised against it, the
              time spent at each gate appears here.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
              <div>
                <p className="text-xs font-medium text-ink-faint">Raised to goods received</p>
                <p className="mt-0.5 text-3xl font-semibold tnum text-ink">
                  {/* Null where a gate has no completions: three quarters of a
                      cycle presented as the whole one would flatter it. */}
                  {summary.totalDays === null ? "—" : dayGapLabel(summary.totalDays)}
                </p>
                {summary.totalDays === null && (
                  <p className="mt-0.5 text-xs text-ink-faint">
                    No request has cleared every gate yet
                  </p>
                )}
              </div>
              <div className="flex gap-8">
                <div>
                  <p className="text-xs font-medium text-ink-faint">Raised</p>
                  <p className="mt-0.5 text-lg font-semibold tnum text-ink">{summary.raised}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-ink-faint">Goods in</p>
                  <p className="mt-0.5 text-lg font-semibold tnum text-ink">{summary.completed}</p>
                </div>
                {summary.overdue > 0 && (
                  <div>
                    <p className="text-xs font-medium text-ink-faint">Past the window</p>
                    <p className="mt-0.5 text-lg font-semibold tnum text-critical">{summary.overdue}</p>
                  </div>
                )}
              </div>
            </div>

            {spread > 0 ? (
              <div
                className="flex h-3 w-full overflow-hidden rounded-full bg-surface-sunk"
                role="img"
                aria-label={measurable.map((g) => `${g.label}, ${dayGapLabel(g.avgDays)}`).join("; ")}
              >
                {measurable.map((g) => (
                  <div
                    key={g.key}
                    // A gate worth a couple of hours still has to be visible,
                    // so every segment keeps a floor of 2% of the bar.
                    style={{ width: `${Math.max(2, ((g.avgDays ?? 0) / spread) * 100)}%` }}
                    className={`${RAMP[g.key]?.bar ?? "bg-brand"} h-full`}
                  />
                ))}
              </div>
            ) : (
              // Every gate cleared inside a day. There is nothing to apportion,
              // and a bar of four equal slivers would invent a distribution
              // the data does not have.
              <div className="flex items-center gap-2.5 rounded-lg bg-good-soft px-3 py-2 text-sm text-good">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-good" aria-hidden="true" />
                Every gate cleared the same day it was reached.
              </div>
            )}

            <ul className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
              {summary.gates.map((g) => {
                const share = g.avgDays && spread > 0 ? Math.round((g.avgDays / spread) * 100) : null;
                return (
                  <li key={g.key} className="flex items-center gap-2.5 text-sm">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${RAMP[g.key]?.dot ?? "bg-brand"}`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate text-ink-soft">{g.label}</span>
                    <span className="shrink-0 tnum font-semibold text-ink">{dayGapLabel(g.avgDays)}</span>
                    <span className="w-10 shrink-0 text-right tnum text-xs text-ink-faint">
                      {/* The denominator, because an average over one request
                          is not the same claim as an average over forty. */}
                      {g.measured === 0 ? "—" : share === null ? `${g.measured}` : `${share}%`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
