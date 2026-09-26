import { notFound } from "next/navigation";
import { requireSession, can } from "@/lib/data/session";
import { getCaseDetail } from "@/lib/data/cases";
import { getProcurementDetail, getSuppliers } from "@/lib/data/procurement";
import { getFulfilmentDetail } from "@/lib/data/fulfilment";
import { getFinanceDetail } from "@/lib/data/finance";
import { getStageDurations, getCurrentStageDueAt } from "@/lib/data/cases";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WorkflowStepper } from "@/components/app/workflow-stepper";
import { formatDate, formatMoney, slaStatus } from "@/lib/utils";
import { ApprovalPanel } from "./approval-panel";
import { SubmitButton } from "./submit-button";
import { StartProcurementButton } from "./start-procurement-button";
import { ProcurementPanel } from "./procurement-panel";
import { ReceivingPanel } from "./receiving-panel";
import { DeliveryPanel } from "./delivery-panel";
import { FinancePanel } from "./finance-panel";
import { StageTimingCard } from "./stage-timing-card";
import { HoldBlockedControls } from "./hold-blocked-controls";
import { CancelCaseButton } from "./cancel-case-button";
import { CloseCaseButton } from "./close-case-button";
import { CaseSummaryHeader } from "./case-summary-header";
import { NextActionBanner } from "./next-action-banner";
import { PANEL_STAGE_KEYS, isCurrentStage, STAGE_TONE, TERMINAL_LABEL } from "@/lib/stage-labels";

const TERMINAL_CASE_STATUSES = ["closed", "rejected", "returned", "cancelled"];

export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const detail = await getCaseDetail(session.tenant.id, id);
  if (!detail) notFound();

  const { case: c, pr, stages, approvals, clientName, requesterName, pendingTaskDueAt } = detail;
  const pendingApproval = approvals.find((a) => a.status === "pending");
  const myRoleIds = new Set(session.roles.map((r) => r.id));
  const canDecide = !!pendingApproval && myRoleIds.has(pendingApproval.role_id);
  const canSubmit = pr.status === "draft" && pr.requester_id === session.user.id;
  const sla = pendingApproval ? slaStatus(pendingTaskDueAt) : null;

  const showStartProcurement = c.status === "approved" && can(session, "procurement.rfq.create");
  const pastProcurement = ["procurement", "po_approval", "awarded", "receiving", "finance", "delivery", "closed"].includes(c.status);
  const procurementDetail = pastProcurement ? await getProcurementDetail(session.tenant.id, c.id) : null;
  const suppliers = c.status === "procurement" ? await getSuppliers(session.tenant.id) : [];

  const hasPO = !!procurementDetail?.po;
  const poIssued = hasPO && procurementDetail!.po!.status !== "pending_approval";
  const fulfilmentDetail = poIssued ? await getFulfilmentDetail(session.tenant.id, c.id) : null;
  const financeDetail = poIssued ? await getFinanceDetail(session.tenant.id, c.id) : null;
  const canClose = can(session, "procurement.case.close") && !TERMINAL_CASE_STATUSES.includes(c.status);
  const canCancel = can(session, "procurement.pr.cancel") && !TERMINAL_CASE_STATUSES.includes(c.status);
  const canHold = can(session, "procurement.case.hold") && !TERMINAL_CASE_STATUSES.includes(c.status);

  const stageDurations = await getStageDurations(session.tenant.id, c.id);
  const currentStage = stageDurations[stageDurations.length - 1];
  const currentStageDueAt = currentStage ? await getCurrentStageDueAt(session.tenant.id, c.current_stage_key, currentStage.entered_at) : null;
  const currentStageSla = currentStageDueAt ? slaStatus(currentStageDueAt) : null;
  const stageDateMap = Object.fromEntries(stageDurations.map((d) => [d.stage_key, d.entered_at]));

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <CaseSummaryHeader
        caseNumber={c.case_number}
        title={pr.title}
        requesterName={requesterName}
        amountCents={pr.estimated_cost_cents}
        currency={pr.currency}
        openedAt={c.opened_at}
        status={c.status}
        statusTone={STAGE_TONE[c.status] ?? "neutral"}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{c.case_number}</p>
          <h1 className="mt-0.5 text-xl font-semibold text-ink">{pr.title}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Badge tone={STAGE_TONE[c.status] ?? "neutral"}>{c.status}</Badge>
            <Badge tone="neutral">{c.priority}</Badge>
            {clientName && <Badge tone="brand">{clientName}</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canSubmit && <SubmitButton caseId={c.id} prId={pr.id} />}
          {showStartProcurement && <StartProcurementButton caseId={c.id} />}
          {canClose && (
            <CloseCaseButton
              caseId={c.id}
              nudge={
                clientName && fulfilmentDetail && !fulfilmentDetail.delivery?.client_confirmed_at
                  ? "Delivery isn't confirmed yet — you can still close if this case doesn't need one."
                  : financeDetail?.invoice && financeDetail.invoice.status !== "paid"
                    ? "Payment hasn't been recorded yet — you can still close if this case doesn't need it."
                    : null
              }
            />
          )}
          {canCancel && <CancelCaseButton caseId={c.id} />}
        </div>
      </div>

      <NextActionBanner
        session={session}
        canDecide={canDecide}
        pendingApprovalRoleName={pendingApproval?.role_name ?? null}
        pendingApprovalDueAt={pendingTaskDueAt}
        procurementDetail={procurementDetail}
        fulfilmentDetail={fulfilmentDetail}
        financeDetail={financeDetail}
      />

      {canHold && (
        <HoldBlockedControls caseId={c.id} onHold={c.on_hold} onHoldReason={c.on_hold_reason} blocked={c.blocked} blockedReason={c.blocked_reason} />
      )}
      {!canHold && (c.on_hold || c.blocked) && (
        <div className="flex flex-col gap-1.5">
          {c.on_hold && (
            <p className="rounded-lg border border-attention/30 bg-attention-soft px-3 py-2 text-sm text-attention">
              On hold{c.on_hold_reason ? ` — ${c.on_hold_reason}` : ""}
            </p>
          )}
          {c.blocked && (
            <p className="rounded-lg border border-critical/30 bg-critical-soft px-3 py-2 text-sm text-critical">
              Blocked{c.blocked_reason ? ` — ${c.blocked_reason}` : ""}
            </p>
          )}
        </div>
      )}

      <Card>
        <CardBody>
          <WorkflowStepper
            stages={stages.length > 0 ? stages : [{ key: "draft", label: "Draft" }]}
            currentKey={c.current_stage_key}
            terminal={
              c.status in TERMINAL_LABEL ? { key: c.status, label: TERMINAL_LABEL[c.status] } : null
            }
            stageDates={stageDateMap}
          />
        </CardBody>
      </Card>

      {canDecide && pendingApproval && (
        <ApprovalPanel approvalId={pendingApproval.id} caseId={c.id} roleName={pendingApproval.role_name} />
      )}

      <Card>
        <CardHeader title="Request" subtitle={requesterName ? `Raised by ${requesterName}` : undefined} />
        <CardBody className="flex flex-col gap-4">
          {pr.justification && <p className="text-sm text-ink-soft">{pr.justification}</p>}
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs text-ink-faint">Estimated cost</p>
              <p className="font-medium tnum text-ink">{formatMoney(pr.estimated_cost_cents, { currency: pr.currency })}</p>
            </div>
            <div>
              <p className="text-xs text-ink-faint">Required by</p>
              <p className="font-medium text-ink">{formatDate(pr.required_by)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-faint">Opened</p>
              <p className="font-medium text-ink">{formatDate(c.opened_at)}</p>
            </div>
          </div>

          {pr.items.length > 0 && (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-faint">
                  <th className="pb-2 pr-4 font-medium">Item</th>
                  <th className="pb-2 pr-4 font-medium">Qty</th>
                  <th className="pb-2 font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {pr.items.map((item, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="py-2 pr-4 text-ink">{item.description}</td>
                    <td className="py-2 pr-4 tnum text-ink-soft">
                      {item.qty} {item.unit}
                    </td>
                    <td className="py-2 tnum text-ink-soft">
                      {formatMoney(item.qty * item.estimated_unit_cost_cents, { currency: pr.currency })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      {approvals.length > 0 && (
        <Card>
          <CardHeader title="Approval history" />
          <CardBody className="flex flex-col divide-y divide-line">
            {approvals.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium text-ink">{a.role_name}</p>
                  {a.decided_by_name && <p className="text-xs text-ink-faint">{a.decided_by_name}</p>}
                  {a.comment && <p className="mt-0.5 text-xs text-ink-soft">&ldquo;{a.comment}&rdquo;</p>}
                </div>
                <div className="text-right">
                  <Badge
                    tone={
                      a.status === "approved"
                        ? "good"
                        : a.status === "rejected"
                          ? "critical"
                          : a.status === "returned"
                            ? "attention"
                            : "neutral"
                    }
                  >
                    {a.status}
                  </Badge>
                  {a.decided_at && <p className="mt-1 text-xs text-ink-faint">{formatDate(a.decided_at)}</p>}
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {procurementDetail && (
        <ProcurementPanel
          detail={procurementDetail}
          suppliers={suppliers}
          canInvite={can(session, "procurement.rfq.send")}
          canAward={can(session, "procurement.po.issue")}
          canApprovePO={can(session, "procurement.po.approve")}
          emphasize={isCurrentStage(PANEL_STAGE_KEYS.procurement, c.current_stage_key)}
        />
      )}

      {poIssued && fulfilmentDetail && (
        <ReceivingPanel
          caseId={c.id}
          poItems={procurementDetail!.po!.items}
          detail={fulfilmentDetail}
          canRecord={can(session, "receiving.grn.create")}
          canInspect={can(session, "receiving.grn.approve")}
          emphasize={isCurrentStage(PANEL_STAGE_KEYS.receiving, c.current_stage_key)}
        />
      )}

      {poIssued && financeDetail && (
        <FinancePanel
          caseId={c.id}
          poItems={procurementDetail!.po!.items}
          currency={procurementDetail!.po!.currency}
          detail={financeDetail}
          canSubmit={can(session, "finance.invoice.create")}
          canApprove={can(session, "finance.invoice.approve")}
          canRecordPayment={can(session, "finance.payment.approve")}
          emphasize={isCurrentStage(PANEL_STAGE_KEYS.finance, c.current_stage_key)}
        />
      )}

      {/* Delivery is outbound (this tenant -> its own client) — irrelevant
          to a purely internal requisition, so it only shows up once a case
          actually has a client attached. */}
      {clientName && poIssued && fulfilmentDetail && (
        <DeliveryPanel
          caseId={c.id}
          delivery={fulfilmentDetail.delivery}
          canAssign={can(session, "delivery.assign")}
          canDispatch={can(session, "delivery.dispatch")}
          canComplete={can(session, "delivery.complete")}
          emphasize={isCurrentStage(PANEL_STAGE_KEYS.delivery, c.current_stage_key)}
        />
      )}

      <StageTimingCard durations={stageDurations} />

      {currentStageSla && currentStageSla.status !== "none" && (
        <p
          className={
            currentStageSla.status === "breached"
              ? "text-xs text-critical"
              : currentStageSla.status === "warning"
                ? "text-xs text-attention"
                : "text-xs text-ink-faint"
          }
        >
          Current stage SLA: {currentStageSla.label}
        </p>
      )}

      {sla && sla.status !== "none" && (
        <p
          className={
            sla.status === "breached" ? "text-xs text-critical" : sla.status === "warning" ? "text-xs text-attention" : "text-xs text-ink-faint"
          }
        >
          SLA: {sla.label}
        </p>
      )}
    </div>
  );
}
