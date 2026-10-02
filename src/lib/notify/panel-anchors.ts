/**
 * Which panel a notification is actually about.
 *
 * Every notification linked to the bare case page. On a case with six panels
 * that means landing at the top and hunting for the one that needs you —
 * which is the whole job the notification was meant to have done. "An invoice
 * is waiting" should put you in front of the invoice.
 *
 * Kept as one map rather than an argument at each call site: there are about
 * twenty kinds raised from six files, and a per-call anchor would have been
 * wrong in the one place somebody forgot.
 *
 * A kind with no entry falls through to the top of the case, which is the old
 * behaviour and a perfectly reasonable answer for a notification that is about
 * the case as a whole — a hold, a closure.
 */

/** The ids rendered on the case page. */
export const PANEL_ANCHORS = {
  approval: "panel-approval",
  procurement: "panel-procurement",
  receiving: "panel-receiving",
  finance: "panel-finance",
  delivery: "panel-delivery",
} as const;

const BY_KIND: Record<string, string> = {
  // Somebody has to decide.
  "pr.submitted": PANEL_ANCHORS.approval,
  "po.pending_approval": PANEL_ANCHORS.procurement,

  // The tender.
  "quotation.received": PANEL_ANCHORS.procurement,
  "bid.submitted": PANEL_ANCHORS.procurement,
  "pr.approved": PANEL_ANCHORS.procurement,
  "po.issued": PANEL_ANCHORS.procurement,

  // Goods arriving.
  "grn.recorded": PANEL_ANCHORS.receiving,
  "grn.inspection_failed": PANEL_ANCHORS.receiving,

  // Money.
  "invoice.submitted": PANEL_ANCHORS.finance,
  "invoice.exception": PANEL_ANCHORS.finance,
  "invoice.approved": PANEL_ANCHORS.finance,
  "payment.recorded": PANEL_ANCHORS.finance,

  // Out of the door.
  "delivery.scheduled": PANEL_ANCHORS.delivery,
  "delivery.dispatched": PANEL_ANCHORS.delivery,

  // Deliberately absent: po.issued.requester and grn.recorded.requester tell a
  // requester their request has moved on. They are not being asked to do
  // anything in that panel, and dropping them into the buyer's controls would
  // suggest they were.
};

/**
 * Adds the panel anchor to a case link, if the kind points at one.
 *
 * Left alone when the href already carries a hash — a caller that has been
 * specific knows something this map does not — or when it is not a case link
 * at all.
 */
export function withPanelAnchor(href: string, kind: string): string {
  if (href.includes("#")) return href;
  if (!href.startsWith("/app/cases/")) return href;
  const anchor = BY_KIND[kind];
  return anchor ? `${href}#${anchor}` : href;
}
