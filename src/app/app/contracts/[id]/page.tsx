import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { requireSession, can } from "@/lib/data/session";
import { getContractDetail } from "@/lib/data/contracts";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { PdfLinkButton } from "@/components/ui/pdf-link-button";
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

  const { contract, parties, clientName, events } = detail;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              {contract.contract_type.replace("_", " ")}
            </p>
            <h1 className="mt-0.5 text-xl font-semibold text-ink">{contract.title}</h1>
          </div>
          <PdfLinkButton
            href={`/api/export/contract/${contract.id}`}
            filename={contract.title}
            title={contract.title}
            className={buttonClass({ variant: "secondary", size: "sm" })}
          >
            <FileText className="h-4 w-4" />
            Open PDF
          </PdfLinkButton>
        </div>
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
        events={events}
        canEdit={can(session, "legal.contract.edit")}
        canSend={can(session, "legal.contract.send")}
        canVoid={can(session, "legal.contract.void")}
        defaultSignerName={session.user.full_name ?? session.user.email}
        savedSignature={session.user.signature_image}
      />
    </div>
  );
}
