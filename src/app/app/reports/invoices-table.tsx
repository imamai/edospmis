"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Download } from "lucide-react";
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
 * The one deliberate exception to reports staying read-only (see the
 * write-up shared with the user first): a batch "pay several invoices at
 * once" action, so a Finance user isn't forced to open each case
 * individually. Every checkbox call still goes through the exact same
 * edospmis_record_payment RPC (via bulkRecordPayments), once per invoice —
 * no separate mutation logic, just a faster way to reach the existing one.
 */
export function InvoicesTable({ rows, canPay }: { rows: InvoiceReportRow[]; canPay: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [payOpen, setPayOpen] = useState(false);
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const payableRows = useMemo(() => rows.filter((r) => PAYABLE_STATUSES.has(r.status)), [rows]);
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
    startTransition(async () => {
      const result = await bulkRecordPayments([...selected], reference, method);
      if (result.error) {
        setError(result.error);
        return;
      }
      setPayOpen(false);
      setSelected(new Set());
      setMethod("");
      setReference("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
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
                      {payable && (
                        <input type="checkbox" checked={selected.has(r.invoice_id)} onChange={() => toggle(r.invoice_id)} aria-label={`Select ${r.invoice_number}`} />
                      )}
                    </td>
                  )}
                  <td className="py-2 pr-4 font-mono text-xs text-ink">{r.invoice_number}</td>
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
                  <td className="py-2 pr-4 text-ink-soft">{r.due_date ? formatDate(r.due_date) : "—"}</td>
                  <td className="py-2 pr-4 tnum text-ink-soft">{formatDate(r.submitted_at)}</td>
                  <td className="py-2 text-right">
                    <PdfLinkButton
                      href={`/api/export/invoice/${r.invoice_id}`}
                      title={`Invoice ${r.invoice_number}`}
                      filename={r.invoice_number}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-ink-faint hover:text-brand"
                    >
                      <Download className="h-3.5 w-3.5" />
                      PDF
                    </PdfLinkButton>
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
