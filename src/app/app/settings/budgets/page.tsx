import { Landmark, Wallet } from "lucide-react";
import { requireSession, can } from "@/lib/data/session";
import { getBudgetPeriods, getBudgetsWithStatus } from "@/lib/data/budgets";
import { getCategories, getPlacementOptions } from "@/lib/data/reference";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { placementLabel } from "@/lib/placement";
import { PeriodForm, BudgetLineForm } from "./budget-forms";
import { formatMoney, formatDate } from "@/lib/utils";

export default async function BudgetsPage() {
  const session = await requireSession();
  if (!can(session, "admin.org.manage")) {
    return (
      <div className="empty-frame mx-auto max-w-md px-6 py-10 text-center text-sm text-ink-faint">
        You don&rsquo;t have permission to manage budgets in this workspace.
      </div>
    );
  }

  const [periods, budgets, categories, placementOptions] = await Promise.all([
    getBudgetPeriods(session.tenant.id),
    getBudgetsWithStatus(session.tenant.id),
    getCategories(session.tenant.id),
    getPlacementOptions(session.tenant.id),
  ]);

  const totalAllocated = budgets.reduce((s, b) => s + b.status.allocated_cents, 0);
  const totalCommitted = budgets.reduce((s, b) => s + b.status.committed_cents, 0);
  const totalPending = budgets.reduce((s, b) => s + b.status.pending_cents, 0);
  const totalAvailable = budgets.reduce((s, b) => s + b.status.available_cents, 0);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Budgets</h1>
        <p className="mt-1 text-sm text-ink-faint">
          What each part of {session.tenant.name} has to spend, and how much of it is already
          spoken for. An approver sees this before they decide, not afterwards.
        </p>
      </div>

      {budgets.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Totals label="Allocated" value={formatMoney(totalAllocated)} />
          <Totals label="Committed on orders" value={formatMoney(totalCommitted)} />
          <Totals label="Approved, not yet ordered" value={formatMoney(totalPending)} />
          <Totals
            label="Available"
            value={formatMoney(totalAvailable)}
            tone={totalAvailable < 0 ? "critical" : "good"}
          />
        </div>
      )}

      <Card>
        <CardHeader
          title={`Budget lines (${budgets.length})`}
          subtitle="Available is what is allocated less what is already committed on orders and less what has been approved but not yet ordered. Money already paid sits inside a commitment and is never subtracted twice."
          icon={<Wallet className="h-4 w-4" />}
        />
        <CardBody className="overflow-x-auto">
          {budgets.length === 0 ? (
            <p className="text-sm text-ink-faint">
              No budget lines yet. Until there are, requests are approved on authority alone —
              nothing compares them to a balance.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-faint">
                  <th className="pb-2 pr-4 font-medium">Line</th>
                  <th className="pb-2 pr-4 font-medium">Period</th>
                  <th className="pb-2 pr-4 font-medium">Whose</th>
                  <th className="pb-2 pr-4 text-right font-medium">Allocated</th>
                  <th className="pb-2 pr-4 text-right font-medium">Committed</th>
                  <th className="pb-2 pr-4 text-right font-medium">Pending</th>
                  <th className="pb-2 text-right font-medium">Available</th>
                </tr>
              </thead>
              <tbody>
                {budgets.map((b) => (
                  <tr key={b.id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-4">
                      <span className="font-medium text-ink">{b.name}</span>
                      {b.code && <span className="ml-2 font-mono text-xs text-ink-faint">{b.code}</span>}
                    </td>
                    <td className="py-2 pr-4 text-ink-soft">{b.period_name}</td>
                    <td className="py-2 pr-4 text-ink-soft">{placementLabel(b, placementOptions)}</td>
                    <td className="py-2 pr-4 text-right tnum text-ink-soft">{formatMoney(b.status.allocated_cents)}</td>
                    <td className="py-2 pr-4 text-right tnum text-ink-soft">{formatMoney(b.status.committed_cents)}</td>
                    <td className="py-2 pr-4 text-right tnum text-ink-soft">
                      {b.status.pending_cents === 0 ? (
                        <span className="text-ink-faint">—</span>
                      ) : (
                        formatMoney(b.status.pending_cents)
                      )}
                    </td>
                    <td className="py-2 text-right tnum">
                      <span className={b.status.available_cents < 0 ? "font-semibold text-critical" : "text-good"}>
                        {formatMoney(b.status.available_cents)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="New budget line" icon={<Wallet className="h-4 w-4" />} />
        <CardBody className="max-w-3xl">
          <BudgetLineForm periods={periods} categories={categories} placementOptions={placementOptions} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={`Periods (${periods.length})`}
          subtitle="A budget is for a span of time. Close a period when it ends rather than deleting it — the history is what makes last year answerable."
          icon={<Landmark className="h-4 w-4" />}
        />
        <CardBody className="flex flex-col gap-5">
          {periods.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {periods.map((p) => (
                <Badge key={p.id} tone={p.is_open ? "good" : "neutral"}>
                  {p.name} · {formatDate(p.starts_on)} – {formatDate(p.ends_on)}
                </Badge>
              ))}
            </div>
          )}
          <div className="max-w-3xl">
            <PeriodForm />
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function Totals({ label, value, tone }: { label: string; value: string; tone?: "good" | "critical" }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <p className="text-xs font-medium text-ink-faint">{label}</p>
      <p
        className={`mt-0.5 truncate text-xl font-semibold tnum ${
          tone === "critical" ? "text-critical" : tone === "good" ? "text-good" : "text-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
