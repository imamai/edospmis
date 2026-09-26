import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils";
import type { WorkflowStageDef } from "@/lib/database.types";

/**
 * The reusable chevron workflow stepper (ARCHITECTURE.md §10.2). Reads its
 * stage labels from the Case's own pinned workflow version — never
 * hard-coded strings — so a future tenant-defined workflow with different
 * stages renders correctly without a component change. Each step is drawn
 * as a connected chevron (CSS clip-path), not a pill, and overlaps its
 * neighbor slightly so the chain reads as one continuous path.
 */
export function WorkflowStepper({
  stages,
  currentKey,
  terminal,
  stageDates,
  stageHints,
  hrefForStage,
}: {
  stages: WorkflowStageDef[];
  currentKey: string;
  /** "rejected" / "returned" / "cancelled" — shown as a distinct end state, not just another step. */
  terminal?: { key: string; label: string } | null;
  /** stage_key -> ISO date the stage was entered, for a "reached {date}" caption. */
  stageDates?: Record<string, string>;
  /** stage_key -> a one-line "what happens here" tooltip (title attribute). */
  stageHints?: Record<string, string>;
  /**
   * When given, each pill becomes a link (e.g. to filter a list by that
   * stage) instead of a plain div — used by the Requisitions pipeline page.
   * The case detail page's own stepper omits this and stays read-only.
   */
  hrefForStage?: (stageKey: string) => string;
}) {
  const currentIndex = stages.findIndex((s) => s.key === currentKey);

  return (
    <div className="flex items-stretch overflow-x-auto scroll-slim">
      {stages.map((stage, i) => {
        const isDone = currentIndex >= 0 && i < currentIndex && !terminal;
        const isCurrent = stage.key === currentKey && !terminal;
        const isFirst = i === 0;
        const isLast = i === stages.length - 1;
        const reachedAt = stageDates?.[stage.key];

        const clipPath = isFirst
          ? "polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)"
          : isLast
            ? "polygon(0 0, 100% 0, 100% 100%, 0 100%, 14px 50%)"
            : "polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%, 14px 50%)";

        const className = cn(
          "flex min-h-[2.75rem] min-w-[7rem] shrink-0 flex-col items-center justify-center gap-0.5 px-5 py-1 text-center whitespace-nowrap",
          !isFirst && "-ml-3.5",
          isDone && "bg-good text-white",
          isCurrent && "bg-brand text-white",
          !isDone && !isCurrent && "border border-line bg-surface-sunk text-ink-faint",
          hrefForStage && "cursor-pointer transition-opacity hover:opacity-90",
        );
        const content = (
          <>
            <span className="flex items-center gap-1 text-xs font-semibold">
              {isDone && <Check className="h-3 w-3 shrink-0" />}
              {stage.label}
            </span>
            {isDone && reachedAt && <span className="text-[10px] opacity-80">reached {formatDate(reachedAt)}</span>}
            {isCurrent && <span className="text-[10px] opacity-85">in progress</span>}
          </>
        );

        return hrefForStage ? (
          <Link key={stage.key} href={hrefForStage(stage.key)} style={{ clipPath }} className={className} title={stageHints?.[stage.key]}>
            {content}
          </Link>
        ) : (
          <div key={stage.key} style={{ clipPath }} className={className} title={stageHints?.[stage.key]}>
            {content}
          </div>
        );
      })}
      {terminal && (
        <>
          <div className="mx-2 h-px w-4 shrink-0 self-center bg-line" />
          <div className="flex shrink-0 items-center self-center rounded-full border border-critical/30 bg-critical-soft px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-critical">
            {terminal.label}
          </div>
        </>
      )}
    </div>
  );
}
