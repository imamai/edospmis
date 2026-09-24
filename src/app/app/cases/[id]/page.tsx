import { notFound } from "next/navigation";
import { requireSession } from "@/lib/data/session";
import { getCaseDetail } from "@/lib/data/cases";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WorkflowStepper } from "@/components/app/workflow-stepper";
import { formatDate, formatMoney, slaStatus } from "@/lib/utils";
import { ApprovalPanel } from "./approval-panel";
import { SubmitButton } from "./submit-button";

const STATUS_TONE = {
  draft: "neutral",
  submitted: "info",
  approval: "info",
  approved: "good",
  rejected: "critical",
  returned: "attention",
  cancelled: "neutral",
} as const;

const TERMINAL_LABEL: Record<string, string> = {
  rejected: "Rejected",
  returned: "Returned for correction",
  cancelled: "Cancelled",
};

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

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{c.case_number}</p>
          <h1 className="mt-0.5 text-xl font-semibold text-ink">{pr.title}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
            <Badge tone="neutral">{c.priority}</Badge>
            {clientName && <Badge tone="brand">{clientName}</Badge>}
          </div>
        </div>
        {canSubmit && <SubmitButton caseId={c.id} prId={pr.id} />}
      </div>

      <Card>
        <CardBody>
          <WorkflowStepper
            stages={stages.length > 0 ? stages : [{ key: "draft", label: "Draft" }]}
            currentKey={c.current_stage_key}
            terminal={
              c.status in TERMINAL_LABEL ? { key: c.status, label: TERMINAL_LABEL[c.status] } : null
            }
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
