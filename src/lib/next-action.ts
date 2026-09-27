import type { ProcurementDetail } from "@/lib/data/procurement";
import type { FulfilmentDetail } from "@/lib/data/fulfilment";
import type { FinanceDetail } from "@/lib/data/finance";
import { isTerminalStage } from "@/lib/stage-labels";

/**
 * The one thing a case is waiting for, from the viewer's side.
 *
 * Lives here rather than in the banner component because that component
 * imports `can` from `@/lib/data/session`, which is `server-only`: nothing
 * importing it can be tested, and a client component importing a value from
 * it drags the server Supabase client into the browser bundle. This takes a
 * permission set and knows nothing about sessions.
 */
export type Tone = "info" | "attention" | "critical";

export interface NextActionInput {
  permissions: ReadonlySet<string>;
  canDecide: boolean;
  canSubmit: boolean;
  caseStatus: string;
  pendingApprovalRoleName: string | null;
  pendingApprovalDueAt: string | null;
  procurementDetail: ProcurementDetail | null;
  fulfilmentDetail: FulfilmentDetail | null;
  financeDetail: FinanceDetail | null;
  /** Injected, so the rule doesn't read the clock itself. */
  slaStatus: (dueAt: string) => { status: string } | null;
}

export function computeNextAction(input: NextActionInput): { message: string; tone: Tone } | null {
  const {
    permissions,
    canDecide,
    canSubmit,
    caseStatus,
    pendingApprovalRoleName,
    pendingApprovalDueAt,
    procurementDetail,
    fulfilmentDetail,
    financeDetail,
    slaStatus,
  } = input;
  const can = (key: string) => permissions.has(key);

  if (canSubmit && caseStatus === "returned") {
    return { message: "This request was returned for correction — edit it and submit again", tone: "attention" };
  }

  if (canDecide && pendingApprovalRoleName) {
    const sla = pendingApprovalDueAt ? slaStatus(pendingApprovalDueAt) : null;
    return {
      message: `Awaiting your approval as ${pendingApprovalRoleName}`,
      tone: sla?.status === "breached" ? "critical" : sla?.status === "warning" ? "attention" : "info",
    };
  }

  const invoice = financeDetail?.invoice;
  if (invoice && can("finance.invoice.approve")) {
    const openExceptions = invoice.exceptions.filter((e) => e.status === "open");
    if (openExceptions.length > 0) {
      return {
        message: `Invoice has ${openExceptions.length} unresolved match exception${openExceptions.length > 1 ? "s" : ""}`,
        tone: "attention",
      };
    }
    if (invoice.status === "matched") {
      return { message: `Invoice ${invoice.invoice_number} is matched and ready to approve`, tone: "info" };
    }
    // Approved but unpaid is a normal resting state, not something stuck:
    // payment is often run in a batch later rather than case by case. Say what
    // is true without implying the case cannot move on.
    if (invoice.status === "approved") {
      return {
        message: `Invoice ${invoice.invoice_number} is approved and awaiting payment — the case can move on meanwhile`,
        tone: "info",
      };
    }
  }

  const po = procurementDetail?.po;
  const settled = isTerminalStage(caseStatus);

  if (fulfilmentDetail && po && !settled) {
    const orderedTotal = po.items.reduce((sum, i) => sum + i.qty, 0);
    const receivedTotal = fulfilmentDetail.grns.reduce(
      (sum, g) => sum + g.items.reduce((s, i) => s + i.received_qty, 0),
      0,
    );
    if (receivedTotal < orderedTotal && can("receiving.grn.create")) {
      return { message: `Items pending receipt against ${po.po_number}`, tone: "info" };
    }
    // The step the flow never had. Goods are in, our side of the purchase
    // order is done, and nothing anywhere said an invoice was due — so a case
    // sat in Receiving until somebody happened to remember, and the invoice
    // that eventually arrived looked like it came from outside the process
    // rather than being its next step.
    if (receivedTotal >= orderedTotal && !invoice && can("finance.invoice.create")) {
      return {
        message: `Everything on ${po.po_number} has been received — the supplier's invoice is the next step`,
        tone: "info",
      };
    }
  }

  // Invoiced with nothing received. The three-way match raises this as an
  // exception, but only someone who can approve invoices ever sees that; for
  // everyone else the case simply appeared in Finance with no receipt behind
  // it, which is exactly how invoicing came to look detached from the flow.
  if (
    invoice &&
    invoice.status !== "paid" &&
    invoice.status !== "void" &&
    !settled &&
    fulfilmentDetail &&
    fulfilmentDetail.grns.length === 0
  ) {
    return {
      message: `Invoice ${invoice.invoice_number} was raised before anything was received — record the goods, or resolve it on the invoice`,
      tone: "attention",
    };
  }

  if (po?.status === "pending_approval" && can("procurement.po.approve")) {
    return { message: `Purchase order ${po.po_number} is awaiting your approval`, tone: "attention" };
  }

  const delivery = fulfilmentDetail?.delivery;
  if (delivery?.status === "dispatched" && can("delivery.complete")) {
    return { message: "Delivery is dispatched — confirm once received", tone: "info" };
  }

  return null;
}
