"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import {
  submitInvoice,
  resolveMatchException,
  approveInvoice,
  recordInvoicePayment,
  type FinanceState,
} from "../../finance/actions";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NumberInput, TextArea, TextInput } from "@/components/ui/field";
import { formatDate, formatMoney } from "@/lib/utils";
import type { FinanceDetail } from "@/lib/data/finance";
import type { PRItem } from "@/lib/database.types";

const initial: FinanceState = { error: null, ok: null };
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

export function FinancePanel({
  caseId,
  poItems,
  currency,
  detail,
  canSubmit,
  canApprove,
  canRecordPayment,
}: {
  caseId: string;
  poItems: PRItem[];
  currency: string;
  detail: FinanceDetail;
  canSubmit: boolean;
  canApprove: boolean;
  canRecordPayment: boolean;
}) {
  const router = useRouter();
  const invoice = detail.invoice;

  const [submitting, setSubmitting] = useState(false);
  const [rows, setRows] = useState<ItemRow[]>(
    poItems.length > 0
      ? poItems.map((i, idx) => ({ id: idx + 1, description: i.description, unit: i.unit, qty: i.qty, unitCost: i.estimated_unit_cost_cents / 100 }))
      : [{ id: 1, description: "", unit: "", qty: 1, unitCost: 0 }],
  );
  let nextId = rows.length + 1;

  const [submitState, setSubmitState] = useState<FinanceState>(initial);
  const [submitPending, startSubmit] = useTransition();

  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolveState, setResolveState] = useState<FinanceState>(initial);
  const [resolvePending, startResolve] = useTransition();

  const [approvePending, startApprove] = useTransition();
  const [approveError, setApproveError] = useState<string | null>(null);

  const [paying, setPaying] = useState(false);
  const [payState, setPayState] = useState<FinanceState>(initial);
  const [payPending, startPay] = useTransition();

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

  function approve() {
    if (!invoice) return;
    startApprove(async () => {
      const result = await approveInvoice(invoice.id, caseId);
      if (result.error) setApproveError(result.error);
      else router.refresh();
    });
  }

  function payForm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startPay(async () => {
      const result = await recordInvoicePayment(initial, form);
      setPayState(result);
      if (result.ok) {
        setPaying(false);
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardHeader title="Finance" subtitle="Invoice capture and three-way match" />
      <CardBody className="flex flex-col gap-4">
        {!invoice && canSubmit && (
          submitting ? (
            <form onSubmit={submitForm} className="flex flex-col gap-3 rounded-lg border border-line p-3">
              <input type="hidden" name="case_id" value={caseId} />
              <div className="grid gap-3 sm:grid-cols-3">
                <TextInput label="Supplier invoice #" name="invoice_number" required />
                <TextInput label="Payment terms" name="payment_terms" placeholder="e.g. Net 30" hint="Optional" />
                <TextInput label="Due date" name="due_date" type="date" hint="Optional" />
              </div>

              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-ink">Line items</p>
                <button
                  type="button"
                  onClick={() => setRows((r) => [...r, { id: nextId++, description: "", unit: "", qty: 1, unitCost: 0 }])}
                  className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add item
                </button>
              </div>
              {rows.map((row, i) => (
                <div key={row.id} className="grid grid-cols-12 items-end gap-2">
                  <div className="col-span-12 sm:col-span-5">
                    <TextInput label={i === 0 ? "Item" : ""} name="item_description" defaultValue={row.description} />
                  </div>
                  <div className="col-span-3 sm:col-span-2">
                    <TextInput label={i === 0 ? "Unit" : ""} name="item_unit" defaultValue={row.unit} />
                  </div>
                  <div className="col-span-3 sm:col-span-2">
                    <NumberInput label={i === 0 ? "Qty" : ""} name="item_qty" min={0} decimals defaultValue={row.qty} />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <NumberInput label={i === 0 ? "Unit cost" : ""} name="item_unit_cost" min={0} decimals defaultValue={row.unitCost} />
                  </div>
                  {rows.length > 1 && (
                    <div className="col-span-2 flex justify-end sm:col-span-1">
                      <button
                        type="button"
                        onClick={() => setRows((r) => r.filter((x) => x.id !== row.id))}
                        aria-label="Remove item"
                        className="rounded-md p-2 text-ink-faint hover:bg-surface-sunk hover:text-critical"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
              <NumberInput label="Tax" name="tax" min={0} decimals defaultValue={0} unit={currency} />
              {submitState.error && <p className="text-xs text-critical">{submitState.error}</p>}
              <div className="flex gap-2">
                <Button type="submit" size="sm" busy={submitPending}>
                  Submit invoice
                </Button>
                <button type="button" onClick={() => setSubmitting(false)} className="text-xs font-semibold text-ink-faint hover:text-ink">
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setSubmitting(true)}>
              Submit invoice
            </Button>
          )
        )}

        {!invoice && !canSubmit && (
          <p className="text-sm text-ink-faint">No invoice has been submitted for this case yet.</p>
        )}

        {invoice && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-ink">Invoice {invoice.invoice_number}</p>
                <p className="text-xs text-ink-faint">
                  {formatMoney(invoice.total_cents, { currency: invoice.currency })} · submitted {formatDate(invoice.submitted_at)}
                </p>
              </div>
              <Badge tone={STATUS_TONE[invoice.status]}>{invoice.status}</Badge>
            </div>

            {invoice.exceptions.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Match exceptions</p>
                {invoice.exceptions.map((ex) => (
                  <div key={ex.id} className="rounded-lg border border-line p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-ink">{ex.detail}</p>
                      <Badge tone={ex.status === "resolved" ? "good" : "attention"}>{ex.status}</Badge>
                    </div>
                    {ex.resolution_note && <p className="mt-1 text-xs text-ink-soft">&ldquo;{ex.resolution_note}&rdquo;</p>}
                    {ex.status === "open" && canApprove && (
                      resolvingId === ex.id ? (
                        <form onSubmit={resolveForm} className="mt-2 flex flex-col gap-2">
                          <input type="hidden" name="exception_id" value={ex.id} />
                          <input type="hidden" name="case_id" value={caseId} />
                          <TextArea label="How was this resolved?" name="resolution_note" rows={2} />
                          {resolveState.error && <p className="text-xs text-critical">{resolveState.error}</p>}
                          <div className="flex gap-2">
                            <Button type="submit" size="sm" busy={resolvePending}>
                              Save
                            </Button>
                            <button type="button" onClick={() => setResolvingId(null)} className="text-xs font-semibold text-ink-faint hover:text-ink">
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setResolvingId(ex.id)}
                          className="mt-2 text-xs font-semibold text-brand hover:underline"
                        >
                          Resolve
                        </button>
                      )
                    )}
                  </div>
                ))}
              </div>
            )}

            {invoice.status === "matched" && canApprove && (
              <div className="flex flex-col items-start gap-1">
                <Button size="sm" busy={approvePending} onClick={approve}>
                  Approve for payment
                </Button>
                {approveError && <p className="text-xs text-critical">{approveError}</p>}
              </div>
            )}

            {invoice.status === "approved" && canRecordPayment && (
              paying ? (
                <form onSubmit={payForm} className="flex flex-col gap-2.5 rounded-lg border border-line p-3">
                  <input type="hidden" name="invoice_id" value={invoice.id} />
                  <input type="hidden" name="case_id" value={caseId} />
                  <TextInput label="Payment reference" name="reference" hint="Optional — a transaction ID or cheque number" />
                  {payState.error && <p className="text-xs text-critical">{payState.error}</p>}
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" busy={payPending}>
                      Record payment
                    </Button>
                    <button type="button" onClick={() => setPaying(false)} className="text-xs font-semibold text-ink-faint hover:text-ink">
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => setPaying(true)}>
                  Record payment
                </Button>
              )
            )}

            {invoice.status === "paid" && (
              <p className="text-xs text-ink-faint">
                Paid {formatDate(invoice.paid_at)}
                {invoice.payment_reference ? ` · ref. ${invoice.payment_reference}` : ""}
              </p>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
