"use client";

import { MousePointerClick } from "lucide-react";
import { WorkflowStepper } from "@/components/app/workflow-stepper";

/**
 * The stepper inside a stage panel.
 *
 * The case-level stepper names the stage and stops, which is accurate and
 * useless once you are in it: receiving is two jobs, finance is four, and
 * each panel listed them as equal stacked sections with nothing to say which
 * one is yours now.
 *
 * Extracted after the third panel wanted it. Written four times it would have
 * drifted four ways, and the point of the pattern is that a buyer learns it
 * once and then recognises it everywhere.
 *
 * Drawn with the same chevrons as the case-level stepper, deliberately: the
 * two are one idea at two scales, and a change to how a step looks happens in
 * one place.
 */

export interface PanelStep {
  key: string;
  label: string;
}

export function PanelSteps({
  steps,
  current,
  complete,
  next,
}: {
  steps: PanelStep[];
  current: string;
  /** Everything here is done, so no step is "in progress". */
  complete: boolean;
  /** What to do now — including when the answer is to wait, which is a real state. */
  next: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <WorkflowStepper stages={steps} currentKey={current} complete={complete} />
      <p className="text-xs text-ink-soft">
        <span className="font-semibold text-ink">Next: </span>
        {next}
      </p>
    </div>
  );
}

/**
 * The blue chip that says which block to work in.
 *
 * A faint outline was not enough on a card of similar-looking sections — it
 * read as decoration rather than instruction. This takes the brand colour the
 * current chevron already uses, so the step and the block are visibly the
 * same thing.
 */
export function NextHere() {
  return (
    <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-brand px-2.5 py-1 text-[11px] font-semibold text-white">
      <MousePointerClick className="h-3.5 w-3.5" aria-hidden="true" />
      Do this next
    </span>
  );
}

/** The wrapper styling for whichever section is current. */
export function activeBox(isCurrent: boolean): string {
  return isCurrent
    ? "rounded-lg border border-brand/40 bg-brand/[0.04] p-3 -mx-1"
    : "";
}
