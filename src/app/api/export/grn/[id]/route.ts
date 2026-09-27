import { NextResponse } from "next/server";
import { requireSession, can } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { documentResponse, fetchLogoDataUrl, type DocumentExport } from "@/lib/export/document";
import { formatDate } from "@/lib/utils";
import type { Grn, GrnItem, Inspection } from "@/lib/database.types";

/**
 * The goods received note as a document — the piece of paper a storekeeper
 * signs and a supplier is shown when there is a dispute about what actually
 * arrived.
 *
 * It carries the ordered quantity beside the received one, and the condition
 * of each line, because the whole value of a GRN is in the difference between
 * what was ordered and what turned up. The inspection result, where one has
 * been recorded, is part of the document rather than a separate note: a GRN
 * that says "inspected" without saying what the inspection found is not
 * evidence of anything.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (!can(session, "receiving.grn.view")) {
    return NextResponse.json({ error: "You don't have permission to view goods received notes." }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: grn } = await supabase
    .from("edospmis_grns")
    .select("*, edospmis_purchase_orders(po_number, currency, edospmis_suppliers(name)), edospmis_cases(case_number)")
    .eq("id", id)
    .eq("tenant_id", session.tenant.id)
    .maybeSingle();
  if (!grn) return NextResponse.json({ error: "Goods received note not found." }, { status: 404 });

  const record = grn as unknown as Grn & {
    edospmis_purchase_orders: { po_number: string; currency: string; edospmis_suppliers: { name: string } | null } | null;
    edospmis_cases: { case_number: string } | null;
  };

  const [{ data: items }, { data: inspection }, { data: receiver }] = await Promise.all([
    supabase.from("edospmis_grn_items").select("*").eq("grn_id", id).order("description"),
    supabase.from("edospmis_inspections").select("*").eq("grn_id", id).maybeSingle(),
    record.received_by
      ? supabase.from("edospmis_users").select("full_name, email").eq("id", record.received_by).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const lines = (items ?? []) as GrnItem[];
  const inspected = inspection as Inspection | null;
  const receivedByName =
    (receiver as { full_name: string | null; email: string } | null)?.full_name ??
    (receiver as { email: string } | null)?.email ??
    "—";

  const fields = [
    { label: "Supplier", value: record.edospmis_purchase_orders?.edospmis_suppliers?.name ?? "—" },
    { label: "PO No.", value: record.edospmis_purchase_orders?.po_number ?? "—" },
    { label: "PR No.", value: record.edospmis_cases?.case_number ?? "—" },
    { label: "Received", value: formatDate(record.received_at) },
    { label: "Received by", value: receivedByName },
  ];
  if (inspected) {
    fields.push({ label: "Inspection", value: inspected.result });
    if (inspected.inspected_at) fields.push({ label: "Inspected", value: formatDate(inspected.inspected_at) });
  }

  // A short discrepancy line so the exception is visible on the face of the
  // document rather than only inferable by comparing two columns.
  const discrepancies = lines.filter((l) => l.condition !== "accepted" || l.received_qty !== l.ordered_qty);
  const note = discrepancies.length
    ? `${discrepancies.length} of ${lines.length} line${lines.length === 1 ? "" : "s"} ${
        discrepancies.length === 1 ? "differs" : "differ"
      } from the order — see the condition column.`
    : "All lines received in full and accepted.";

  const doc: DocumentExport = {
    tenantName: session.tenant.name,
    tenantAddress: session.tenant.branding.address,
    tenantPhone: session.tenant.branding.phone,
    tenantEmail: session.tenant.branding.email,
    tenantRegistrationNumber: session.tenant.branding.registration_number,
    tenantLogoDataUrl: await fetchLogoDataUrl(session.tenant.branding.logo_url),
    docType: "Goods Received Note",
    docNumber: record.grn_number,
    statusLabel: record.status.replace(/_/g, " "),
    fields,
    // Same document shape as the purchase order — DocumentLineItem's slots are
    // generic and itemColumns names them, so a GRN puts ordered/received/
    // condition where a PO puts qty/unit cost/total.
    itemColumns: ["Description", "Ordered", "Unit", "Received", "Condition"],
    items: lines.map((line) => ({
      description: line.description,
      qty: line.ordered_qty,
      unit: line.unit ?? "unit",
      unitCost: String(line.received_qty),
      total: line.condition,
    })),
    totals: [
      { label: "Lines received", value: String(lines.length) },
      { label: "With a discrepancy", value: String(discrepancies.length), strong: discrepancies.length > 0 },
    ],
    footerNote: `${note}${record.notes ? ` Notes: ${record.notes}` : ""}${
      inspected?.comments ? ` Inspection comments: ${inspected.comments}` : ""
    } Issued by ${session.tenant.name} via EDOSPMIS.`,
  };

  return documentResponse(`${record.grn_number}`, doc);
}
