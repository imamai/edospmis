import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";
import { requireSession, can } from "@/lib/data/session";
import { getMyWork } from "@/lib/data/cases";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { formatMoney, slaStatus } from "@/lib/utils";

export default async function HomePage() {
  const session = await requireSession();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = session.user.full_name?.split(" ")[0] ?? "there";

  const roleIds = session.roles.map((r) => r.id);
  const myWork = await getMyWork(session.tenant.id, roleIds);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 lg:max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">
            {greeting}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-ink-faint">
            {myWork.length > 0
              ? `${myWork.length} request${myWork.length === 1 ? "" : "s"} waiting on your decision.`
              : `You're all caught up in ${session.tenant.name}.`}
          </p>
        </div>
        {can(session, "procurement.pr.create") && (
          <ButtonLink href="/app/prs/new" size="sm" variant="secondary">
            <Plus className="h-4 w-4" />
            New request
          </ButtonLink>
        )}
      </div>

      <Card>
        <CardHeader title="My Work" subtitle="Requests and approvals assigned to you" icon={<ClipboardList className="h-4 w-4" />} />
        <CardBody>
          {myWork.length === 0 ? (
            <div className="empty-frame flex flex-col items-center gap-2 px-6 py-10 text-center">
              <p className="text-sm font-medium text-ink">Nothing waiting on you</p>
              <p className="max-w-sm text-xs text-ink-faint">
                Any request routed to a role you hold shows up here the moment it needs your decision.
              </p>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-line">
              {myWork.map((item) => {
                const sla = slaStatus(item.due_at);
                return (
                  <Link
                    key={item.approval_id}
                    href={`/app/cases/${item.case_id}`}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 hover:bg-surface-sunk -mx-1 px-1 rounded-lg"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{item.pr_title}</p>
                      <p className="text-xs text-ink-faint">
                        {item.case_number} · {formatMoney(item.estimated_cost_cents, { currency: item.currency })} · as {item.role_name}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <Badge tone={item.priority === "urgent" || item.priority === "high" ? "attention" : "neutral"}>
                        {item.priority}
                      </Badge>
                      {sla.status !== "none" && (
                        <p className={`mt-1 text-xs ${sla.status === "breached" ? "text-critical" : sla.status === "warning" ? "text-attention" : "text-ink-faint"}`}>
                          {sla.label}
                        </p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>

      <div className="flex flex-wrap gap-2">
        {session.roles.map((r) => (
          <Badge key={r.id} tone="brand">
            {r.name}
          </Badge>
        ))}
      </div>
    </div>
  );
}
