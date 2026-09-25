import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireSession, can } from "@/lib/data/session";
import { getContractDetail } from "@/lib/data/contracts";
import { documentResponse, type DocumentExport } from "@/lib/export/document";
import { formatDate } from "@/lib/utils";

const PARTY_ROLE_LABEL: Record<string, string> = {
  client_signer: "Client signer",
  tenant_signer: "Tenant signer",
  witness: "Witness",
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (!can(session, "legal.contract.view")) {
    return NextResponse.json({ error: "You don't have permission to view contracts." }, { status: 403 });
  }

  const detail = await getContractDetail(session.tenant.id, id);
  if (!detail) return NextResponse.json({ error: "Contract not found." }, { status: 404 });
  const { contract, parties, clientName } = detail;

  // Phase 3 deferred hashing to whenever this PDF was actually built — this
  // is that: a SHA-256 of the exact terms text in this file, so anyone can
  // confirm what they're holding still matches what EDOSPMIS has on record.
  const hash = createHash("sha256").update(contract.body, "utf8").digest("hex");

  const doc: DocumentExport = {
    tenantName: session.tenant.name,
    docType: contract.contract_type.replace(/_/g, " "),
    docNumber: contract.title,
    statusLabel: contract.status,
    fields: [
      { label: "Client", value: clientName ?? "—" },
      { label: "Requires witness", value: contract.requires_witness ? "Yes" : "No" },
      { label: "Sent", value: contract.sent_at ? formatDate(contract.sent_at) : "Not sent" },
      { label: "Fully signed", value: contract.signed_at ? formatDate(contract.signed_at) : "Not yet" },
    ],
    bodyTitle: "Terms",
    bodyText: contract.body,
    signatures: parties.map((p) => ({
      role: PARTY_ROLE_LABEL[p.party_role] ?? p.party_role,
      name: p.signed_name ? `${p.signed_name}${p.signed_title ? ` (${p.signed_title})` : ""}` : p.name,
      status: p.status,
      when: p.signed_at ? formatDate(p.signed_at) : null,
    })),
    signatureNote: parties.some((p) => p.consented_electronic)
      ? "Signatures above were captured electronically: each signer typed their full name, affirmatively consented to sign electronically, and had the timestamp (and, for external signers, IP address) recorded against their signature."
      : undefined,
    footerNote:
      contract.status === "void"
        ? `Voided${contract.voided_reason ? `: ${contract.voided_reason}` : "."} Content SHA-256: ${hash}`
        : `Content SHA-256: ${hash} — recompute this over the "Terms" text above to confirm this PDF matches EDOSPMIS's record.`,
  };

  return documentResponse(contract.title, doc);
}
