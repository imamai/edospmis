import { NextResponse } from "next/server";
import { requireSession, can } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { tableResponse, formatOf, type Cell } from "@/lib/export/table";

/**
 * Accounting/ERP export (PRD FR-31): invoices as CSV, Excel or PDF — not a
 * native ledger or a specific ERP's own API, "integration-ready" in the
 * PRD's own words.
 */

export async function GET(req: Request) {
  const session = await requireSession();
  if (!can(session, "reports.export")) {
    return NextResponse.json({ error: "You don't have permission to export reports." }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: invoices } = await supabase
    .from("edospmis_invoices")
    .select(
      "invoice_number, status, subtotal_cents, tax_cents, total_cents, currency, payment_terms, due_date, submitted_at, approved_at, paid_at, payment_reference, edospmis_cases(case_number), edospmis_purchase_orders(po_number), edospmis_suppliers(name)",
    )
    .eq("tenant_id", session.tenant.id)
    .order("submitted_at", { ascending: false });

  const header = [
    "Invoice Number",
    "Case",
    "PO Number",
    "Supplier",
    "Status",
    "Subtotal",
    "Tax",
    "Total",
    "Currency",
    "Payment Terms",
    "Due Date",
    "Submitted",
    "Approved",
    "Paid",
    "Payment Reference",
  ];

  const rows: Cell[][] = (invoices ?? []).map((inv) => {
    const c = Array.isArray(inv.edospmis_cases) ? inv.edospmis_cases[0] : inv.edospmis_cases;
    const po = Array.isArray(inv.edospmis_purchase_orders) ? inv.edospmis_purchase_orders[0] : inv.edospmis_purchase_orders;
    const s = Array.isArray(inv.edospmis_suppliers) ? inv.edospmis_suppliers[0] : inv.edospmis_suppliers;
    return [
      inv.invoice_number,
      (c as { case_number: string } | null)?.case_number ?? "",
      (po as { po_number: string } | null)?.po_number ?? "",
      (s as { name: string } | null)?.name ?? "",
      inv.status,
      inv.subtotal_cents / 100,
      inv.tax_cents / 100,
      inv.total_cents / 100,
      inv.currency,
      inv.payment_terms ?? "",
      inv.due_date ?? "",
      inv.submitted_at,
      inv.approved_at ?? "",
      inv.paid_at ?? "",
      inv.payment_reference ?? "",
    ];
  });

  const format = formatOf(new URL(req.url).searchParams.get("format"));
  return tableResponse(format, {
    name: `${session.tenant.name.replace(/[^a-z0-9]+/gi, "-")}-invoices`,
    title: "Invoices",
    tenantName: session.tenant.name,
    header,
    rows,
  });
}
