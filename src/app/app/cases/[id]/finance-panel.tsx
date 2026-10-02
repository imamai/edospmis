"use client";

import Link from "next/link";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Pencil, Plus, Trash2, Receipt } from "lucide-react";
import {
  submitInvoice,
  updateInvoice,
  voidInvoice,
  resolveMatchException,
  approveInvoice,
  recordInvoicePayment,
  type FinanceState,
} from "../../finance/actions";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PanelSteps } from "./panel-steps";
import { Badge } from "@/components/ui/badge";
import {
  NumberInput,
  SelectInput,
  TextArea,
  TextInput,
} from "@/components/ui/field";
import { Modal, ModalFormActions } from "@/components/ui/modal";
import { PdfLinkButton } from "@/components/ui/pdf-link-button";
import { formatDate, formatMoney } from "@/lib/utils";
import { PAYMENT_METHODS } from "@/lib/payment-methods";
import type { FinanceDetail } from "@/lib/data/finance";
import type { PRItem } from "@/lib/database.types";

const initial: FinanceState = { error: null, ok: null };

/**
 * What this stage is waiting for, and what an invoice will be checked
 * against when it arrives.
 *
 * Without it the Finance card was an empty box with a button, which is a
 * large part of why invoicing read as something happening outside the
 * process: nothing on the case connected the invoice about to be entered to
 * the purchase order and the receipts directly above it.
 */
function MatchBasisNote({
  basis,
  currency,
}: {
  basis: MatchBasis;
  currency: string;
}) {
  const fullyReceived = basis.receivedQty >= basis.orderedQty;
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface-sunk px-3 py-2.5 text-sm">
      <p className="text-ink-soft">
        Awaiting the supplier&rsquo;s invoice for{" "}
        <span className="font-semibold text-ink">{basis.poNumber}</span>, which
        will be matched against it.
      </p>
      <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-faint">
        <div className="flex gap-1.5">
          <dt>Order total</dt>
          <dd className="tnum font-semibold text-ink-soft">
            {formatMoney(basis.poTotalCents, { currency })}
          </dd>
        </div>
        <div className="flex gap-1.5">
          <dt>Received</dt>
          <dd
            className={`tnum font-semibold ${fullyReceived ? "text-good" : "text-attention"}`}
          >
            {basis.receivedQty} of {basis.orderedQty}
          </dd>
        </div>
        <div className="flex gap-1.5">
          <dt>Against</dt>
          <dd className="font-semibold text-ink-soft">
            {basis.grnNumbers.length > 0
              ? basis.grnNumbers.join(", ")
              : "no goods received note yet"}
          </dd>
        </div>
      </dl>
    </div>
  );
}
const STATUS_TONE = {
  submitted: "neutral",
  matched: "info",
  exception: "attention",
  approved: "info",
  paid: "good",
  void: "critical",
} as const;

interface ItemRow {
  id: number;
  description: string;
  unit: string;
  qty: number;
  unitCost: number;
}

/** The purchase order and receipts an invoice on this case will be matched against. */
export interface MatchBasis {
  poNumber: string;
  poTotalCents: number;
  orderedQty: number;
  receivedQty: number;
  grnNumbers: string[];
}

export function FinancePanel({
  caseId,
  poItems,
  currency,
  detail,
  matchBasis,
  canSubmit,
  canApprove,
  canRecordPayment,
  emphasize,
  vatEnabled,
  vatRate,
}: {
  caseId: string;
  poItems: PRItem[];
  currency: string;
  detail: FinanceDetail;
  matchBasis: MatchBasis;
  canSubmit: boolean;
  canApprove: boolean;
  canRecordPayment: boolean;
  emphasize?: boolean;
  /** Whether this organisation charges VAT at all — Settings → Organization profile. */
  vatEnabled: boolean;
  /** The rate as a percentage, e.g. 16. */
  vatRate: number;
}) {
  const router = useRouter();
  const invoices = detail.invoices;
  const billedNet = detail.invoicedNetCents;
  // Room left on the order. An order billed in parts stays open to the next
  // invoice until its value is used up; a fully billed one does not invite
  // another, which would only be caught later as over-billing.
  const remainingNet = Math.max(0, matchBasis.poTotalCents - billedNet);

  const [submitting, setSubmitting] = useState(false);
  const [rows, setRows] = useState<ItemRow[]>(
    poItems.length > 0
      ? poItems.map((i, idx) => ({
          id: idx + 1,
          description: i.description,
          unit: i.unit,
          qty: i.qty,
          unitCost: i.estimated_unit_cost_cents / 100,
        }))
      : [{ id: 1, description: "", unit: "", qty: 1, unitCost: 0 }],
  );
  let nextId = rows.length + 1;

  const [submitState, setSubmitState] = useState<FinanceState>(initial);
  const [submitPending, startSubmit] = useTransition();

  /**
   * VAT, worked out from the lines rather than typed.
   *
   * The tax box used to start at zero, so on a 16% invoice somebody did the
   * multiplication in their head, every time, under time pressure — and a tax
   * figure wrong by a rounding is one that will not reconcile at the quarter.
   *
   * Read off the DOM on input, for the same reason the requisition form does:
   * the lines are added and removed dynamically, and making every quantity a
   * controlled field would rebuild the whole editor to show one number.
   */
  const invoiceFormRef = useRef<HTMLFormElement>(null);
  const [tax, setTax] = useState("");
  // Once somebody has typed in the tax box it is theirs. An invoice with a
  // zero-rated line, or one where the supplier simply charged something else,
  // must not have their figure overwritten the next time a quantity changes.
  const [taxEdited, setTaxEdited] = useState(false);

  function recalcTax() {
    if (!vatEnabled || taxEdited) return;
    const form = invoiceFormRef.current;
    if (!form) return;
    const qtys = Array.from(
      form.querySelectorAll<HTMLInputElement>('input[name="item_qty"]'),
    );
    const costs = Array.from(
      form.querySelectorAll<HTMLInputElement>('input[name="item_unit_cost"]'),
    );
    let net = 0;
    qtys.forEach((qtyInput, i) => {
      const qty = Number(qtyInput.value);
      const cost = Number(costs[i]?.value);
      if (
        !Number.isFinite(qty) ||
        qty <= 0 ||
        !Number.isFinite(cost) ||
        cost <= 0
      )
        return;
      net += qty * cost;
    });
    // Rounded to the cent once, at the end, rather than per line — rounding
    // each line and adding them up drifts from the figure on the supplier's
    // own invoice.
    setTax(
      net > 0 ? (Math.round(net * (vatRate / 100) * 100) / 100).toString() : "",
    );
  }

  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolveState, setResolveState] = useState<FinanceState>(initial);
  const [resolvePending, startResolve] = useTransition();

  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approvePending, startApprove] = useTransition();
  const [approveError, setApproveError] = useState<string | null>(null);

  const [payingId, setPayingId] = useState<string | null>(null);
  const [payState, setPayState] = useState<FinanceState>(initial);
  const [payPending, startPay] = useTransition();

  // Correcting reuses the submit modal rather than keeping a second copy of
  // the line editor: the two forms differ only in what they are prefilled
  // from and which action they call, and a duplicate would drift.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidState, setVoidState] = useState<FinanceState>(initial);
  const [voidPending, startVoid] = useTransition();

  const editing = invoices.find((i) => i.id === editingId) ?? null;

  function startCorrecting(invoice: (typeof invoices)[number]) {
    setSubmitState(initial);
    setRows(
      invoice.items.length > 0
        ? invoice.items.map((it, idx) => ({
            id: idx + 1,
            description: it.description,
            unit: it.unit,
            qty: it.qty,
            unitCost: it.unit_cost_cents / 100,
          }))
        : [{ id: 1, description: "", unit: "", qty: 1, unitCost: 0 }],
    );
    // What this invoice already says, not a fresh calculation — a correction
    // starts from the figures on the supplier's document, and treating the
    // existing tax as hand-set stops the first keystroke overwriting it.
    setTax((invoice.tax_cents / 100).toString());
    setTaxEdited(true);
    setEditingId(invoice.id);
  }

  function closeInvoiceModal() {
    setSubmitting(false);
    setEditingId(null);
    // Cleared on the way out rather than on the way in: the next invoice must
    // not open holding the last one's tax, and the dialog can be opened from
    // two places.
    setTax("");
    setTaxEdited(false);
  }

  function editForm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startSubmit(async () => {
      const result = await updateInvoice(initial, form);
      setSubmitState(result);
      if (result.ok) {
        setEditingId(null);
        router.refresh();
      }
    });
  }

  function voidForm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startVoid(async () => {
      const result = await voidInvoice(initial, form);
      setVoidState(result);
      if (result.ok) {
        setVoidingId(null);
        router.refresh();
      }
    });
  }

  function submitForm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startSubmit(async () => {
      const result = await submitInvoice(initial, form);
      setSubmitState(result);
      if (result.ok) {
        setSubmitting(false);
        router.refresh();
      }
    });
  }

  function resolveForm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startResolve(async () => {
      const result = await resolveMatchException(initial, form);
      setResolveState(result);
      if (result.ok) {
        setResolvingId(null);
        router.refresh();
      }
    });
  }

  function approve(invoiceId: string) {
    setApprovingId(invoiceId);
    setApproveError(null);
    startApprove(async () => {
      const result = await approveInvoice(invoiceId, caseId);
      if (result.error) setApproveError(result.error);
      else router.refresh();
      setApprovingId(null);
    });
  }

  function payForm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startPay(async () => {
      const result = await recordInvoicePayment(initial, form);
      setPayState(result);
      if (result.ok) {
        setPayingId(null);
        router.refresh();
      }
    });
  }

  const resolvingException = invoices
    .flatMap((i) => i.exceptions)
    .find((ex) => ex.id === resolvingId);

  // The invoice the exception was raised against, so the dialog can offer to
  // correct the figures rather than only to write a note about them.
  const resolvingInvoice = invoices.find((i) =>
    i.exceptions.some((ex) => ex.id === resolvingId),
  );
  /**
   * Where this case has got to inside finance.
   *
   * Voided invoices are ignored throughout: they are kept for the record and
   * are deliberately outside every total the match computes, so a case whose
   * only invoice was voided is back to having no invoice at all.
   */
  const liveInvoices = invoices.filter((i) => i.status !== "void");
  const openExceptions = liveInvoices.flatMap((i) =>
    i.exceptions.filter((ex) => ex.status !== "resolved"),
  );
  const financeStep: "invoice" | "match" | "approve" | "pay" | "done" =
    liveInvoices.length === 0
      ? "invoice"
      : openExceptions.length > 0
        ? "match"
        : liveInvoices.every((i) => i.status === "paid")
          ? "done"
          : liveInvoices.some((i) => i.status === "approved")
            ? "pay"
            : "approve";

  const financeNext =
    financeStep === "invoice"
      ? "Enter the supplier's invoice against what was received."
      : financeStep === "match"
        ? "A line does not agree with the order or the receipt. Resolve it, or correct the invoice."
        : financeStep === "approve"
          ? "The invoice matches. Approve it for payment."
          : financeStep === "pay"
            ? "Approved — record the payment once it leaves."
            : "Paid in full. Nothing further here.";

  const receiptRecorded = matchBasis.grnNumbers.length > 0;
  const canBillMore = receiptRecorded && remainingNet > 0;

  return (
    <Card raised={emphasize}>
      <CardHeader
        title="Finance"
        subtitle="Invoice capture and three-way match"
        icon={emphasize ? <Receipt className="h-4 w-4" /> : undefined}
        action={
          emphasize ? <Badge tone="brand">Current stage</Badge> : undefined
        }
      />
      <CardBody className="flex flex-col gap-4">
        <PanelSteps
          steps={[
            { key: "invoice", label: "Invoice" },
            { key: "match", label: "Match" },
            { key: "approve", label: "Approve" },
            { key: "pay", label: "Pay" },
          ]}
          current={financeStep}
          complete={financeStep === "done"}
          next={financeNext}
        />

        {invoices.length === 0 && (
          <MatchBasisNote basis={matchBasis} currency={currency} />
        )}

        {/* An order billed in parts: what has gone through it so far, and what
            is still open to be billed. */}
        {invoices.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border border-line bg-surface-sunk px-3 py-2 text-xs">
            <span className="text-ink-soft">
              Ordered{" "}
              <span className="tnum font-semibold text-ink">
                {formatMoney(matchBasis.poTotalCents, { currency })}
              </span>
            </span>
            <span className="text-ink-soft">
              Billed so far{" "}
              <span className="tnum font-semibold text-ink">
                {formatMoney(billedNet, { currency })}
              </span>
              <span className="text-ink-faint">
                {" "}
                ({invoices.length} invoice{invoices.length === 1 ? "" : "s"})
              </span>
            </span>
            <span className="text-ink-soft">
              Still open{" "}
              <span
                className={`tnum font-semibold ${remainingNet > 0 ? "text-attention" : "text-good"}`}
              >
                {formatMoney(remainingNet, { currency })}
              </span>
            </span>
          </div>
        )}

        {/* The receipt comes first, so the step isn't offered before it can
            succeed — edospmis_submit_invoice refuses it outright. */}
        {canSubmit && !receiptRecorded && (
          <p className="text-sm text-ink-faint">
            Record the goods received above before entering the supplier&rsquo;s
            invoice — the invoice is matched against the receipt, not against
            the order alone.
          </p>
        )}

        {canSubmit && canBillMore && (
          <>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setSubmitting(true)}
            >
              {invoices.length === 0 ? "Submit invoice" : "Add another invoice"}
            </Button>
            <Modal
              open={submitting || editing !== null}
              onClose={closeInvoiceModal}
              title={
                editing
                  ? `Correct invoice ${editing.invoice_number}`
                  : invoices.length === 0
                    ? "Submit invoice"
                    : "Add another invoice"
              }
              dismissible={!submitPending}
              size="lg"
            >
              <form
                ref={invoiceFormRef}
                onSubmit={editing ? editForm : submitForm}
                onInput={recalcTax}
                className="flex flex-col gap-3"
              >
                <input type="hidden" name="case_id" value={caseId} />
                {editing && (
                  <input type="hidden" name="invoice_id" value={editing.id} />
                )}
                <p className="rounded-lg border border-line bg-surface-sunk px-3 py-2 text-xs text-ink-soft">
                  These lines are prefilled from{" "}
                  <span className="font-semibold text-ink">
                    {matchBasis.poNumber}
                  </span>
                  . Each line is checked against that order&rsquo;s unit price,
                  and the running total against what has already been billed and
                  received — anything that doesn&rsquo;t line up is raised as a
                  match exception rather than silently accepted.
                  {invoices.length > 0 && (
                    <>
                      {" "}
                      <span className="font-semibold text-ink">
                        {formatMoney(remainingNet, { currency })}
                      </span>{" "}
                      of this order is still unbilled; edit the quantities to
                      bill only this delivery.
                    </>
                  )}
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <TextInput
                    label="Supplier invoice #"
                    name="invoice_number"
                    required
                  />
                  <TextInput
                    label="Payment terms"
                    name="payment_terms"
                    placeholder="e.g. Net 30"
                    hint="Sets the due date"
                  />
                  <TextInput
                    label="Due date"
                    name="due_date"
                    type="date"
                    hint="Optional — otherwise from the terms"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-ink">Line items</p>
                  <button
                    type="button"
                    onClick={() =>
                      setRows((r) => [
                        ...r,
                        {
                          id: nextId++,
                          description: "",
                          unit: "",
                          qty: 1,
                          unitCost: 0,
                        },
                      ])
                    }
                    className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add item
                  </button>
                </div>
                {rows.map((row, i) => (
                  <div
                    key={row.id}
                    className="grid grid-cols-12 items-end gap-2"
                  >
                    <div className="col-span-12 sm:col-span-5">
                      <TextInput
                        label={i === 0 ? "Item" : ""}
                        name="item_description"
                        defaultValue={row.description}
                      />
                    </div>
                    <div className="col-span-3 sm:col-span-2">
                      <TextInput
                        label={i === 0 ? "Unit" : ""}
                        name="item_unit"
                        defaultValue={row.unit}
                      />
                    </div>
                    <div className="col-span-3 sm:col-span-2">
                      <NumberInput
                        label={i === 0 ? "Qty" : ""}
                        name="item_qty"
                        min={0}
                        decimals
                        defaultValue={row.qty}
                      />
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <NumberInput
                        label={i === 0 ? "Unit cost" : ""}
                        name="item_unit_cost"
                        min={0}
                        decimals
                        defaultValue={row.unitCost}
                      />
                    </div>
                    {rows.length > 1 && (
                      <div className="col-span-2 flex justify-end sm:col-span-1">
                        <button
                          type="button"
                          onClick={() =>
                            setRows((r) => r.filter((x) => x.id !== row.id))
                          }
                          aria-label="Remove item"
                          className="rounded-md p-2 text-ink-faint hover:bg-surface-sunk hover:text-critical"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                <NumberInput
                  label={vatEnabled ? `VAT (${vatRate}%)` : "Tax"}
                  name="tax"
                  min={0}
                  decimals
                  value={tax}
                  onChange={(e) => {
                    setTax(e.target.value);
                    setTaxEdited(true);
                  }}
                  unit={currency}
                  hint={
                    vatEnabled
                      ? taxEdited
                        ? "You have set this by hand — it will no longer follow the lines."
                        : `Worked out at ${vatRate}% of the lines above. Type over it if the supplier charged something else.`
                      : "VAT is switched off for this organisation. Enter any tax by hand."
                  }
                />
                {submitState.error && (
                  <p className="text-xs text-critical">{submitState.error}</p>
                )}
                <ModalFormActions
                  onCancel={() => setSubmitting(false)}
                  submitLabel="Submit invoice"
                  busy={submitPending}
                />
              </form>
            </Modal>
          </>
        )}

        {canSubmit &&
          receiptRecorded &&
          !canBillMore &&
          invoices.length > 0 && (
            <p className="text-xs text-ink-faint">
              The whole of {matchBasis.poNumber} has been billed. Anything
              further would exceed the order.
            </p>
          )}

        {invoices.length === 0 && !canSubmit && (
          <p className="text-sm text-ink-faint">
            No invoice has been submitted for this case yet.
          </p>
        )}

        {invoices.map((invoice) => (
          <div
            key={invoice.id}
            className="flex flex-col gap-3 border-t border-line pt-3 first-of-type:border-t-0 first-of-type:pt-0"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-ink">
                  Invoice {invoice.invoice_number}
                </p>
                <p className="text-xs text-ink-faint">
                  {formatMoney(invoice.total_cents, {
                    currency: invoice.currency,
                  })}{" "}
                  · submitted {formatDate(invoice.submitted_at)}
                  {invoice.due_date
                    ? ` · due ${formatDate(invoice.due_date)}`
                    : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={STATUS_TONE[invoice.status]}>
                  {invoice.status}
                </Badge>
                <PdfLinkButton
                  href={`/api/export/invoice/${invoice.id}`}
                  filename={invoice.invoice_number}
                  title={`Invoice ${invoice.invoice_number}`}
                  className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs font-semibold text-ink-soft hover:border-brand hover:text-brand"
                >
                  <FileText className="h-3.5 w-3.5" />
                  PDF
                </PdfLinkButton>
                {/* Correcting is for an invoice still being checked. Once it
                    is approved or paid it is a commitment somebody signed
                    for, and the remedy is to void and re-enter so both stay
                    on the record — the database refuses it either way. */}
                {canSubmit &&
                  ["submitted", "matched", "exception"].includes(
                    invoice.status,
                  ) && (
                    <button
                      type="button"
                      onClick={() => startCorrecting(invoice)}
                      className="rounded-md border border-line px-2 py-1 text-xs font-semibold text-ink-soft hover:border-brand hover:text-brand"
                    >
                      Correct
                    </button>
                  )}
                {canApprove &&
                  invoice.status !== "paid" &&
                  invoice.status !== "void" && (
                    <button
                      type="button"
                      onClick={() => {
                        setVoidState(initial);
                        setVoidingId(invoice.id);
                      }}
                      className="rounded-md border border-line px-2 py-1 text-xs font-semibold text-ink-soft hover:border-critical hover:text-critical"
                    >
                      Void
                    </button>
                  )}
              </div>
            </div>

            {invoice.status === "void" && invoice.void_reason && (
              <p className="rounded-lg border border-line bg-surface-sunk px-3 py-2 text-xs text-ink-soft">
                <span className="font-semibold text-ink">Voided.</span>{" "}
                {invoice.void_reason} &mdash; the number stays claimed, so the
                same supplier invoice cannot be entered again by mistake.
              </p>
            )}

            {invoice.exceptions.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  Match exceptions
                </p>
                {invoice.exceptions.map((ex) => (
                  <div
                    key={ex.id}
                    className="rounded-lg border border-line p-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-ink">{ex.detail}</p>
                      <Badge
                        tone={ex.status === "resolved" ? "good" : "attention"}
                      >
                        {ex.status}
                      </Badge>
                    </div>
                    {ex.resolution_note && (
                      <p className="mt-1 text-xs text-ink-soft">
                        &ldquo;{ex.resolution_note}&rdquo;
                      </p>
                    )}
                    {ex.status === "open" && canApprove && (
                      <button
                        type="button"
                        onClick={() => setResolvingId(ex.id)}
                        className="mt-2 text-xs font-semibold text-brand hover:underline"
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {invoice.status === "matched" && canApprove && (
              <div className="flex flex-col items-start gap-1">
                <Button
                  size="sm"
                  busy={approvePending && approvingId === invoice.id}
                  onClick={() => approve(invoice.id)}
                >
                  Approve for payment
                </Button>
                {approveError && approvingId === invoice.id && (
                  <p className="text-xs text-critical">{approveError}</p>
                )}
              </div>
            )}

            {invoice.status === "approved" && (
              <p className="rounded-lg border border-line bg-surface-sunk px-3 py-2 text-xs text-ink-soft">
                Approved and awaiting payment. The case can move on from Finance
                without paying now — this invoice stays payable and appears
                under{" "}
                <Link
                  href="/app/reports/invoices?status=approved"
                  className="font-medium text-brand hover:underline"
                >
                  Invoices &amp; payments
                </Link>
                , where it can be settled on its own or together with this
                supplier&rsquo;s other approved invoices.
              </p>
            )}

            {invoice.status === "approved" && canRecordPayment && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setPayingId(invoice.id)}
              >
                Record payment now
              </Button>
            )}

            {invoice.status === "paid" && (
              <p className="text-xs text-ink-faint">
                Paid {formatDate(invoice.paid_at)}
                {invoice.payment_method ? ` via ${invoice.payment_method}` : ""}
                {invoice.payment_reference
                  ? ` · ref. ${invoice.payment_reference}`
                  : ""}
              </p>
            )}
          </div>
        ))}

        {/* One dialog each, keyed by which invoice is being acted on, rather
            than one per invoice rendered. */}
        <Modal
          open={resolvingId !== null}
          onClose={() => setResolvingId(null)}
          title="Resolve match exception"
          description={resolvingException?.detail}
          dismissible={!resolvePending}
        >
          <form onSubmit={resolveForm} className="flex flex-col gap-3">
            <input
              type="hidden"
              name="exception_id"
              value={resolvingId ?? ""}
            />
            <input type="hidden" name="case_id" value={caseId} />
            {/* An exception is one of two things, and the dialog used to
                assume the first: either the figures are right and the
                difference is explainable, or the figures are wrong. Only a
                note was ever offered, so correcting an invoice meant closing
                this, finding the Correct button, and remembering what the
                exception had said. */}
            {canSubmit && resolvingInvoice && (
              <div className="rounded-lg border border-line bg-surface-sunk p-3">
                <p className="text-xs text-ink-soft">
                  If the invoice itself is wrong, change the figures instead of
                  explaining them — the match is recalculated and this exception
                  is cleared by the correction.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="mt-2"
                  onClick={() => {
                    const invoice = resolvingInvoice;
                    setResolvingId(null);
                    startCorrecting(invoice);
                  }}
                >
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Correct invoice {resolvingInvoice.invoice_number}
                </Button>
              </div>
            )}

            <TextArea
              label="How was this resolved?"
              name="resolution_note"
              rows={2}
              hint="Use this when the figures are right and the difference is explainable."
            />
            {resolveState.error && (
              <p className="text-xs text-critical">{resolveState.error}</p>
            )}
            <ModalFormActions
              onCancel={() => setResolvingId(null)}
              submitLabel="Save"
              busy={resolvePending}
            />
          </form>
        </Modal>

        <Modal
          open={voidingId !== null}
          onClose={() => setVoidingId(null)}
          title="Void this invoice"
          dismissible={!voidPending}
          size="sm"
        >
          <form onSubmit={voidForm} className="flex flex-col gap-3">
            <input type="hidden" name="case_id" value={caseId} />
            <input type="hidden" name="invoice_id" value={voidingId ?? ""} />
            <p className="rounded-lg border border-line bg-surface-sunk px-3 py-2 text-xs text-ink-soft">
              The invoice is not deleted. It keeps its number, its figures and
              this reason, which is what stops the same supplier invoice being
              entered a second time by somebody who did not know about the
              first. Voided invoices are left out of every total the match
              computes, so the order is free to be billed again.
            </p>
            <TextArea
              label="Why it is being voided"
              name="reason"
              required
              rows={2}
              placeholder="e.g. Entered against the wrong case."
            />
            {voidState.error && (
              <p className="text-sm text-critical">{voidState.error}</p>
            )}
            <ModalFormActions
              onCancel={() => setVoidingId(null)}
              submitLabel="Void invoice"
              busy={voidPending}
              danger
            />
          </form>
        </Modal>

        <Modal
          open={payingId !== null}
          onClose={() => setPayingId(null)}
          title="Record payment"
          dismissible={!payPending}
          size="sm"
        >
          <form onSubmit={payForm} className="flex flex-col gap-3">
            <input type="hidden" name="invoice_id" value={payingId ?? ""} />
            <input type="hidden" name="case_id" value={caseId} />
            <SelectInput
              label="Payment method"
              name="payment_method"
              required
              defaultValue=""
            >
              <option value="" disabled>
                Choose how this was paid
              </option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </SelectInput>
            <TextInput
              label="Payment reference"
              name="reference"
              hint="Optional — a transaction ID or cheque number"
            />
            {payState.error && (
              <p className="text-xs text-critical">{payState.error}</p>
            )}
            <ModalFormActions
              onCancel={() => setPayingId(null)}
              submitLabel="Record payment"
              busy={payPending}
            />
          </form>
        </Modal>
      </CardBody>
    </Card>
  );
}
