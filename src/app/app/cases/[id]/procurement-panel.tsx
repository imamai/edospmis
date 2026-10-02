"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Copy,
  Mail,
  MailCheck,
  Check,
  AlertTriangle,
  ShoppingCart,
} from "lucide-react";
import {
  inviteSupplierToRfq,
  inviteProspectToRfq,
  shareRfqInviteLink,
  mailUnsentRfqInvites,
  quoteLinkOrigin,
  awardPO,
  approvePO,
} from "../../procurement/actions";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TextArea, TextInput } from "@/components/ui/field";
import { Modal, ModalFormActions } from "@/components/ui/modal";
import { PdfLinkButton } from "@/components/ui/pdf-link-button";
import { formatDate, formatMoney } from "@/lib/utils";
import type { ProcurementDetail } from "@/lib/data/procurement";
import type { RfqInviteStatus, Supplier } from "@/lib/database.types";
import { RequirementsPicker } from "./requirements-picker";
import { ResponsesTable, type ResponseRow } from "./responses-table";
import {
  RecordQuotationsForm,
  type QuoteCandidate,
} from "./record-quotations-form";
import { PanelSteps, NextHere, activeBox } from "./panel-steps";
import type { BidReview } from "@/lib/data/tender";
import type {
  ProcurementTemplate,
  RfqRequirement,
  SupplierDocType,
} from "@/lib/tender-types";

/** The five jobs that make up the procurement stage, in the order they happen. */
type ProcurementStep =
  "requirements" | "invite" | "responses" | "award" | "po" | "done";

const PROCUREMENT_STEPS = [
  { key: "requirements", label: "Requirements" },
  { key: "invite", label: "Invite" },
  { key: "responses", label: "Responses" },
  { key: "award", label: "Award" },
  { key: "po", label: "Purchase order" },
];

const INVITE_STATUS_TONE: Record<
  RfqInviteStatus,
  "neutral" | "info" | "good" | "critical"
> = {
  invited: "neutral",
  viewed: "info",
  submitted: "good",
  declined: "critical",
  // Neutral, not critical: nobody did anything wrong. The tender closed and
  // this supplier had not submitted, which on an awarded tender is simply
  // what happened to everyone who did not win.
  lapsed: "neutral",
};

export function ProcurementPanel({
  detail,
  suppliers,
  canInvite,
  canAward,
  canApprovePO,
  emphasize,
  docTypes,
  templates,
  requirements,
  requirementsLocked,
  bids,
}: {
  detail: ProcurementDetail;
  suppliers: Supplier[];
  canInvite: boolean;
  canAward: boolean;
  canApprovePO: boolean;
  emphasize?: boolean;
  docTypes: SupplierDocType[];
  templates: ProcurementTemplate[];
  requirements: RfqRequirement[];
  /** A bid is in, so what this tender asks for can no longer change. */
  requirementsLocked: boolean;
  /** What each bidder returned, for the evaluation. */
  bids: BidReview[];
}) {
  const router = useRouter();
  const { rfq, invites, invitedSupplierIds, quotations, po } = detail;
  const invitedSet = new Set(invitedSupplierIds);
  // Active only: this is the "who shall we invite" list, and an archived
  // supplier is one you have stopped buying from. Resolving the name and
  // address of somebody already invited uses the full list, because by then
  // the decision has been made and hiding them only breaks the display.
  const uninvited = suppliers.filter(
    (s) => !invitedSet.has(s.id) && s.is_active,
  );

  /**
   * Where this tender has got to, inside the procurement stage.
   *
   * The case-level stepper says "Procurement" and stops there, which is
   * accurate and useless: procurement is five jobs, and the card listed all
   * five as equal stacked sections with nothing to say which one is yours
   * now. Somebody who had not run a tender before could not tell whether to
   * press Invite, wait, or award.
   *
   * Derived from what has actually happened rather than stored, so it cannot
   * disagree with the panel underneath it — there is no step field to fall
   * out of step with the data.
   */
  const step: ProcurementStep = po
    ? po.status === "pending_approval"
      ? "po"
      : "done"
    : quotations.length > 0
      ? "award"
      : invites.length > 0
        ? "responses"
        : requirements.length > 0
          ? "invite"
          : "requirements";

  const nextLine: Record<ProcurementStep, string> = {
    requirements:
      "Say what bidders must return — or skip it and ask only for a price — then invite suppliers.",
    invite:
      "Invite the suppliers you want to quote, then send each of them their link.",
    responses:
      "Waiting for suppliers to respond. Record a quotation yourself if one came back outside the system.",
    award: "Compare what came back, then award one of the quotations.",
    po: "The purchase order is waiting for approval.",
    done: "The purchase order has been issued. Nothing further here.",
  };

  // The section that matters now gets a ring; the rest stay quiet. One thing
  // lit at a time is the whole point — lighting several is the flat stack
  // this replaced.
  /**
   * The section to act on, in blue, with a marker on it.
   *
   * A faint ring was not enough: on a card of four similar-looking blocks it
   * read as decoration rather than instruction, and somebody who had not run
   * a tender before still had to guess. The active section now takes the
   * brand colour the current chevron already uses, so the step in the stepper
   * and the block you act in are visibly the same thing.
   */
  const active = (s: ProcurementStep) => activeBox(step === s);
  const marker = (s: ProcurementStep) => (step === s ? <NextHere /> : null);

  /**
   * One row per supplier who was asked, whether or not they answered.
   *
   * Built from the invitations rather than the quotations, because a tender is
   * as much about who stayed silent as who replied — listing only responders
   * made two of five look identical to two of two. A quotation recorded for
   * somebody never formally invited still appears: it is a real response, and
   * dropping it would lose it.
   */
  const bidBySupplier = new Map(bids.map((b) => [b.supplier_id, b]));
  const quoteBySupplier = new Map(quotations.map((q) => [q.supplier_id, q]));

  const responseRows: ResponseRow[] = [
    ...invites.map((inv) => {
      // A sourced prospect has no supplier record yet, so the invitation id
      // stands in as the row key. They are a real bidder either way.
      const quote = inv.supplier_id
        ? quoteBySupplier.get(inv.supplier_id)
        : undefined;
      return {
        supplierId: inv.supplier_id ?? inv.id,
        name:
          inv.invite_name ??
          suppliers.find((s) => s.id === inv.supplier_id)?.name ??
          "Supplier",
        quotationId: quote?.id ?? null,
        totalCents: quote?.total_cents ?? null,
        currency: quote?.currency ?? "KES",
        submittedAt: quote?.submitted_at ?? null,
        viaPortal: quote?.submitted_via === "supplier_portal",
        bid:
          (inv.supplier_id ? bidBySupplier.get(inv.supplier_id) : null) ?? null,
        inviteStatus: inv.status as string,
      };
    }),
    ...quotations
      .filter((q) => !invites.some((i) => i.supplier_id === q.supplier_id))
      .map((q) => ({
        supplierId: q.supplier_id,
        name: q.supplier_name,
        quotationId: q.id,
        totalCents: q.total_cents,
        currency: q.currency,
        submittedAt: q.submitted_at,
        viaPortal: q.submitted_via === "supplier_portal",
        bid: bidBySupplier.get(q.supplier_id) ?? null,
        inviteStatus: null,
      })),
  ];

  // Only once somebody has responded. Before that the invitation list is the
  // view, and a table of empty rows says nothing it does not already say.
  const showResponses = quotations.length > 0 || bids.length > 0;

  const [invitePending, startInvite] = useTransition();
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [sourcing, setSourcing] = useState(false);
  const [prospectName, setProspectName] = useState("");
  const [prospectEmail, setProspectEmail] = useState("");
  const [prospectPhone, setProspectPhone] = useState("");
  const [prospectPending, startProspect] = useTransition();
  const [prospectError, setProspectError] = useState<string | null>(null);

  const [shareMsg, setShareMsg] = useState<
    Record<string, { text: string; error: boolean }>
  >({});
  const [sharePending, startShare] = useTransition();

  /**
   * Suppliers on this RFQ who were never actually written to.
   *
   * Inviting used to send nothing, so this is a real backlog rather than a
   * hypothetical one. Scoped to those still at "invited": a supplier who has
   * opened their link was reached some other way and is not waiting on us.
   */
  /**
   * Nothing is shared once the tender is closed.
   *
   * The supplier-facing page already refuses a closed RFQ, so every link
   * offered here would land them on "this tender is closed" — and an
   * invitation to quote on work already awarded is worse than no invitation.
   * Most of the unsent backlog on the live system is exactly this: historical
   * rows on tenders long settled.
   */
  const rfqOpen = rfq.status === "open";
  const unsent = rfqOpen
    ? invites.filter((i) => i.status === "invited" && !i.emailed_at)
    : [];
  const unsentWithEmail = unsent.filter(
    (i) =>
      i.invite_email || suppliers.find((s) => s.id === i.supplier_id)?.email,
  );
  const [confirmingBulk, setConfirmingBulk] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const [bulkPending, startBulk] = useTransition();

  function sendUnsent() {
    startBulk(async () => {
      const result = await mailUnsentRfqInvites(rfq.id, rfq.case_id);
      setBulkMsg(result.error ?? result.ok);
      setConfirmingBulk(false);
      router.refresh();
    });
  }

  /**
   * Where a quote link points, asked of the server rather than read from
   * NEXT_PUBLIC_SITE_URL in the browser.
   *
   * The emailed link already works this way — `requestOrigin` on the server
   * exists because that variable once produced "undefined/quote/..." in a
   * real supplier's inbox. Copy link and WhatsApp still trusted it, so on a
   * deployment where it is unset or stale the emailed invitation worked while
   * a pasted one was broken, which is the hardest version of this to notice.
   *
   * Falls back to the current page's own origin, which on a browser is always
   * the deployment the person is looking at.
   */
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    quoteLinkOrigin()
      .then((o) => {
        if (live) setOrigin(o);
      })
      .catch(() => {
        if (live) setOrigin(window.location.origin);
      });
    return () => {
      live = false;
    };
  }, []);
  // The page's own origin covers the moment before the server answers, so a
  // link copied immediately is still absolute and still correct.
  const linkBase =
    origin ?? (typeof window === "undefined" ? "" : window.location.origin);

  const [recordingQuote, setRecordingQuote] = useState(false);
  const [quoteMsg, setQuoteMsg] = useState<string | null>(null);

  /**
   * Everyone invited, with what they have quoted so far.
   *
   * Suppliers who have already quoted are included rather than filtered out:
   * at the moment you are recording what came back, seeing who is still
   * missing is the useful thing, and a list that silently drops the ones you
   * have done leaves you counting.
   */
  const quoteCandidates: QuoteCandidate[] = invites
    .filter((inv) => inv.supplier_id)
    .map((inv) => {
      const existing = quotations.find(
        (q) => q.supplier_id === inv.supplier_id,
      );
      return {
        supplierId: inv.supplier_id!,
        name:
          inv.invite_name ??
          suppliers.find((s) => s.id === inv.supplier_id)?.name ??
          "Supplier",
        quotedCents: existing?.total_cents ?? null,
        currency: existing?.currency ?? "KES",
      };
    });
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [awardingId, setAwardingId] = useState<string | null>(null);
  const [awardNotes, setAwardNotes] = useState("");
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [awardPending, startAward] = useTransition();
  const [awardError, setAwardError] = useState<string | null>(null);
  /**
   * Shown only once the database has actually refused.
   *
   * Offering the override up front would make it part of the normal award
   * screen, which is how a gate quietly becomes a formality. It appears when
   * it is needed, naming what is missing, and what is typed is recorded
   * against the evaluation with the name of whoever typed it.
   */
  const [awardBlocked, setAwardBlocked] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [approvePending, startApprovePO] = useTransition();
  const [approveError, setApproveError] = useState<string | null>(null);

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
      const result = await inviteProspectToRfq(
        rfq.id,
        rfq.case_id,
        prospectName,
        prospectEmail,
        prospectPhone,
      );
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
    const link = `${linkBase}/quote/${token}`;
    navigator.clipboard.writeText(link).then(() => {
      setShareMsg((m) => ({
        ...m,
        [inviteId]: { text: "Copied.", error: false },
      }));
      setTimeout(
        () =>
          setShareMsg((m) => ({
            ...m,
            [inviteId]: { text: "", error: false },
          })),
        2000,
      );
    });
  }

  function emailInviteLink(inviteId: string) {
    startShare(async () => {
      const result = await shareRfqInviteLink(rfq.case_id, inviteId);
      setShareMsg((m) => ({
        ...m,
        [inviteId]: {
          text: result.error ?? result.ok ?? "",
          error: Boolean(result.error),
        },
      }));
    });
  }

  function whatsappHref(token: string, phone: string) {
    const link = `${linkBase}/quote/${token}`;
    const text = encodeURIComponent(
      `Request for quotation: ${rfq.title}\n${link}`,
    );
    return `https://wa.me/${phone.replace(/[^\d+]/g, "").replace(/^\+/, "")}?text=${text}`;
  }

  function confirmAward(quotationId: string) {
    // Checked here rather than by disabling the button: a submit that does
    // nothing and says nothing reads as the page being broken. Using `busy`
    // to disable it was worse still — it showed a spinner for a field the
    // person had simply not filled in yet.
    if (awardBlocked && overrideReason.trim() === "") {
      setAwardError("Say why you are awarding without it.");
      return;
    }
    startAward(async () => {
      const result = await awardPO(
        rfq.id,
        rfq.case_id,
        quotationId,
        awardNotes,
        expectedDelivery || null,
        awardBlocked ? overrideReason : null,
      );
      if (result.error) {
        setAwardError(result.error);
        // The gate's own message names what is outstanding. Recognised by its
        // wording rather than a code, because the message is raised by the
        // database function and that is what it has.
        if (/has not returned/i.test(result.error))
          setAwardBlocked(result.error);
        return;
      }
      setAwardBlocked(null);
      setOverrideReason("");
      router.refresh();
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
  const viewingQuote = quotations.find((q) => q.id === viewingId);

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
              <PdfLinkButton
                href={`/api/export/po/${po.id}`}
                filename={po.po_number}
                title={`Purchase order ${po.po_number}`}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium text-ink transition-colors hover:border-brand hover:text-brand"
              >
                <FileText className="h-3.5 w-3.5" />
                PDF
              </PdfLinkButton>
            </div>
          }
        />
        <CardBody className="flex flex-col gap-2 text-sm">
          {/* The stepper belongs here too. This branch replaces the whole
              panel once a purchase order exists, so without it procurement
              was the one stage whose steps vanished the moment it finished —
              while receiving and finance below it stayed visible and green.
              Somebody reading the case could no longer tell that sourcing had
              happened at all, let alone that it was done. */}
          <PanelSteps
            steps={PROCUREMENT_STEPS}
            current={po.status === "pending_approval" ? "po" : "done"}
            complete={po.status !== "pending_approval"}
            next={
              po.status === "pending_approval"
                ? "The purchase order needs approving before it goes to the supplier."
                : "Sourcing is finished. The order is with the supplier."
            }
          />

          <div className="flex items-center gap-2">
            <p className="text-ink">
              {po.status === "pending_approval"
                ? "Awaiting approval, for"
                : "Awarded for"}{" "}
              <span className="font-semibold tnum">
                {formatMoney(po.total_cents, { currency: po.currency })}
              </span>
            </p>
            {po.status === "pending_approval" && (
              <Badge tone="attention">pending approval</Badge>
            )}
          </div>
          <p className="text-xs text-ink-faint">
            Issued {formatDate(po.issued_at)}
            {po.expected_delivery_date
              ? ` · expected delivery ${formatDate(po.expected_delivery_date)}`
              : ""}
          </p>
          {po.status === "pending_approval" && canApprovePO && (
            <div className="flex flex-col items-start gap-1 pt-1">
              <Button size="sm" busy={approvePending} onClick={approveThisPO}>
                Approve purchase order
              </Button>
              {approveError && (
                <p className="text-xs text-critical">{approveError}</p>
              )}
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
        action={
          emphasize ? <Badge tone="brand">Current stage</Badge> : undefined
        }
      />
      <CardBody className="flex flex-col gap-5">
        {/* The same chevrons as the case-level stepper above, one level down.
            Reused rather than redrawn so the two read as the same idea at two
            scales, and so a change to how a step looks happens once. */}
        <div className="flex flex-col gap-2">
          <PanelSteps
            steps={PROCUREMENT_STEPS}
            current={step}
            complete={step === "done"}
            next={nextLine[step]}
          />
        </div>

        {/* Above the invitations on purpose: what a bidder must return is part
            of the invitation, and deciding it afterwards means the first few
            were asked for something different from the rest. */}
        <div className={active("requirements")}>
          {marker("requirements")}
          <RequirementsPicker
            rfqId={rfq.id}
            caseId={rfq.case_id}
            docTypes={docTypes}
            templates={templates}
            current={requirements}
            locked={requirementsLocked}
            canEdit={canInvite}
          />
        </div>

        {/* Read beside the quotations, because the documents and the price are
            weighed together — and an award refused over a missing CR12 needs
            that CR12 to be visibly missing. */}
        {canInvite && (
          <div className={active("invite")}>
            {marker("invite")}
            <p className="mb-2 text-sm font-semibold text-ink">
              Invite suppliers
            </p>
            {uninvited.length === 0 ? (
              <p className="text-xs text-ink-faint">
                Every active supplier has been invited.
              </p>
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
            {inviteError && (
              <p className="mt-1 text-xs text-critical">{inviteError}</p>
            )}

            <div className="mt-3">
              <button
                type="button"
                onClick={() => setSourcing(true)}
                className="text-xs font-semibold text-brand hover:underline"
              >
                + Source a new supplier not yet in the system
              </button>
              <Modal
                open={sourcing}
                onClose={() => setSourcing(false)}
                title="Source a new supplier"
                dismissible={!prospectPending}
                size="sm"
              >
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    addProspect();
                  }}
                  className="flex flex-col gap-3"
                >
                  <TextInput
                    label="Company / contact name"
                    value={prospectName}
                    onChange={(e) => setProspectName(e.target.value)}
                  />
                  <TextInput
                    label="Email"
                    value={prospectEmail}
                    onChange={(e) => setProspectEmail(e.target.value)}
                    hint="Optional"
                  />
                  <TextInput
                    label="Phone"
                    value={prospectPhone}
                    onChange={(e) => setProspectPhone(e.target.value)}
                    hint="Optional, for WhatsApp"
                  />
                  {prospectError && (
                    <p className="text-xs text-critical">{prospectError}</p>
                  )}
                  <ModalFormActions
                    onCancel={() => setSourcing(false)}
                    submitLabel="Source"
                    busy={prospectPending}
                  />
                </form>
              </Modal>
            </div>
          </div>
        )}

        {invites.length > 0 && (
          <div className={active("responses")}>
            {marker("responses")}
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink">Invited</p>
              {/* Shown only when there is a backlog to clear, and labelled
                  with the count — a button that says "send unsent" with
                  nothing unsent invites a click that does nothing. */}
              {canInvite && unsentWithEmail.length > 0 && (
                <Button
                  size="sm"
                  variant="secondary"
                  busy={bulkPending}
                  onClick={() => setConfirmingBulk(true)}
                >
                  <MailCheck className="h-3.5 w-3.5" />
                  Email {unsentWithEmail.length} unsent
                </Button>
              )}
            </div>
            {bulkMsg && (
              <p className="mb-2 text-xs text-ink-faint">{bulkMsg}</p>
            )}
            <div className="flex flex-col divide-y divide-line">
              {invites.map((inv) => {
                const displayName =
                  inv.invite_name ??
                  suppliers.find((s) => s.id === inv.supplier_id)?.name ??
                  "Supplier";
                const canShare =
                  canInvite &&
                  rfqOpen &&
                  (inv.status === "invited" || inv.status === "viewed");
                const to =
                  inv.invite_email ||
                  suppliers.find((s) => s.id === inv.supplier_id)?.email ||
                  null;
                /**
                 * Whether this supplier has actually been written to.
                 *
                 * The status badge says "invited" from the moment the row is
                 * inserted, which was true of the record and not of the
                 * supplier: inviting used to send nothing, so a supplier
                 * nobody had contacted was indistinguishable from one who had
                 * read the mail. Only `status` moving to viewed or submitted
                 * proved contact, and by then it was too late to wonder.
                 *
                 * Shown only while it still matters. Once they have opened
                 * the link or sent a quotation, how they heard is history.
                 */
                const awaiting =
                  rfqOpen &&
                  inv.status === "invited" &&
                  (inv.emailed_at
                    ? null
                    : to
                      ? "not emailed yet"
                      : "no email address");
                return (
                  <div
                    key={inv.id}
                    className="flex flex-col gap-1.5 py-2.5 first:pt-0"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-ink">
                        {displayName}
                      </p>
                      <div className="flex items-center gap-1.5">
                        {awaiting && <Badge tone="attention">{awaiting}</Badge>}
                        {inv.status === "invited" && inv.emailed_at && (
                          <span
                            className="text-xs text-ink-faint"
                            title={`Emailed to ${to} on ${formatDate(inv.emailed_at)}`}
                          >
                            emailed {formatDate(inv.emailed_at)}
                          </span>
                        )}
                        <Badge tone={INVITE_STATUS_TONE[inv.status]}>
                          {inv.status}
                        </Badge>
                      </div>
                    </div>
                    {canShare && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            copyInviteLink(inv.access_token, inv.id)
                          }
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Copy link
                        </Button>
                        {/* Always shown, and disabled with a reason when
                            there is nowhere to send it. Hiding the button was
                            worse than useless: somebody looking for it found
                            nothing, and concluded emailing suppliers did not
                            work at all rather than that this one supplier has
                            no address on file. */}
                        <Button
                          size="sm"
                          variant="secondary"
                          busy={sharePending}
                          disabled={!to}
                          title={
                            to
                              ? inv.emailed_at
                                ? `Send the link to ${to} again`
                                : `Send the link to ${to}`
                              : "No email address on file for this supplier — add one under Settings > Suppliers, or copy the link instead."
                          }
                          onClick={() => emailInviteLink(inv.id)}
                        >
                          <Mail className="h-3.5 w-3.5" />
                          {inv.emailed_at ? "Email again" : "Email"}
                        </Button>
                        {inv.invite_phone && (
                          <a
                            href={whatsappHref(
                              inv.access_token,
                              inv.invite_phone,
                            )}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong px-3 text-sm font-medium text-ink hover:border-brand hover:text-brand"
                          >
                            WhatsApp
                          </a>
                        )}
                        {shareMsg[inv.id]?.text && (
                          <span
                            className={`inline-flex items-center gap-1 text-xs ${shareMsg[inv.id].error ? "text-critical" : "text-ink-faint"}`}
                          >
                            {shareMsg[inv.id].error ? (
                              <AlertTriangle className="h-3 w-3" />
                            ) : (
                              <Check className="h-3 w-3" />
                            )}
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
          <div className="flex flex-col gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setRecordingQuote(true)}
            >
              Record quotations
            </Button>
            {quoteMsg && <p className="text-xs text-ink-faint">{quoteMsg}</p>}
            {/* Mounted only while open, so each sitting starts empty rather
                than holding whatever was typed and abandoned last time. */}
            {recordingQuote && (
              <Modal
                open
                onClose={() => setRecordingQuote(false)}
                title="Record quotations"
                description="Everything that came back, in one go."
                size="xl"
              >
                <RecordQuotationsForm
                  rfqId={rfq.id}
                  caseId={rfq.case_id}
                  candidates={quoteCandidates}
                  items={rfq.items ?? []}
                  onCancel={() => setRecordingQuote(false)}
                  onDone={(message) => {
                    setRecordingQuote(false);
                    setQuoteMsg(message);
                    router.refresh();
                  }}
                />
              </Modal>
            )}
          </div>
        )}

        {showResponses && (
          <div className={active("award")}>
            {marker("award")}
            <ResponsesTable
              rows={responseRows}
              canAward={canAward}
              onView={(id) => setViewingId(id)}
              onAward={(id) => setAwardingId(id)}
            />
            {awardError && (
              <p className="mt-1 text-xs text-critical">{awardError}</p>
            )}
          </div>
        )}

        <Modal
          open={viewingId !== null}
          onClose={() => setViewingId(null)}
          title={`Quotation${viewingQuote ? ` — ${viewingQuote.supplier_name}` : ""}`}
          size="lg"
        >
          {viewingQuote && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-ink-faint">
                <Badge
                  tone={
                    viewingQuote.submitted_via === "supplier_portal"
                      ? "info"
                      : "neutral"
                  }
                >
                  {viewingQuote.submitted_via === "supplier_portal"
                    ? "Submitted via supplier portal"
                    : "Recorded by staff"}
                </Badge>
                <span>{formatDate(viewingQuote.submitted_at)}</span>
              </div>

              {viewingQuote.line_prices &&
              viewingQuote.line_prices.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-line">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-line bg-surface-sunk text-xs uppercase tracking-wide text-ink-faint">
                        <th className="p-2.5 font-medium">Item</th>
                        <th className="p-2.5 font-medium">Qty</th>
                        <th className="p-2.5 font-medium">Unit</th>
                        <th className="p-2.5 font-medium">Unit price</th>
                        <th className="p-2.5 text-right font-medium">
                          Line total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewingQuote.line_prices.map((line, i) => (
                        <tr
                          key={i}
                          className="border-b border-line last:border-0"
                        >
                          <td className="p-2.5 text-ink">{line.description}</td>
                          <td className="p-2.5 tnum text-ink-soft">
                            {line.qty}
                          </td>
                          <td className="p-2.5 text-ink-soft">{line.unit}</td>
                          <td className="p-2.5 tnum text-ink-soft">
                            {formatMoney(line.unit_price_cents, {
                              currency: viewingQuote.currency,
                            })}
                          </td>
                          <td className="p-2.5 text-right tnum text-ink-soft">
                            {formatMoney(line.qty * line.unit_price_cents, {
                              currency: viewingQuote.currency,
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-line bg-surface-sunk">
                        <td
                          colSpan={4}
                          className="p-2.5 text-sm font-medium text-ink"
                        >
                          Total
                        </td>
                        <td className="p-2.5 text-right text-sm font-semibold tnum text-ink">
                          {formatMoney(viewingQuote.total_cents, {
                            currency: viewingQuote.currency,
                          })}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-ink-soft">
                  No line-item breakdown on file — recorded as a single total of{" "}
                  {formatMoney(viewingQuote.total_cents, {
                    currency: viewingQuote.currency,
                  })}
                  .
                </p>
              )}

              {viewingQuote.notes && (
                <div>
                  <p className="mb-1 text-xs font-semibold tracking-wide text-ink-faint uppercase">
                    Notes from the supplier
                  </p>
                  <p className="rounded-lg border border-line bg-surface-sunk p-3 text-sm whitespace-pre-wrap text-ink-soft">
                    {viewingQuote.notes}
                  </p>
                </div>
              )}
            </div>
          )}
        </Modal>

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
            <TextArea
              label="Notes"
              value={awardNotes}
              onChange={(e) => setAwardNotes(e.target.value)}
              hint="Optional"
              rows={2}
            />

            {awardBlocked && (
              <div className="flex flex-col gap-2 rounded-lg border border-critical/25 bg-critical-soft p-3">
                <p className="text-xs text-critical">{awardBlocked}</p>
                <TextArea
                  label="Why are you awarding anyway?"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  rows={2}
                  placeholder="e.g. Tax compliance certificate confirmed by telephone with KRA; copy to follow before payment."
                />
                <p className="text-xs text-ink-faint">
                  Recorded against the evaluation with your name, and visible on
                  the audit trail.
                </p>
              </div>
            )}

            <ModalFormActions
              onCancel={() => {
                setAwardingId(null);
                setAwardBlocked(null);
                setOverrideReason("");
              }}
              submitLabel={awardBlocked ? "Award anyway" : "Confirm award"}
              danger={!!awardBlocked}
              busy={awardPending}
            />
          </form>
        </Modal>

        {/*
          Confirmed before it fires. Every other action in this panel affects
          one record; this one sends mail to a dozen outside companies at once,
          and nothing recalls it. The dialog names them, because "Email 16
          unsent" is a count and not a list — the point of reading it is to
          notice the address that is wrong before it bounces, which is exactly
          how the one real bounce on this system happened.
        */}
        {confirmingBulk && (
          <Modal
            open={confirmingBulk}
            onClose={() => setConfirmingBulk(false)}
            title={`Email ${unsentWithEmail.length} supplier${unsentWithEmail.length === 1 ? "" : "s"}`}
            description="These suppliers were invited but never actually emailed. Each gets their own link."
            dismissible={!bulkPending}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendUnsent();
              }}
              className="flex flex-col gap-3"
            >
              <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-lg border border-line p-2.5">
                {unsentWithEmail.map((inv) => {
                  const supplier = suppliers.find(
                    (sup) => sup.id === inv.supplier_id,
                  );
                  return (
                    <li
                      key={inv.id}
                      className="flex items-baseline justify-between gap-3 text-xs"
                    >
                      <span className="font-medium text-ink">
                        {inv.invite_name ?? supplier?.name ?? "Supplier"}
                        {/* Flagged rather than filtered out. "Inactive" covers
                            both a supplier you archived and one who quoted
                            through the portal and was never approved — and
                            the system cannot tell those apart, so the person
                            confirming the send decides. */}
                        {supplier && !supplier.is_active && (
                          <span className="ml-1.5 font-normal text-attention">
                            inactive
                          </span>
                        )}
                      </span>
                      <span className="text-ink-faint">
                        {inv.invite_email ?? supplier?.email}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {unsent.length > unsentWithEmail.length && (
                <p className="text-xs text-attention">
                  {unsent.length - unsentWithEmail.length} more have no email
                  address on file and will be skipped. Add one under Settings
                  &rsaquo; Suppliers, or copy their link instead.
                </p>
              )}
              <ModalFormActions
                onCancel={() => setConfirmingBulk(false)}
                submitLabel="Send them now"
                busy={bulkPending}
              />
            </form>
          </Modal>
        )}
      </CardBody>
    </Card>
  );
}
