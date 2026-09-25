"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { inviteSupplierToRfq, recordQuotation, awardPO, approvePO, type ProcurementState } from "../../procurement/actions";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NumberInput, SelectInput, TextArea, TextInput } from "@/components/ui/field";
import { formatDate, formatMoney } from "@/lib/utils";
import type { ProcurementDetail } from "@/lib/data/procurement";
import type { Supplier } from "@/lib/database.types";

const initialQuotation: ProcurementState = { error: null, ok: null };

export function ProcurementPanel({
  detail,
  suppliers,
  canInvite,
  canAward,
  canApprovePO,
}: {
  detail: ProcurementDetail;
  suppliers: Supplier[];
  canInvite: boolean;
  canAward: boolean;
  canApprovePO: boolean;
}) {
  const router = useRouter();
  const { rfq, invitedSupplierIds, quotations, po } = detail;
  const invitedSet = new Set(invitedSupplierIds);
  const uninvited = suppliers.filter((s) => !invitedSet.has(s.id));

  const [invitePending, startInvite] = useTransition();
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [quoteState, quoteAction, quotePending] = useActionState(recordQuotation, initialQuotation);
  const [awardingId, setAwardingId] = useState<string | null>(null);
  const [awardNotes, setAwardNotes] = useState("");
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [awardPending, startAward] = useTransition();
  const [awardError, setAwardError] = useState<string | null>(null);
  const [approvePending, startApprovePO] = useTransition();
  const [approveError, setApproveError] = useState<string | null>(null);

  useEffect(() => {
    if (quoteState.ok) router.refresh();
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

  if (po) {
    return (
      <Card>
        <CardHeader
          title="Purchase order"
          subtitle={po.po_number}
          action={
            <ButtonLink href={`/api/export/po/${po.id}`} variant="secondary" size="sm">
              <Download className="h-3.5 w-3.5" />
              PDF
            </ButtonLink>
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
    <Card>
      <CardHeader title="Procurement" subtitle={rfq.title} />
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
          </div>
        )}

        {invitedSupplierIds.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-semibold text-ink">Invited</p>
            <div className="flex flex-wrap gap-1.5">
              {suppliers
                .filter((s) => invitedSet.has(s.id))
                .map((s) => (
                  <Badge key={s.id} tone="brand">
                    {s.name}
                  </Badge>
                ))}
            </div>
          </div>
        )}

        {canInvite && invitedSupplierIds.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-semibold text-ink">Record a quotation</p>
            <form action={quoteAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <input type="hidden" name="rfq_id" value={rfq.id} />
              <input type="hidden" name="case_id" value={rfq.case_id} />
              <SelectInput label="Supplier" name="supplier_id" required className="flex-1">
                <option value="">Choose</option>
                {suppliers
                  .filter((s) => invitedSet.has(s.id))
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </SelectInput>
              <NumberInput label="Total quoted" name="total" unit="KES" decimals required className="sm:w-40" />
              <Button type="submit" size="sm" busy={quotePending}>
                Record
              </Button>
            </form>
            {quoteState.error && <p className="mt-1 text-xs text-critical">{quoteState.error}</p>}
          </div>
        )}

        {quotations.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-semibold text-ink">Quotations received</p>
            <div className="flex flex-col divide-y divide-line">
              {quotations.map((q) => (
                <div key={q.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
                  <div>
                    <p className="text-sm font-medium text-ink">{q.supplier_name}</p>
                    <p className="text-xs text-ink-faint">
                      {formatMoney(q.total_cents, { currency: q.currency })} · {formatDate(q.submitted_at)}
                    </p>
                  </div>
                  {canAward &&
                    (awardingId === q.id ? (
                      <div className="flex flex-col items-end gap-1.5">
                        <TextInput
                          label=""
                          aria-label="Expected delivery date"
                          type="date"
                          value={expectedDelivery}
                          onChange={(e) => setExpectedDelivery(e.target.value)}
                          hint="Expected delivery — optional"
                          className="w-56"
                        />
                        <TextArea label="" aria-label="Award notes" value={awardNotes} onChange={(e) => setAwardNotes(e.target.value)} hint="Optional note" className="w-56" rows={2} />
                        <div className="flex gap-2">
                          <Button size="sm" busy={awardPending} onClick={() => confirmAward(q.id)}>
                            Confirm award
                          </Button>
                          <button type="button" onClick={() => setAwardingId(null)} className="text-xs font-semibold text-ink-faint hover:text-ink">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => setAwardingId(q.id)}>
                        Award
                      </Button>
                    ))}
                </div>
              ))}
            </div>
            {awardError && <p className="mt-1 text-xs text-critical">{awardError}</p>}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
