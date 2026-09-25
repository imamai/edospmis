import { notFound } from "next/navigation";
import { requireSession, can } from "@/lib/data/session";
import { getContractDetail } from "@/lib/data/contracts";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { ContractPanel } from "./contract-panel";

const STATUS_TONE = {
  draft: "neutral",
  sent: "info",
  signed: "good",
  void: "critical",
} as const;

export default async function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const detail = await getContractDetail(session.tenant.id, id);
  if (!detail) notFound();

  const { contract, parties, clientName } = detail;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 lg:max-w-5xl">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
          {contract.contract_type.replace("_", " ")}
        </p>
        <h1 className="mt-0.5 text-xl font-semibold text-ink">{contract.title}</h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONE[contract.status]}>{contract.status}</Badge>
          {contract.requires_witness && <Badge tone="attention">Requires witness</Badge>}
          {clientName && <Badge tone="brand">{clientName}</Badge>}
        </div>
        {contract.status === "void" && contract.voided_reason && (
          <p className="mt-2 text-sm text-critical">Voided: {contract.voided_reason}</p>
        )}
        {contract.signed_at && <p className="mt-2 text-xs text-good">Fully signed {formatDate(contract.signed_at)}</p>}
      </div>

      <ContractPanel
        contract={contract}
        parties={parties}
        canEdit={can(session, "legal.contract.edit")}
        canSend={can(session, "legal.contract.send")}
        canVoid={can(session, "legal.contract.void")}
      />
    </div>
  );
}
