import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkflowStageDef } from "@/lib/database.types";

/**
 * The reusable chevron workflow stepper (ARCHITECTURE.md §10.2). Reads its
 * stage labels from the Case's own pinned workflow version — never
 * hard-coded strings — so a future tenant-defined workflow with different
 * stages renders correctly without a component change.
 */
export function WorkflowStepper({
  stages,
  currentKey,
  terminal,
}: {
  stages: WorkflowStageDef[];
  currentKey: string;
  /** "rejected" / "returned" / "cancelled" — shown as a distinct end state, not just another step. */
  terminal?: { key: string; label: string } | null;
}) {
  const currentIndex = stages.findIndex((s) => s.key === currentKey);

  return (
    <div className="flex items-center gap-1 overflow-x-auto scroll-slim">
      {stages.map((stage, i) => {
        const isDone = currentIndex >= 0 && i < currentIndex && !terminal;
        const isCurrent = stage.key === currentKey && !terminal;
        return (
          <div key={stage.key} className="flex shrink-0 items-center gap-1">
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap",
                isDone && "border-good/30 bg-good-soft text-good",
                isCurrent && "border-brand bg-brand text-white",
                !isDone && !isCurrent && "border-line text-ink-faint",
              )}
            >
              {isDone && <Check className="h-3.5 w-3.5" />}
              {stage.label}
            </div>
            {i < stages.length - 1 && <div className="h-px w-4 shrink-0 bg-line" />}
          </div>
        );
      })}
      {terminal && (
        <>
          <div className="h-px w-4 shrink-0 bg-line" />
          <div className="shrink-0 rounded-full border border-critical/30 bg-critical-soft px-3 py-1.5 text-xs font-semibold text-critical whitespace-nowrap">
            {terminal.label}
          </div>
        </>
      )}
    </div>
  );
}
