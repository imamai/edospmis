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
