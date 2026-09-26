import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/utils";
import type { CaseStatus } from "@/lib/database.types";

export function CaseSummaryHeader({
  caseNumber,
  title,
  requesterName,
  amountCents,
  currency,
  openedAt,
  status,
  statusTone,
}: {
  caseNumber: string;
  title: string;
  requesterName: string | null;
  amountCents: number;
  currency: string;
  openedAt: string;
  status: CaseStatus;
  statusTone: "neutral" | "info" | "good" | "attention" | "critical";
}) {
  const daysOpen = Math.max(0, Math.round((Date.now() - new Date(openedAt).getTime()) / 86400000));

  return (
    <div className="sticky top-0 z-30 -mx-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line bg-surface/95 px-4 py-2.5 backdrop-blur-sm sm:-mx-6 sm:px-6">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-faint">{caseNumber}</span>
        <span className="truncate text-sm font-medium text-ink">{title}</span>
      </div>
      <div className="flex items-center gap-3 text-xs text-ink-faint">
        {requesterName && <span>{requesterName}</span>}
        <span className="tnum font-medium text-ink-soft">{formatMoney(amountCents, { currency })}</span>
        <span>{daysOpen === 0 ? "opened today" : `${daysOpen}d open`}</span>
        <Badge tone={statusTone}>{status}</Badge>
      </div>
    </div>
  );
}
