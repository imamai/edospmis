"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import {
  addContractParty,
  recordContractSignature,
  removeContractParty,
  sendContract,
  updateContractBody,
  voidContract,
} from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SelectInput, TextArea, TextInput } from "@/components/ui/field";
import { formatDate } from "@/lib/utils";
import type { Contract, ContractParty, ContractPartyRole } from "@/lib/database.types";

const PARTY_LABEL: Record<ContractPartyRole, string> = {
  client_signer: "Client signer",
  tenant_signer: "Countersigner",
  witness: "Witness",
};

export function ContractPanel({
  contract,
  parties,
  canEdit,
  canSend,
  canVoid,
}: {
  contract: Contract;
  parties: ContractParty[];
  canEdit: boolean;
  canSend: boolean;
  canVoid: boolean;
}) {
  const router = useRouter();
  const isDraft = contract.status === "draft";
  const isSent = contract.status === "sent";

  const [body, setBody] = useState(contract.body);
  const [bodyPending, startBody] = useTransition();
  const [bodyMsg, setBodyMsg] = useState<string | null>(null);

  const [partyRole, setPartyRole] = useState<ContractPartyRole>("client_signer");
  const [partyName, setPartyName] = useState("");
  const [partyEmail, setPartyEmail] = useState("");
  const [partyPending, startParty] = useTransition();
  const [partyError, setPartyError] = useState<string | null>(null);

  const [sendPending, startSend] = useTransition();
  const [sendError, setSendError] = useState<string | null>(null);

  const [signPending, startSign] = useTransition();

  const [voiding, setVoiding] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voidPending, startVoid] = useTransition();
  const [voidError, setVoidError] = useState<string | null>(null);

  function saveBody() {
    startBody(async () => {
      const result = await updateContractBody(contract.id, body);
      setBodyMsg(result.error ?? "Saved.");
      router.refresh();
    });
  }

  function addParty() {
    startParty(async () => {
      const result = await addContractParty(contract.id, partyRole, partyName, partyEmail);
      if (result.error) setPartyError(result.error);
      else {
        setPartyError(null);
        setPartyName("");
        setPartyEmail("");
        router.refresh();
      }
    });
  }

  function removeParty(partyId: string) {
    startParty(async () => {
      await removeContractParty(contract.id, partyId);
      router.refresh();
    });
  }

  function send() {
    startSend(async () => {
      const result = await sendContract(contract.id);
      if (result.error) setSendError(result.error);
      else router.refresh();
    });
  }

  function sign(partyId: string) {
    startSign(async () => {
      await recordContractSignature(contract.id, partyId);
      router.refresh();
    });
  }

  function confirmVoid() {
    startVoid(async () => {
      const result = await voidContract(contract.id, voidReason);
      if (result.error) setVoidError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title="Contract text" />
        <CardBody className="flex flex-col gap-3">
          {isDraft && canEdit ? (
            <>
              <TextArea label="" name="body" rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
              <div className="flex items-center gap-2">
                <Button size="sm" busy={bodyPending} onClick={saveBody}>
                  Save
                </Button>
                {bodyMsg && <p className="text-xs text-ink-faint">{bodyMsg}</p>}
              </div>
            </>
          ) : (
            <p className="whitespace-pre-wrap text-sm text-ink-soft">{contract.body || "(no text)"}</p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Signing parties" />
        <CardBody className="flex flex-col gap-4">
          {parties.length === 0 ? (
            <p className="text-sm text-ink-faint">No parties added yet.</p>
          ) : (
            <div className="flex flex-col divide-y divide-line">
              {parties.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {p.name} <span className="font-normal text-ink-faint">— {PARTY_LABEL[p.party_role]}</span>
                    </p>
                    {p.email && <p className="text-xs text-ink-faint">{p.email}</p>}
                    {p.signed_at && <p className="text-xs text-good">Signed {formatDate(p.signed_at)}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={p.status === "signed" ? "good" : "neutral"}>{p.status}</Badge>
                    {isSent && canSend && p.status === "pending" && (
                      <Button size="sm" variant="secondary" busy={signPending} onClick={() => sign(p.id)}>
                        Record signature
                      </Button>
                    )}
                    {isDraft && canEdit && (
                      <button
                        type="button"
                        onClick={() => removeParty(p.id)}
                        aria-label="Remove party"
                        className="rounded-md p-1.5 text-ink-faint hover:bg-surface-sunk hover:text-critical"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {isDraft && canEdit && (
            <div className="flex flex-col gap-3 rounded-lg border border-line p-3 sm:flex-row sm:items-end">
              <SelectInput
                label="Role"
                value={partyRole}
                onChange={(e) => setPartyRole(e.target.value as ContractPartyRole)}
                className="sm:w-40"
              >
                <option value="client_signer">Client signer</option>
                <option value="tenant_signer">Countersigner</option>
                <option value="witness">Witness</option>
              </SelectInput>
              <TextInput label="Name" value={partyName} onChange={(e) => setPartyName(e.target.value)} className="flex-1" />
              <TextInput label="Email" value={partyEmail} onChange={(e) => setPartyEmail(e.target.value)} hint="Optional" className="flex-1" />
              <Button size="sm" busy={partyPending} onClick={addParty}>
                Add
              </Button>
            </div>
          )}
          {partyError && <p className="text-xs text-critical">{partyError}</p>}
        </CardBody>
      </Card>

      {(isDraft || isSent) && (canSend || canVoid) && (
        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {isDraft && canSend && (
                <Button busy={sendPending} onClick={send} disabled={parties.length === 0}>
                  Send for signature
                </Button>
              )}
              {sendError && <p className="text-xs text-critical">{sendError}</p>}
            </div>
            {canVoid &&
              (voiding ? (
                <div className="flex flex-1 items-end gap-2">
                  <TextInput
                    label="Reason"
                    value={voidReason}
                    onChange={(e) => setVoidReason(e.target.value)}
                    className="flex-1"
                    autoFocus
                  />
                  <Button variant="danger" size="sm" busy={voidPending} onClick={confirmVoid}>
                    Confirm void
                  </Button>
                  <button type="button" onClick={() => setVoiding(false)} className="text-sm font-semibold text-ink-faint hover:text-ink">
                    Cancel
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setVoiding(true)} className="text-sm font-semibold text-ink-faint hover:text-critical">
                  Void contract
                </button>
              ))}
          </CardBody>
          {voidError && (
            <CardBody className="pt-0">
              <p className="text-xs text-critical">{voidError}</p>
            </CardBody>
          )}
        </Card>
      )}
    </div>
  );
}
