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
