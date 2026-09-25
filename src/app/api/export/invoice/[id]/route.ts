import { NextResponse } from "next/server";
import { requireSession, can } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { documentResponse, type DocumentExport } from "@/lib/export/document";
import { formatDate, formatMoney } from "@/lib/utils";
import type { Invoice, InvoiceItem } from "@/lib/database.types";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (!can(session, "finance.invoice.view")) {
    return NextResponse.json({ error: "You don't have permission to view invoices." }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: invoice } = await supabase
    .from("edospmis_invoices")
    .select("*, edospmis_suppliers(name), edospmis_cases(case_number), edospmis_purchase_orders(po_number)")
    .eq("id", id)
    .eq("tenant_id", session.tenant.id)
    .maybeSingle();
  if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

  const record = invoice as unknown as Invoice & {
    edospmis_suppliers: { name: string } | null;
    edospmis_cases: { case_number: string } | null;
    edospmis_purchase_orders: { po_number: string } | null;
  };
  const items = (record.items as InvoiceItem[]) ?? [];

  const doc: DocumentExport = {
    tenantName: session.tenant.name,
    docType: "Invoice",
    docNumber: record.invoice_number,
    statusLabel: record.status.replace(/_/g, " "),
    fields: [
      { label: "Supplier", value: record.edospmis_suppliers?.name ?? "—" },
      { label: "Case", value: record.edospmis_cases?.case_number ?? "—" },
      { label: "Purchase order", value: record.edospmis_purchase_orders?.po_number ?? "—" },
      { label: "Payment terms", value: record.payment_terms ?? "Not set" },
      { label: "Due date", value: record.due_date ? formatDate(record.due_date) : "Not set" },
      { label: "Submitted", value: formatDate(record.submitted_at) },
    ],
    itemColumns: ["Description", "Qty", "Unit", "Unit cost", "Total"],
    items: items.map((item) => ({
      description: item.description,
      qty: item.qty,
      unit: item.unit,
      unitCost: formatMoney(item.unit_cost_cents, { currency: record.currency }),
      total: formatMoney(item.qty * item.unit_cost_cents, { currency: record.currency }),
    })),
    totals: [
      { label: "Subtotal", value: formatMoney(record.subtotal_cents, { currency: record.currency }) },
      { label: "Tax", value: formatMoney(record.tax_cents, { currency: record.currency }) },
      { label: "Total", value: formatMoney(record.total_cents, { currency: record.currency }), strong: true },
    ],
    footerNote: record.paid_at
      ? `Paid ${formatDate(record.paid_at)}${record.payment_reference ? ` · reference ${record.payment_reference}` : ""}.`
      : undefined,
  };

  return documentResponse(`${record.invoice_number}`, doc);
}
