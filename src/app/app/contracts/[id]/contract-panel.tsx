"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Copy, Mail, Check, AlertTriangle } from "lucide-react";
import {
  addContractParty,
  removeContractParty,
  sendContract,
  shareContractLink,
  signAsTenant,
  updateContractBody,
  voidContract,
} from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckboxRow, SelectInput, TextArea, TextInput } from "@/components/ui/field";
import { SignaturePad } from "@/components/ui/signature-pad";
import { formatDate } from "@/lib/utils";
import type { Contract, ContractEvent, ContractParty, ContractPartyRole, ContractPartyStatus } from "@/lib/database.types";

const PARTY_LABEL: Record<ContractPartyRole, string> = {
  client_signer: "Client signer",
  tenant_signer: "Countersigner",
  witness: "Witness",
};

const STATUS_TONE: Record<ContractPartyStatus, "neutral" | "info" | "good" | "critical"> = {
  pending: "neutral",
  viewed: "info",
  signed: "good",
  declined: "critical",
};

export function ContractPanel({
  contract,
  parties,
  events,
  canEdit,
  canSend,
  canVoid,
  defaultSignerName,
  savedSignature,
}: {
  contract: Contract;
  parties: ContractParty[];
  events: ContractEvent[];
  canEdit: boolean;
  canSend: boolean;
  canVoid: boolean;
  defaultSignerName: string;
  savedSignature: string | null;
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
  const [partyPhone, setPartyPhone] = useState("");
  const [partyPending, startParty] = useTransition();
  const [partyError, setPartyError] = useState<string | null>(null);

  const [sendPending, startSend] = useTransition();
  const [sendError, setSendError] = useState<string | null>(null);

  const [signingPartyId, setSigningPartyId] = useState<string | null>(null);
  const [signName, setSignName] = useState(defaultSignerName);
  const [signTitle, setSignTitle] = useState("");
  const [signConsented, setSignConsented] = useState(false);
  const [signImage, setSignImage] = useState<string | null>(savedSignature);
  const [redrawing, setRedrawing] = useState(!savedSignature);
  const [signPending, startSign] = useTransition();
  const [signError, setSignError] = useState<string | null>(null);

  const [shareMsg, setShareMsg] = useState<Record<string, { text: string; error: boolean }>>({});
  const [sharePending, startShare] = useTransition();

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
      const result = await addContractParty(contract.id, partyRole, partyName, partyEmail, partyPhone);
      if (result.error) setPartyError(result.error);
      else {
        setPartyError(null);
        setPartyName("");
        setPartyEmail("");
        setPartyPhone("");
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

  function submitTenantSignature() {
    if (!signImage) {
      setSignError("Draw or upload your signature before continuing.");
      return;
    }
    startSign(async () => {
      const result = await signAsTenant(contract.id, signingPartyId!, signName, signTitle, signConsented, signImage);
      if (result.error) setSignError(result.error);
      else {
        setSigningPartyId(null);
        setSignError(null);
        router.refresh();
      }
    });
  }

  function copyLink(token: string, partyId: string) {
    const link = `${process.env.NEXT_PUBLIC_SITE_URL}/sign/${token}`;
    navigator.clipboard.writeText(link).then(() => {
      setShareMsg((m) => ({ ...m, [partyId]: { text: "Copied.", error: false } }));
      setTimeout(() => setShareMsg((m) => ({ ...m, [partyId]: { text: "", error: false } })), 2000);
    });
  }

  function emailLink(partyId: string) {
    startShare(async () => {
      const result = await shareContractLink(contract.id, partyId);
      setShareMsg((m) => ({ ...m, [partyId]: { text: result.error ?? result.ok ?? "", error: Boolean(result.error) } }));
    });
  }

  function whatsappHref(token: string, phone: string) {
    const link = `${process.env.NEXT_PUBLIC_SITE_URL}/sign/${token}`;
    const text = encodeURIComponent(`Please review and sign: ${contract.title}\n${link}`);
    const digits = phone.replace(/[^\d+]/g, "");
    return `https://wa.me/${digits.replace(/^\+/, "")}?text=${text}`;
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
        <CardHeader title="Signing parties" subtitle="Signing order: client/witness first, then the countersigner" />
        <CardBody className="flex flex-col gap-4">
          {parties.length === 0 ? (
            <p className="text-sm text-ink-faint">No parties added yet.</p>
          ) : (
            <div className="flex flex-col divide-y divide-line">
              {parties.map((p) => (
                <div key={p.id} className="flex flex-col gap-2 py-3 first:pt-0">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-ink">
                        {p.name} <span className="font-normal text-ink-faint">— {PARTY_LABEL[p.party_role]}</span>
                      </p>
                      {p.email && <p className="text-xs text-ink-faint">{p.email}</p>}
                      {p.signed_at && (
                        <p className="text-xs text-good">
                          Signed {formatDate(p.signed_at)} as &ldquo;{p.signed_name}&rdquo;{p.signed_title ? `, ${p.signed_title}` : ""}
                        </p>
                      )}
                      {p.status === "declined" && (
                        <p className="text-xs text-critical">Declined{p.decline_reason ? `: ${p.decline_reason}` : ""}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge>
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

                  {p.party_role === "tenant_signer" && p.status !== "signed" && canSend && (
                    <div className="rounded-lg border border-line bg-surface-sunk p-3">
                      {signingPartyId === p.id ? (
                        <div className="flex flex-col gap-3">
                          <TextInput label="Your full name" value={signName} onChange={(e) => setSignName(e.target.value)} hint=" " />
                          <TextInput label="Title / position" value={signTitle} onChange={(e) => setSignTitle(e.target.value)} hint="Optional" />
                          <div>
                            <p className="mb-1.5 text-sm font-medium text-ink">Signature</p>
                            {signImage && !redrawing ? (
                              <div className="flex flex-col gap-1.5">
                                <div className="flex h-[90px] w-full max-w-sm items-center rounded-lg border border-line-strong bg-white p-2">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={signImage} alt="Your signature" className="max-h-full max-w-full object-contain" />
                                </div>
                                <button type="button" onClick={() => setRedrawing(true)} className="self-start text-xs font-semibold text-ink-faint hover:text-brand">
                                  Use a different signature
                                </button>
                              </div>
                            ) : (
                              <SignaturePad onChange={setSignImage} className="max-w-sm" />
                            )}
                          </div>
                          <CheckboxRow
                            label="I agree to sign this electronically"
                            checked={signConsented}
                            onChange={(e) => setSignConsented(e.target.checked)}
                          />
                          {signError && <p className="text-xs text-critical">{signError}</p>}
                          <div className="flex items-center gap-2">
                            <Button size="sm" busy={signPending} onClick={submitTenantSignature}>
                              Sign & continue
                            </Button>
                            <button type="button" onClick={() => setSigningPartyId(null)} className="text-sm font-semibold text-ink-faint hover:text-ink">
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => setSigningPartyId(p.id)}>
                          Sign as countersigner
                        </Button>
                      )}
                    </div>
                  )}

                  {p.party_role !== "tenant_signer" && p.access_token && p.status !== "signed" && p.status !== "declined" && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="secondary" onClick={() => copyLink(p.access_token!, p.id)}>
                        <Copy className="h-3.5 w-3.5" />
                        Copy link
                      </Button>
                      {p.email && (
                        <Button size="sm" variant="secondary" busy={sharePending} onClick={() => emailLink(p.id)}>
                          <Mail className="h-3.5 w-3.5" />
                          Email
                        </Button>
                      )}
                      {p.phone && (
                        <a
                          href={whatsappHref(p.access_token, p.phone)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong px-3 text-sm font-medium text-ink hover:border-brand hover:text-brand"
                        >
                          WhatsApp
                        </a>
                      )}
                      {shareMsg[p.id]?.text && (
                        <span className={`inline-flex items-center gap-1 text-xs ${shareMsg[p.id].error ? "text-critical" : "text-ink-faint"}`}>
                          {shareMsg[p.id].error ? <AlertTriangle className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                          {shareMsg[p.id].text}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {isDraft && canEdit && (
            <div className="flex flex-col gap-3 rounded-lg border border-line p-3 sm:flex-row sm:items-end sm:flex-wrap">
              <SelectInput
                label="Role"
                value={partyRole}
                onChange={(e) => setPartyRole(e.target.value as ContractPartyRole)}
                hint=" "
                className="sm:w-40"
              >
                <option value="client_signer">Client signer</option>
                <option value="tenant_signer">Countersigner</option>
                <option value="witness">Witness</option>
              </SelectInput>
              <TextInput label="Name" value={partyName} onChange={(e) => setPartyName(e.target.value)} hint=" " className="flex-1" />
              <TextInput label="Email" value={partyEmail} onChange={(e) => setPartyEmail(e.target.value)} hint="Optional" className="flex-1" />
              <TextInput
                label="Phone"
                value={partyPhone}
                onChange={(e) => setPartyPhone(e.target.value)}
                hint="Optional, for WhatsApp"
                className="flex-1"
              />
              <Button size="sm" busy={partyPending} onClick={addParty}>
                Add
              </Button>
            </div>
          )}
          {partyError && <p className="text-xs text-critical">{partyError}</p>}
        </CardBody>
      </Card>

      {events.length > 0 && (
        <Card>
          <CardHeader title="Activity" />
          <CardBody>
            <div className="flex flex-col gap-2">
              {events.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-3 text-sm">
                  <p className="text-ink-soft">
                    <span className="font-medium text-ink">{e.event_type}</span>
                    {e.actor_label ? ` — ${e.actor_label}` : ""}
                  </p>
                  <span className="shrink-0 text-xs text-ink-faint">{formatDate(e.occurred_at)}</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

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
