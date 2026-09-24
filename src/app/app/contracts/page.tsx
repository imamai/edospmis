import Link from "next/link";
import { Plus } from "lucide-react";
import { requireSession, can } from "@/lib/data/session";
import { getContracts } from "@/lib/data/contracts";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

const STATUS_TONE = {
  draft: "neutral",
  sent: "info",
  signed: "good",
  void: "critical",
} as const;

export default async function ContractsPage() {
  const session = await requireSession();
  const contracts = await getContracts(session.tenant.id);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Contracts</h1>
          <p className="mt-1 text-sm text-ink-faint">Drafted, sent and signed on behalf of {session.tenant.name}.</p>
        </div>
        {can(session, "legal.contract.create") && (
          <ButtonLink href="/app/contracts/new" size="sm">
            <Plus className="h-4 w-4" />
            New contract
          </ButtonLink>
        )}
      </div>

      {contracts.length === 0 ? (
        <div className="empty-frame px-6 py-10 text-center text-sm text-ink-faint">No contracts yet.</div>
      ) : (
        <Card>
          <CardBody className="flex flex-col divide-y divide-line">
            {contracts.map((c) => (
              <Link
                key={c.id}
                href={`/app/contracts/${c.id}`}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 hover:bg-surface-sunk -mx-1 px-1 rounded-lg"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{c.title}</p>
                  <p className="text-xs text-ink-faint">
                    {c.client_name ?? "No client set"} · {c.contract_type.replace("_", " ")} · {formatDate(c.created_at)}
                  </p>
                </div>
                <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
              </Link>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
