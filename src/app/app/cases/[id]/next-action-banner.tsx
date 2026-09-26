import { Info, AlertTriangle, AlertOctagon } from "lucide-react";
import { can, type SessionContext } from "@/lib/data/session";
import { slaStatus } from "@/lib/utils";
import type { ProcurementDetail } from "@/lib/data/procurement";
import type { FulfilmentDetail } from "@/lib/data/fulfilment";
import type { FinanceDetail } from "@/lib/data/finance";

type Tone = "info" | "attention" | "critical";

const TONE_CLASS: Record<Tone, string> = {
  info: "border-info/30 bg-info-soft text-info",
  attention: "border-attention/30 bg-attention-soft text-attention",
  critical: "border-critical/30 bg-critical-soft text-critical",
};

const TONE_ICON: Record<Tone, typeof Info> = {
  info: Info,
  attention: AlertTriangle,
  critical: AlertOctagon,
};

export interface NextActionInput {
  session: SessionContext;
  canDecide: boolean;
  pendingApprovalRoleName: string | null;
  pendingApprovalDueAt: string | null;
  procurementDetail: ProcurementDetail | null;
  fulfilmentDetail: FulfilmentDetail | null;
  financeDetail: FinanceDetail | null;
}

function computeNextAction(input: NextActionInput): { message: string; tone: Tone } | null {
  const { session, canDecide, pendingApprovalRoleName, pendingApprovalDueAt, procurementDetail, fulfilmentDetail, financeDetail } = input;

  if (canDecide && pendingApprovalRoleName) {
    const sla = pendingApprovalDueAt ? slaStatus(pendingApprovalDueAt) : null;
    return {
      message: `Awaiting your approval as ${pendingApprovalRoleName}`,
      tone: sla?.status === "breached" ? "critical" : sla?.status === "warning" ? "attention" : "info",
    };
  }

  const invoice = financeDetail?.invoice;
  if (invoice && can(session, "finance.invoice.approve")) {
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
  }

  const po = procurementDetail?.po;
  if (fulfilmentDetail && po && can(session, "receiving.grn.create")) {
    const orderedTotal = po.items.reduce((sum, i) => sum + i.qty, 0);
    const receivedTotal = fulfilmentDetail.grns.reduce(
      (sum, g) => sum + g.items.reduce((s, i) => s + i.received_qty, 0),
      0,
    );
    if (receivedTotal < orderedTotal) {
      return { message: `Items pending receipt against ${po.po_number}`, tone: "info" };
    }
  }

  if (po?.status === "pending_approval" && can(session, "procurement.po.approve")) {
    return { message: `Purchase order ${po.po_number} is awaiting your approval`, tone: "attention" };
  }

  const delivery = fulfilmentDetail?.delivery;
  if (delivery?.status === "dispatched" && can(session, "delivery.complete")) {
    return { message: "Delivery is dispatched — confirm once received", tone: "info" };
  }

  return null;
}

export function NextActionBanner(input: NextActionInput) {
  const result = computeNextAction(input);
  if (!result) return null;
  const Icon = TONE_ICON[result.tone];

  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm ${TONE_CLASS[result.tone]}`}>
      <Icon className="h-4 w-4 shrink-0" />
      {result.message}
    </div>
  );
}
