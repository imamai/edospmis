"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileText } from "lucide-react";
import { bulkRecordPayments } from "@/app/app/finance/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal, ModalFormActions } from "@/components/ui/modal";
import { PdfLinkButton } from "@/components/ui/pdf-link-button";
import { SelectInput, TextInput } from "@/components/ui/field";
import { PAYMENT_METHODS } from "@/lib/payment-methods";
import { formatDate, formatMoney } from "@/lib/utils";
import type { InvoiceReportRow } from "@/lib/data/procurement-reports";

const PAYABLE_STATUSES = new Set(["approved"]);

/**
 * How overdue an invoice is, in whole days — negative while it is still
 * within terms.
 *
 * Payables are worked by due date, not by the order they arrived in: paying
 * late costs the supplier relationship and sometimes a penalty, paying early
 * costs working capital for no gain. The report showed a due date and nothing
 * else, so neither could be seen at a glance.
 */
function daysOverdue(dueDate: string | null, today: Date): number | null {
  if (!dueDate) return null;
  const due = new Date(`${dueDate}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  return Math.floor((today.getTime() - due.getTime()) / 86_400_000);
}

const AGE_BANDS = [
  { label: "Overdue 60+ days", min: 60 },
  { label: "Overdue 31–60 days", min: 31 },
  { label: "Overdue 1–30 days", min: 1 },
] as const;

/**
 * The one deliberate exception to reports staying read-only (see the
 * write-up shared with the user first): a batch "pay several invoices at
 * once" action, so a Finance user isn't forced to open each case
 * individually. Every checkbox call still goes through the exact same
 * edospmis_record_payment RPC (via bulkRecordPayments), once per invoice —
 * no separate mutation logic, just a faster way to reach the existing one.
 */
export function InvoicesTable({
  rows,
  canPay,
  canViewDocument,
  canViewPo,
}: {
  rows: InvoiceReportRow[];
  canPay: boolean;
  canViewDocument: boolean;
  canViewPo: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [payOpen, setPayOpen] = useState(false);
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "good" | "attention"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const payableRows = useMemo(() => rows.filter((r) => PAYABLE_STATUSES.has(r.status)), [rows]);

  // Fixed once per render rather than read per row, so every age on screen is
  // measured from the same moment.
  const today = useMemo(() => new Date(new Date().toDateString()), []);
  const overdueRows = payableRows.filter((r) => (daysOverdue(r.due_date, today) ?? -1) >= 1);
  const overdueTotal = overdueRows.reduce((sum, r) => sum + r.total_cents, 0);
  const dueSoonRows = payableRows.filter((r) => {
    const age = daysOverdue(r.due_date, today);
    return age !== null && age < 1 && age >= -7;
  });
  const undated = payableRows.filter((r) => !r.due_date).length;
  const payableTotal = payableRows.reduce((sum, r) => sum + r.total_cents, 0);
  const paidTotal = rows.filter((r) => r.status === "paid").reduce((sum, r) => sum + r.total_cents, 0);

  // When every row belongs to one supplier the report has been narrowed to
  // them, and the summary can say whose money this is.
  const supplierNames = new Set(rows.map((r) => r.supplier_name).filter(Boolean));
  const singleSupplier = supplierNames.size === 1 ? [...supplierNames][0] : null;
  const selectedRows = rows.filter((r) => selected.has(r.invoice_id));
  const selectedTotal = selectedRows.reduce((sum, r) => sum + r.total_cents, 0);
  const allPayableSelected = payableRows.length > 0 && payableRows.every((r) => selected.has(r.invoice_id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allPayableSelected ? new Set() : new Set(payableRows.map((r) => r.invoice_id)));
  }

  function confirmPay() {
    if (!method) {
      setError("Choose how these were paid.");
      return;
    }
    setError(null);
    const count = selected.size;
    startTransition(async () => {
      const { paid, failures } = await bulkRecordPayments([...selected], reference, method);
      // Nothing went through — stay in the dialog so the method and reference
      // that were just typed aren't lost on the way to a retry.
      if (paid === 0) {
        setError(failures[0] ?? "None of these could be paid.");
        return;
      }
      const reasons = [...new Set(failures)].join(" ");
      setNotice(
        failures.length === 0
          ? { tone: "good", text: `${paid} invoice${paid === 1 ? "" : "s"} marked paid.` }
          : {
              tone: "attention",
              text: `${paid} of ${count} marked paid. ${failures.length} could not be: ${reasons}`,
            },
      );
      setPayOpen(false);
      setSelected(new Set());
      setMethod("");
      setReference("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {notice && (
        <div
          className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm ${
            notice.tone === "good" ? "border-good/30 bg-good-soft text-good" : "border-attention/30 bg-attention-soft text-attention"
          }`}
          role="status"
        >
          <p>{notice.text}</p>
          <button type="button" onClick={() => setNotice(null)} className="shrink-0 text-xs font-semibold underline">
            Dismiss
          </button>
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border border-line bg-surface-sunk px-3 py-2.5 text-sm">
          <span className="font-medium text-ink">
            {singleSupplier ? singleSupplier : `${supplierNames.size} suppliers`}
          </span>
          <span className="text-ink-soft">
            Awaiting payment:{" "}
            <span className="tnum font-semibold text-ink">{formatMoney(payableTotal)}</span>
            <span className="text-ink-faint"> ({payableRows.length})</span>
          </span>
          <span className="text-ink-soft">
            Already paid: <span className="tnum font-medium text-ink-soft">{formatMoney(paidTotal)}</span>
          </span>
          {canPay && payableRows.length > 0 && selected.size === 0 && (
            <>
              {/* Answers "which of these can I choose?" on the screen, rather
                  than only in a refusal after the fact: any approved invoice,
                  one by one or all at once. */}
              <span className="text-xs text-ink-faint">Tick any approved invoice — approval has to come first.</span>
              <button type="button" onClick={toggleAll} className="ml-auto text-xs font-semibold text-brand hover:underline">
                Select all {payableRows.length} payable
              </button>
            </>
          )}
        </div>
      )}

      {payableRows.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Payables by age</span>
          {overdueRows.length > 0 ? (
            AGE_BANDS.map((band, i) => {
              const upper = i === 0 ? Infinity : AGE_BANDS[i - 1].min - 1;
              const inBand = overdueRows.filter((r) => {
                const age = daysOverdue(r.due_date, today) ?? 0;
                return age >= band.min && age <= upper;
              });
              if (inBand.length === 0) return null;
              return (
                <span key={band.label} className="text-ink-soft">
                  {band.label}:{" "}
                  <span className="tnum font-semibold text-critical">
                    {formatMoney(inBand.reduce((sum, r) => sum + r.total_cents, 0))}
                  </span>
                  <span className="text-ink-faint"> ({inBand.length})</span>
                </span>
              );
            })
          ) : (
            <span className="text-ink-soft">Nothing overdue</span>
          )}
          {dueSoonRows.length > 0 && (
            <span className="text-ink-soft">
              Due within 7 days:{" "}
              <span className="tnum font-semibold text-attention">
                {formatMoney(dueSoonRows.reduce((sum, r) => sum + r.total_cents, 0))}
              </span>
              <span className="text-ink-faint"> ({dueSoonRows.length})</span>
            </span>
          )}
          {undated > 0 && (
            <span className="text-ink-faint">
              {undated} without a due date — these cannot be aged
            </span>
          )}
          {canPay && overdueRows.length > 0 && selected.size === 0 && (
            <button
              type="button"
              onClick={() => setSelected(new Set(overdueRows.map((r) => r.invoice_id)))}
              className="ml-auto text-xs font-semibold text-brand hover:underline"
            >
              Select the {overdueRows.length} overdue ({formatMoney(overdueTotal)})
            </button>
          )}
        </div>
      )}

      {canPay && selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand/30 bg-brand-soft px-3 py-2.5">
          <p className="text-sm font-medium text-brand">
            {selected.size} selected · {formatMoney(selectedTotal)}
          </p>
          <Button size="sm" onClick={() => setPayOpen(true)}>
            Mark paid
          </Button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-faint">
              {canPay && (
                <th className="pb-2 pr-2 font-medium">
                  <input
                    type="checkbox"
                    aria-label="Select all payable invoices"
                    checked={allPayableSelected}
                    onChange={toggleAll}
                    disabled={payableRows.length === 0}
                  />
                </th>
              )}
              <th className="pb-2 pr-4 font-medium">Invoice number</th>
              <th className="pb-2 pr-4 font-medium">PO number</th>
              <th className="pb-2 pr-4 font-medium">PR No.</th>
              <th className="pb-2 pr-4 font-medium">Department</th>
              <th className="pb-2 pr-4 font-medium">Supplier</th>
              <th className="pb-2 pr-4 font-medium">Status</th>
              <th className="pb-2 pr-4 text-right font-medium">Total</th>
              <th className="pb-2 pr-4 font-medium">Due</th>
              <th className="pb-2 pr-4 font-medium">Submitted</th>
              <th className="pb-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const payable = PAYABLE_STATUSES.has(r.status);
              return (
                <tr key={r.invoice_id} className="border-b border-line last:border-0">
                  {canPay && (
                    <td className="py-2 pr-2">
                      {payable ? (
                        <input type="checkbox" checked={selected.has(r.invoice_id)} onChange={() => toggle(r.invoice_id)} aria-label={`Select ${r.invoice_number}`} />
                      ) : (
                        <span
                          className="block text-center text-xs text-ink-faint"
                          title={
                            r.status === "paid"
                              ? "Already paid"
                              : r.status === "exception"
                                ? "Has an unresolved match exception"
                                : r.status === "void"
                                  ? "Voided"
                                  : "Not approved for payment yet"
                          }
                        >
                          &mdash;
                        </span>
                      )}
                    </td>
                  )}
                  <td className="py-2 pr-4 font-mono text-xs text-ink">{r.invoice_number}</td>
                  {/* An invoice always settles one purchase order — saying
                      which one is what makes this a step in the chain rather
                      than a standalone ledger. */}
                  <td className="py-2 pr-4">
                    {r.po_number && canViewPo ? (
                      <PdfLinkButton
                        href={`/api/export/po/${r.po_id}`}
                        title={`Purchase order ${r.po_number}`}
                        filename={r.po_number}
                        className="font-mono text-xs text-ink-soft hover:text-brand hover:underline"
                      >
                        {r.po_number}
                      </PdfLinkButton>
                    ) : (
                      <span className="font-mono text-xs text-ink-soft">{r.po_number ?? "—"}</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 tnum">
                    <Link href={`/app/cases/${r.case_id}`} className="font-medium text-brand hover:underline">
                      {r.case_number}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-ink-soft">{r.department_name ?? "—"}</td>
                  <td className="py-2 pr-4 text-ink-soft">{r.supplier_name}</td>
                  <td className="py-2 pr-4">
                    <Badge
                      tone={
                        r.status === "paid"
                          ? "good"
                          : r.status === "exception"
                            ? "critical"
                            : r.status === "approved" || r.status === "matched"
                              ? "info"
                              : r.status === "void"
                                ? "neutral"
                                : "attention"
                      }
                    >
                      {r.status}
                    </Badge>
                  </td>
                  <td className="py-2 pr-4 text-right tnum text-ink-soft">{formatMoney(r.total_cents, { currency: r.currency })}</td>
                  <td className="py-2 pr-4 text-ink-soft">
                    {r.due_date ? (
                      <span className="flex flex-col">
                        <span>{formatDate(r.due_date)}</span>
                        {payable &&
                          (() => {
                            const age = daysOverdue(r.due_date, today);
                            if (age === null) return null;
                            if (age >= 1)
                              return (
                                <span className="text-xs font-semibold text-critical">
                                  {age} day{age === 1 ? "" : "s"} overdue
                                </span>
                              );
                            if (age >= -7)
                              return <span className="text-xs font-semibold text-attention">due in {-age} days</span>;
                            return null;
                          })()}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 pr-4 tnum text-ink-soft">{formatDate(r.submitted_at)}</td>
                  <td className="py-2 text-right">
                    {canViewDocument && (
                    <PdfLinkButton
                      href={`/api/export/invoice/${r.invoice_id}`}
                      filename={r.invoice_number}
                      title={`Invoice ${r.invoice_number}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-ink-faint hover:text-brand"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      PDF
                    </PdfLinkButton>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal open={payOpen} onClose={() => setPayOpen(false)} title={`Mark ${selected.size} invoice${selected.size === 1 ? "" : "s"} paid`} dismissible={!pending} size="sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            confirmPay();
          }}
          className="flex flex-col gap-3"
        >
          <p className="text-sm text-ink-soft">Total {formatMoney(selectedTotal)} across the selected invoices.</p>
          <SelectInput label="Payment method" value={method} onChange={(e) => setMethod(e.target.value)} required>
            <option value="" disabled>
              Choose how these were paid
            </option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </SelectInput>
          <TextInput
            label="Payment reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            hint="Optional — applied to every selected invoice"
          />
          {error && <p className="text-xs text-critical">{error}</p>}
          <ModalFormActions onCancel={() => setPayOpen(false)} submitLabel="Mark paid" busy={pending} />
        </form>
      </Modal>
    </div>
  );
}
