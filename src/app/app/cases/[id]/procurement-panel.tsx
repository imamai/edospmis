"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Copy, Mail, Check, AlertTriangle, ShoppingCart } from "lucide-react";
import {
  inviteSupplierToRfq,
  inviteProspectToRfq,
  shareRfqInviteLink,
  recordQuotation,
  awardPO,
  approvePO,
  type ProcurementState,
} from "../../procurement/actions";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NumberInput, SelectInput, TextArea, TextInput } from "@/components/ui/field";
import { Modal, ModalFormActions } from "@/components/ui/modal";
import { formatDate, formatMoney } from "@/lib/utils";
import type { ProcurementDetail } from "@/lib/data/procurement";
import type { RfqInviteStatus, Supplier } from "@/lib/database.types";

const initialQuotation: ProcurementState = { error: null, ok: null };

const INVITE_STATUS_TONE: Record<RfqInviteStatus, "neutral" | "info" | "good" | "critical"> = {
  invited: "neutral",
  viewed: "info",
  submitted: "good",
  declined: "critical",
};

export function ProcurementPanel({
  detail,
  suppliers,
  canInvite,
  canAward,
  canApprovePO,
  emphasize,
}: {
  detail: ProcurementDetail;
  suppliers: Supplier[];
  canInvite: boolean;
  canAward: boolean;
  canApprovePO: boolean;
  emphasize?: boolean;
}) {
  const router = useRouter();
  const { rfq, invites, invitedSupplierIds, quotations, po } = detail;
  const invitedSet = new Set(invitedSupplierIds);
  const uninvited = suppliers.filter((s) => !invitedSet.has(s.id));

  const [invitePending, startInvite] = useTransition();
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [sourcing, setSourcing] = useState(false);
  const [prospectName, setProspectName] = useState("");
  const [prospectEmail, setProspectEmail] = useState("");
  const [prospectPhone, setProspectPhone] = useState("");
  const [prospectPending, startProspect] = useTransition();
  const [prospectError, setProspectError] = useState<string | null>(null);

  const [shareMsg, setShareMsg] = useState<Record<string, { text: string; error: boolean }>>({});
  const [sharePending, startShare] = useTransition();

  const [recordingQuote, setRecordingQuote] = useState(false);
  const [quoteState, quoteAction, quotePending] = useActionState(recordQuotation, initialQuotation);
  const [awardingId, setAwardingId] = useState<string | null>(null);
  const [awardNotes, setAwardNotes] = useState("");
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [awardPending, startAward] = useTransition();
  const [awardError, setAwardError] = useState<string | null>(null);
  const [approvePending, startApprovePO] = useTransition();
  const [approveError, setApproveError] = useState<string | null>(null);

  useEffect(() => {
    if (quoteState.ok) {
      setRecordingQuote(false);
      router.refresh();
    }
  }, [quoteState.ok, router]);

  function invite(supplierId: string) {
    startInvite(async () => {
      const result = await inviteSupplierToRfq(rfq.id, rfq.case_id, supplierId);
      if (result.error) setInviteError(result.error);
      else {
        setInviteError(null);
        router.refresh();
      }
    });
  }

  function addProspect() {
    startProspect(async () => {
      const result = await inviteProspectToRfq(rfq.id, rfq.case_id, prospectName, prospectEmail, prospectPhone);
      if (result.error) setProspectError(result.error);
      else {
        setProspectError(null);
        setProspectName("");
        setProspectEmail("");
        setProspectPhone("");
        setSourcing(false);
        router.refresh();
      }
    });
  }

  function copyInviteLink(token: string, inviteId: string) {
    const link = `${process.env.NEXT_PUBLIC_SITE_URL}/quote/${token}`;
    navigator.clipboard.writeText(link).then(() => {
      setShareMsg((m) => ({ ...m, [inviteId]: { text: "Copied.", error: false } }));
      setTimeout(() => setShareMsg((m) => ({ ...m, [inviteId]: { text: "", error: false } })), 2000);
    });
  }

  function emailInviteLink(inviteId: string) {
    startShare(async () => {
      const result = await shareRfqInviteLink(rfq.case_id, inviteId);
      setShareMsg((m) => ({ ...m, [inviteId]: { text: result.error ?? result.ok ?? "", error: Boolean(result.error) } }));
    });
  }

  function whatsappHref(token: string, phone: string) {
    const link = `${process.env.NEXT_PUBLIC_SITE_URL}/quote/${token}`;
    const text = encodeURIComponent(`Request for quotation: ${rfq.title}\n${link}`);
    return `https://wa.me/${phone.replace(/[^\d+]/g, "").replace(/^\+/, "")}?text=${text}`;
  }

  function confirmAward(quotationId: string) {
    startAward(async () => {
      const result = await awardPO(rfq.id, rfq.case_id, quotationId, awardNotes, expectedDelivery || null);
      if (result.error) setAwardError(result.error);
      else router.refresh();
    });
  }

  function approveThisPO() {
    if (!po) return;
    startApprovePO(async () => {
      const result = await approvePO(po.id, rfq.case_id);
      if (result.error) setApproveError(result.error);
      else router.refresh();
    });
  }

  const awardingQuote = quotations.find((q) => q.id === awardingId);

  if (po) {
    return (
      <Card raised={emphasize}>
        <CardHeader
          title="Purchase order"
          subtitle={po.po_number}
          icon={emphasize ? <ShoppingCart className="h-4 w-4" /> : undefined}
          action={
            <div className="flex items-center gap-2">
              {emphasize && <Badge tone="brand">Current stage</Badge>}
              <ButtonLink href={`/api/export/po/${po.id}`} variant="secondary" size="sm">
                <Download className="h-3.5 w-3.5" />
                PDF
              </ButtonLink>
            </div>
          }
        />
        <CardBody className="flex flex-col gap-2 text-sm">
          <div className="flex items-center gap-2">
            <p className="text-ink">
              {po.status === "pending_approval" ? "Awaiting approval, for" : "Awarded for"}{" "}
              <span className="font-semibold tnum">{formatMoney(po.total_cents, { currency: po.currency })}</span>
            </p>
            {po.status === "pending_approval" && <Badge tone="attention">pending approval</Badge>}
          </div>
          <p className="text-xs text-ink-faint">
            Issued {formatDate(po.issued_at)}
            {po.expected_delivery_date ? ` · expected delivery ${formatDate(po.expected_delivery_date)}` : ""}
          </p>
          {po.status === "pending_approval" && canApprovePO && (
            <div className="flex flex-col items-start gap-1 pt-1">
              <Button size="sm" busy={approvePending} onClick={approveThisPO}>
                Approve purchase order
              </Button>
              {approveError && <p className="text-xs text-critical">{approveError}</p>}
            </div>
          )}
        </CardBody>
      </Card>
    );
  }

  return (
    <Card raised={emphasize}>
      <CardHeader
        title="Procurement"
        subtitle={rfq.title}
        icon={emphasize ? <ShoppingCart className="h-4 w-4" /> : undefined}
        action={emphasize ? <Badge tone="brand">Current stage</Badge> : undefined}
      />
      <CardBody className="flex flex-col gap-5">
        {canInvite && (
          <div>
            <p className="mb-2 text-sm font-semibold text-ink">Invite suppliers</p>
            {uninvited.length === 0 ? (
              <p className="text-xs text-ink-faint">Every active supplier has been invited.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {uninvited.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    disabled={invitePending}
                    onClick={() => invite(s.id)}
                    className="rounded-full border border-line px-3 py-1 text-xs font-medium text-ink-soft hover:border-brand hover:text-brand disabled:opacity-50"
                  >
                    + {s.name}
                  </button>
                ))}
              </div>
            )}
            {inviteError && <p className="mt-1 text-xs text-critical">{inviteError}</p>}

            <div className="mt-3">
              <button type="button" onClick={() => setSourcing(true)} className="text-xs font-semibold text-brand hover:underline">
                + Source a new supplier not yet in the system
              </button>
              <Modal open={sourcing} onClose={() => setSourcing(false)} title="Source a new supplier" dismissible={!prospectPending} size="sm">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    addProspect();
                  }}
                  className="flex flex-col gap-3"
                >
                  <TextInput label="Company / contact name" value={prospectName} onChange={(e) => setProspectName(e.target.value)} />
                  <TextInput label="Email" value={prospectEmail} onChange={(e) => setProspectEmail(e.target.value)} hint="Optional" />
                  <TextInput label="Phone" value={prospectPhone} onChange={(e) => setProspectPhone(e.target.value)} hint="Optional, for WhatsApp" />
                  {prospectError && <p className="text-xs text-critical">{prospectError}</p>}
                  <ModalFormActions onCancel={() => setSourcing(false)} submitLabel="Source" busy={prospectPending} />
                </form>
              </Modal>
            </div>
          </div>
        )}

        {invites.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-semibold text-ink">Invited</p>
            <div className="flex flex-col divide-y divide-line">
              {invites.map((inv) => {
                const displayName = inv.invite_name ?? suppliers.find((s) => s.id === inv.supplier_id)?.name ?? "Supplier";
                const canShare = canInvite && (inv.status === "invited" || inv.status === "viewed");
                return (
                  <div key={inv.id} className="flex flex-col gap-1.5 py-2.5 first:pt-0">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-ink">{displayName}</p>
                      <Badge tone={INVITE_STATUS_TONE[inv.status]}>{inv.status}</Badge>
                    </div>
                    {canShare && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button size="sm" variant="secondary" onClick={() => copyInviteLink(inv.access_token, inv.id)}>
                          <Copy className="h-3.5 w-3.5" />
                          Copy link
                        </Button>
                        {(inv.invite_email || suppliers.find((s) => s.id === inv.supplier_id)?.email) && (
                          <Button size="sm" variant="secondary" busy={sharePending} onClick={() => emailInviteLink(inv.id)}>
                            <Mail className="h-3.5 w-3.5" />
                            Email
                          </Button>
                        )}
                        {inv.invite_phone && (
                          <a
                            href={whatsappHref(inv.access_token, inv.invite_phone)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong px-3 text-sm font-medium text-ink hover:border-brand hover:text-brand"
                          >
                            WhatsApp
                          </a>
                        )}
                        {shareMsg[inv.id]?.text && (
                          <span className={`inline-flex items-center gap-1 text-xs ${shareMsg[inv.id].error ? "text-critical" : "text-ink-faint"}`}>
                            {shareMsg[inv.id].error ? <AlertTriangle className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                            {shareMsg[inv.id].text}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {canInvite && invitedSupplierIds.length > 0 && (
          <div>
            <Button size="sm" variant="secondary" onClick={() => setRecordingQuote(true)}>
              Record a quotation
            </Button>
            <Modal open={recordingQuote} onClose={() => setRecordingQuote(false)} title="Record a quotation" dismissible={!quotePending} size="sm">
              <form action={quoteAction} className="flex flex-col gap-3">
                <input type="hidden" name="rfq_id" value={rfq.id} />
                <input type="hidden" name="case_id" value={rfq.case_id} />
                <SelectInput label="Supplier" name="supplier_id" required>
                  <option value="">Choose</option>
                  {suppliers
                    .filter((s) => invitedSet.has(s.id))
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </SelectInput>
                <NumberInput label="Total quoted" name="total" unit="KES" decimals required />
                {quoteState.error && <p className="text-xs text-critical">{quoteState.error}</p>}
                <ModalFormActions onCancel={() => setRecordingQuote(false)} submitLabel="Record" busy={quotePending} />
              </form>
            </Modal>
          </div>
        )}

        {quotations.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-semibold text-ink">Quotations received</p>
            <div className="flex flex-col divide-y divide-line">
              {quotations.map((q) => (
                <div key={q.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {q.supplier_name} {q.submitted_via === "supplier_portal" && <span className="font-normal text-ink-faint">· via portal</span>}
                    </p>
                    <p className="text-xs text-ink-faint">
                      {formatMoney(q.total_cents, { currency: q.currency })} · {formatDate(q.submitted_at)}
                    </p>
                  </div>
                  {canAward && (
                    <Button size="sm" variant="secondary" onClick={() => setAwardingId(q.id)}>
                      Award
                    </Button>
                  )}
                </div>
              ))}
            </div>
            {awardError && <p className="mt-1 text-xs text-critical">{awardError}</p>}
          </div>
        )}

        <Modal
          open={awardingId !== null}
          onClose={() => setAwardingId(null)}
          title={`Award this quotation${awardingQuote ? ` — ${awardingQuote.supplier_name}` : ""}`}
          dismissible={!awardPending}
          size="sm"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (awardingId) confirmAward(awardingId);
            }}
            className="flex flex-col gap-3"
          >
            <TextInput
              label="Expected delivery"
              type="date"
              value={expectedDelivery}
              onChange={(e) => setExpectedDelivery(e.target.value)}
              hint="Optional"
            />
            <TextArea label="Notes" value={awardNotes} onChange={(e) => setAwardNotes(e.target.value)} hint="Optional" rows={2} />
            <ModalFormActions onCancel={() => setAwardingId(null)} submitLabel="Confirm award" busy={awardPending} />
          </form>
        </Modal>
      </CardBody>
    </Card>
  );
}
