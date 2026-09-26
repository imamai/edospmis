import type { Tone } from "@/components/ui/badge";

/** Shared between the Reports screen and its exports, so a stage never reads differently in each. */
export const STAGE_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approval: "Approval",
  approved: "Approved",
  rejected: "Rejected",
  returned: "Returned",
  cancelled: "Cancelled",
  procurement: "Procurement",
  po_approval: "PO Approval",
  awarded: "Awarded",
  receiving: "Receiving",
  finance: "Finance",
  delivery: "Delivery",
  closed: "Completed",
};

/**
 * One badge-color rule for every stage, shared by the case detail page, "My
 * requests", and the Requisitions pipeline — previously three copies of the
 * same seven-entry map that had already drifted (only the case detail page
 * knew about the post-approval stages). Approval and Completed intentionally
 * stand out from the plain "in progress" stages: Approval is amber because
 * it's someone's turn to act, Completed is the brand navy as a clear "done".
 */
export const STAGE_TONE: Record<string, Tone> = {
  draft: "neutral",
  submitted: "info",
  approval: "attention",
  approved: "good",
  rejected: "critical",
  returned: "attention",
  cancelled: "neutral",
  procurement: "info",
  po_approval: "attention",
  awarded: "good",
  receiving: "info",
  finance: "info",
  delivery: "info",
  closed: "brand",
};

/** Short "what happens here" copy, for a stepper tooltip or a summary line — content lifted from the ProcureMIS reference spec, which is descriptive UI copy rather than business logic. */
export const STAGE_HINT: Record<string, string> = {
  draft: "Requester completes and submits",
  submitted: "Waiting to enter the approval queue",
  approval: "HOD and budget holder review",
  approved: "Cleared for sourcing",
  procurement: "RFQ / tender open to suppliers",
  po_approval: "Purchase order awaiting approval",
  awarded: "LPO issued to winning supplier",
  receiving: "Goods inspected, GRN raised",
  finance: "Invoice matched, payment processed",
  delivery: "Items issued to department",
  closed: "Closed and archived",
};

/** The three non-rejection-shaped terminal outcomes — shown as a distinct end state on a WorkflowStepper, never just another step. */
export const TERMINAL_LABEL: Record<string, string> = {
  rejected: "Rejected",
  returned: "Returned for correction",
  cancelled: "Cancelled",
};

/**
 * Stages a case never leaves, so a stage-history row for one keeps `left_at`
 * null forever. Anything measuring dwell time has to special-case these, or it
 * reports "how long ago the case ended" as though it were work in progress —
 * see migration 0036. `returned` is deliberately absent: a returned case goes
 * back to draft, so that pass does end.
 */
export const TERMINAL_STAGE_KEYS = ["closed", "rejected", "cancelled"] as const;

export function isTerminalStage(stageKey: string): boolean {
  return (TERMINAL_STAGE_KEYS as readonly string[]).includes(stageKey);
}

/** Which stage keys make each case-detail panel "the one currently in play". */
export const PANEL_STAGE_KEYS = {
  approval: ["approval"],
  procurement: ["procurement", "po_approval"],
  receiving: ["awarded", "receiving"],
  finance: ["finance"],
  delivery: ["delivery"],
} as const;

export function isCurrentStage(panelStageKeys: readonly string[], currentStageKey: string): boolean {
  return panelStageKeys.includes(currentStageKey);
}
