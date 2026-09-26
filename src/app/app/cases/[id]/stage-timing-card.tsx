import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { StageDuration } from "@/lib/data/cases";
import { STAGE_LABEL } from "@/lib/stage-labels";

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  const days = hours / 24;
  return `${days.toFixed(1)}d`;
}

/**
 * The exact metric the client's own Excel turnaround-time report tracks by
 * hand ("Days from PR Creation to PR Approval", etc.) — computed live from
 * every case's stage-history log instead of a periodic manual export.
 */
export function StageTimingCard({ durations }: { durations: StageDuration[] }) {
  if (durations.length === 0) return null;

  return (
    <Card>
      <CardHeader title="Time in each stage" subtitle="How long this case has spent at every step so far" />
      <CardBody className="flex flex-col divide-y divide-line">
        {durations.map((d, i) => {
          const isCurrent = i === durations.length - 1 && !d.left_at;
          return (
            <div key={`${d.stage_key}-${d.entered_at}`} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
              <p className="text-sm text-ink">{STAGE_LABEL[d.stage_key] ?? d.stage_key}</p>
              <div className="flex items-center gap-2">
                <span className="tnum text-sm font-medium text-ink-soft">{formatDuration(d.minutes)}</span>
                {isCurrent && <Badge tone="info">in progress</Badge>}
              </div>
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}
