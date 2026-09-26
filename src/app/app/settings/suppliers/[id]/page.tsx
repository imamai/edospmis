import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { requireSession, can } from "@/lib/data/session";
import { getPurchaseOrderReport } from "@/lib/data/procurement-reports";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PdfLinkButton } from "@/components/ui/pdf-link-button";
import { formatDate, formatMoney } from "@/lib/utils";
import type { Supplier } from "@/lib/database.types";

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (!can(session, "procurement.supplier.manage")) {
    return (
      <div className="empty-frame mx-auto max-w-md px-6 py-10 text-center text-sm text-ink-faint">
        You don&rsquo;t have permission to manage suppliers in this workspace.
      </div>
    );
  }

  const supabase = await createClient();
  const { data: supplier } = await supabase
    .from("edospmis_suppliers")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", session.tenant.id)
    .maybeSingle();
  if (!supplier) notFound();
  const s = supplier as Supplier;

  // All-time, unfiltered by period — a supplier's history is the point of
  // this page, not a period slice of it; reuses the same report data the
  // Purchase orders report already builds, just narrowed to this supplier.
  const allPos = await getPurchaseOrderReport(session.tenant.id);
  const pos = allPos.filter((p) => p.supplier_id === id);
  const totalValue = pos.reduce((sum, p) => sum + p.total_cents, 0);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Link href="/app/settings/suppliers" className="flex w-fit items-center gap-1 text-sm font-semibold text-ink-soft hover:text-brand">
          <ArrowLeft className="h-3.5 w-3.5" />
          Suppliers
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-ink">{s.name}</h1>
            <p className="mt-1 text-sm text-ink-faint">
              {s.email ?? "No email on file"} {s.phone && `· ${s.phone}`}
            </p>
          </div>
          <Badge tone={s.is_active ? "good" : "neutral"}>{s.is_active ? "active" : "archived"}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card>
          <CardBody>
            <p className="text-xs text-ink-faint">Purchase orders</p>
            <p className="mt-0.5 text-lg font-semibold tnum text-ink">{pos.length}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs text-ink-faint">Total value</p>
            <p className="mt-0.5 text-lg font-semibold tnum text-ink">{formatMoney(totalValue)}</p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Purchase orders allocated to this supplier" />
        <CardBody className="overflow-x-auto">
          {pos.length === 0 ? (
            <p className="text-sm text-ink-faint">No purchase orders have gone to this supplier yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-faint">
                  <th className="pb-2 pr-4 font-medium">PO number</th>
                  <th className="pb-2 pr-4 font-medium">PR No.</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 text-right font-medium">Total</th>
                  <th className="pb-2 pr-4 font-medium">Issued</th>
                  <th className="pb-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {pos.map((p) => (
                  <tr key={p.po_id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-4 font-mono text-xs text-ink">{p.po_number}</td>
                    <td className="py-2 pr-4 tnum">
                      <Link href={`/app/cases/${p.case_id}`} className="font-medium text-brand hover:underline">
                        {p.case_number}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">
                      <Badge tone={p.status === "issued" ? "good" : p.status === "pending_approval" ? "attention" : "critical"}>{p.status}</Badge>
                    </td>
                    <td className="py-2 pr-4 text-right tnum text-ink-soft">{formatMoney(p.total_cents, { currency: p.currency })}</td>
                    <td className="py-2 pr-4 text-ink-soft">{formatDate(p.issued_at)}</td>
                    <td className="py-2 text-right">
                      <PdfLinkButton
                        href={`/api/export/po/${p.po_id}`}
                        title={`Purchase order ${p.po_number}`}
                        filename={p.po_number}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-ink-faint hover:text-brand"
                      >
                        <Download className="h-3.5 w-3.5" />
                        PDF
                      </PdfLinkButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
