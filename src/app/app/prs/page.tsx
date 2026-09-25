import Link from "next/link";
import { Plus } from "lucide-react";
import { requireSession, can } from "@/lib/data/session";
import { getMyPRs } from "@/lib/data/cases";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { formatMoney } from "@/lib/utils";

const STATUS_TONE = {
  draft: "neutral",
  submitted: "info",
  approval: "info",
  approved: "good",
  rejected: "critical",
  returned: "attention",
  cancelled: "neutral",
} as const;

export default async function MyRequestsPage() {
  const session = await requireSession();
  const rows = await getMyPRs(session.tenant.id, session.user.id);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">My requests</h1>
          <p className="mt-1 text-sm text-ink-faint">Every purchase requisition you&rsquo;ve raised.</p>
        </div>
        {can(session, "procurement.pr.create") && (
          <ButtonLink href="/app/prs/new" size="sm">
            <Plus className="h-4 w-4" />
            New request
          </ButtonLink>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="empty-frame px-6 py-10 text-center text-sm text-ink-faint">
          You haven&rsquo;t raised any requests yet.
        </div>
      ) : (
        <Card>
          <CardBody className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-faint">
                  <th className="pb-2 pr-4 font-medium">Case</th>
                  <th className="pb-2 pr-4 font-medium">Title</th>
                  <th className="pb-2 pr-4 font-medium">Amount</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ pr, case: c }) => (
                  <tr key={pr.id} className="border-b border-line last:border-0">
                    <td className="py-3 pr-4">
                      <Link href={`/app/cases/${pr.case_id}`} className="font-medium text-brand hover:underline">
                        {c?.case_number ?? "—"}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-ink">{pr.title}</td>
                    <td className="py-3 pr-4 tnum text-ink-soft">{formatMoney(pr.estimated_cost_cents, { currency: pr.currency })}</td>
                    <td className="py-3">
                      <Badge tone={STATUS_TONE[pr.status]}>{pr.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
