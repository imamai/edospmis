import { NextResponse } from "next/server";
import { requireSession, can } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { documentResponse, fetchLogoDataUrl, type DocumentExport } from "@/lib/export/document";
import { formatDate, formatMoney } from "@/lib/utils";
import type { PRItem, PurchaseOrder } from "@/lib/database.types";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (!can(session, "procurement.po.view")) {
    return NextResponse.json({ error: "You don't have permission to view purchase orders." }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: po } = await supabase
    .from("edospmis_purchase_orders")
    .select("*, edospmis_suppliers(name), edospmis_cases(case_number)")
    .eq("id", id)
    .eq("tenant_id", session.tenant.id)
    .maybeSingle();
  if (!po) return NextResponse.json({ error: "Purchase order not found." }, { status: 404 });

  const record = po as unknown as PurchaseOrder & {
    edospmis_suppliers: { name: string } | null;
    edospmis_cases: { case_number: string } | null;
  };
  const items = (record.items as PRItem[]) ?? [];
  const tenantLogoDataUrl = await fetchLogoDataUrl(session.tenant.branding.logo_url);

  const doc: DocumentExport = {
    tenantName: session.tenant.name,
    tenantAddress: session.tenant.branding.address,
    tenantPhone: session.tenant.branding.phone,
    tenantEmail: session.tenant.branding.email,
    tenantRegistrationNumber: session.tenant.branding.registration_number,
    tenantLogoDataUrl,
    docType: "Purchase Order",
    docNumber: record.po_number,
    statusLabel: record.status.replace(/_/g, " "),
    fields: [
      { label: "Supplier", value: record.edospmis_suppliers?.name ?? "—" },
      { label: "PR No.", value: record.edospmis_cases?.case_number ?? "—" },
      { label: "Issued", value: formatDate(record.issued_at) },
      { label: "Expected delivery", value: record.expected_delivery_date ? formatDate(record.expected_delivery_date) : "Not set" },
    ],
    itemColumns: ["Description", "Qty", "Unit", "Unit cost", "Total"],
    items: items.map((item) => ({
      description: item.description,
      qty: item.qty,
      unit: item.unit,
      unitCost: formatMoney(item.estimated_unit_cost_cents, { currency: record.currency }),
      total: formatMoney(item.qty * item.estimated_unit_cost_cents, { currency: record.currency }),
    })),
    totals: [{ label: "Total", value: formatMoney(record.total_cents, { currency: record.currency }), strong: true }],
    footerNote: `Issued by ${session.tenant.name} via EDOSPMIS. This purchase order is only valid once issued (not while pending approval or cancelled).`,
  };

  return documentResponse(`${record.po_number}`, doc);
}
