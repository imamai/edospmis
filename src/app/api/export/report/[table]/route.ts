import { documentError } from "@/lib/export/document";
import { requireSession, can } from "@/lib/data/session";
import { getAnalytics } from "@/lib/data/analytics";
import { getRfqReport, getPurchaseOrderReport, getGoodsReceivedReport, getInvoiceReport, getCycleTimeReport } from "@/lib/data/procurement-reports";
import { resolvePeriod } from "@/lib/report-period";
import { tableResponse, formatOf, type Cell } from "@/lib/export/table";
import { STAGE_LABEL, PO_STATUS_LABEL } from "@/lib/stage-labels";
import { deliveryState, overdueDays } from "@/lib/cycle-time";

const TABLES = [
  "cycle-time",
  "stage-durations",
  "sla-compliance",
  "supplier-performance",
  "spend-by-category",
  "aging",
  "rfqs",
  "purchase-orders",
  "goods-received",
  "invoices",
] as const;
type TableKey = (typeof TABLES)[number];

function isTableKey(v: string): v is TableKey {
  return (TABLES as readonly string[]).includes(v);
}

export async function GET(req: Request, { params }: { params: Promise<{ table: string }> }) {
  const { table } = await params;
  const session = await requireSession();
  if (!can(session, "reports.export")) {
    return documentError("You don't have permission to export reports.", 403);
  }
  if (!isTableKey(table)) {
    return documentError("Unknown report.", 404);
  }

  const url = new URL(req.url);
  const period = resolvePeriod({
    period: url.searchParams.get("period") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });
  const format = formatOf(url.searchParams.get("format"));

  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const statusFilter = url.searchParams.get("status") ?? "";
  const priorityFilter = url.searchParams.get("priority") ?? "";
  const stageFilter = url.searchParams.get("stage") ?? "";
  const deptFilter = (url.searchParams.get("dept") ?? "").trim().toLowerCase();

  const NEW_TABLES = ["rfqs", "purchase-orders", "goods-received", "invoices", "cycle-time"] as const;
  const isNewTable = (NEW_TABLES as readonly string[]).includes(table);
  const data = isNewTable ? null : await getAnalytics(session.tenant.id, { from: period.from, to: period.to });
  const reportPeriod = { from: period.from, to: period.to };

  const built: { title: string; header: string[]; rows: Cell[][] } = await (async () => {
    switch (table) {
      case "cycle-time": {
        const rows = await getCycleTimeReport(session.tenant.id, reportPeriod);
        return {
          title: "Procure-to-receive cycle time",
          // The day gaps go out as plain numbers, not "2.4 d" — a spreadsheet
          // that gets text in a numeric column cannot average it, which is
          // the first thing anyone does with this report.
          header: [
            "PR No.",
            "Department",
            "Stage",
            "PR Created on",
            "PR Approved on",
            "Days from PR Creation to PR Approval",
            "PO Date",
            "Days from PR Creation to PO Creation",
            "PO Approved on",
            "Days from PO Creation to PO Approval",
            "PO Generated On",
            "PO No.",
            "Expected Delivery",
            "GRPO Date",
            "GRPO No.",
            "Days from PO Approval to GRPO",
            "Delivery Variance (days)",
            "PO Closed on",
          ],
          rows: rows
            .filter(
              (r) =>
                (!q ||
                  r.case_number.toLowerCase().includes(q) ||
                  r.title.toLowerCase().includes(q) ||
                  (r.po_number ?? "").toLowerCase().includes(q)) &&
                (!statusFilter || r.status === statusFilter) &&
                (!deptFilter || (r.department_name ?? "").toLowerCase() === deptFilter),
            )
            .map((r) => [
              r.case_number,
              r.department_name ?? "—",
              STAGE_LABEL[r.status] ?? r.status,
              r.pr_created_at,
              r.pr_approved_at ?? "",
              r.days_pr_to_pr_approval ?? "",
              r.po_date ?? "",
              r.days_pr_to_po ?? "",
              r.po_approved_at ?? "",
              r.days_po_to_po_approval ?? "",
              r.po_created_at ?? "",
              r.po_number ?? "",
              r.expected_delivery_date ?? "",
              r.grn_date ?? "",
              r.grn_number ?? "",
              r.days_po_approval_to_grn ?? "",
              // A number, not "3 days late" — a column of text cannot be
              // averaged, and averaging it is the first thing anyone does.
              r.delivery_variance_days ?? "",
              r.po_closed_at ?? "",
            ]),
        };
      }
      case "stage-durations":
        return {
          title: "Time in each stage",
          header: ["Stage", "Cases seen", "Currently in", "Avg minutes", "Waiting now (min)"],
          rows: data!.stageDurations
            .filter((s) => !stageFilter || s.stage_key === stageFilter)
            .map((s) => [
              STAGE_LABEL[s.stage_key] ?? s.stage_key,
              s.cases_seen,
              s.currently_in,
              s.avg_minutes === null ? "" : Math.round(s.avg_minutes),
              s.open_avg_minutes === null ? "" : Math.round(s.open_avg_minutes),
            ]),
        };
      case "sla-compliance":
        return {
          title: "Approval SLA compliance",
          header: ["Stage", "On time", "Breached", "Total"],
          rows: data!.slaCompliance
            .filter((s) => !stageFilter || s.stage_key === stageFilter)
            .map((s) => [STAGE_LABEL[s.stage_key] ?? s.stage_key, s.on_time, s.breached, s.total]),
        };
      case "supplier-performance":
        return {
          title: "Supplier performance",
          header: ["Supplier", "POs", "Spend (KES)", "Accepted items", "Total items", "Avg days award-to-GRN"],
          rows: data!.supplierPerformance
            .filter((s) => !q || s.supplier_name.toLowerCase().includes(q))
            .map((s) => [s.supplier_name, s.po_count, s.total_cents / 100, s.accepted_items, s.total_items, s.avg_days_award_to_grn]),
        };
      case "spend-by-category":
        return {
          title: "Spend by category",
          header: ["Category", "Requests", "Estimated spend (KES)"],
          rows: data!.spendByCategory
            .filter((c) => !q || c.category_name.toLowerCase().includes(q))
            .map((c) => [c.category_name, c.pr_count, c.total_estimated_cents / 100]),
        };
      case "aging":
        return {
          title: "Open requests by age",
          header: ["PR No.", "Title", "Status", "Priority", "Days open"],
          rows: data!.aging
            .filter(
              (c) =>
                (!q || c.case_number.toLowerCase().includes(q) || c.title.toLowerCase().includes(q)) &&
                (!statusFilter || c.status === statusFilter) &&
                (!priorityFilter || c.priority === priorityFilter),
            )
            .map((c) => [c.case_number, c.title, STAGE_LABEL[c.status] ?? c.status, c.priority, c.days_open]),
        };
      case "rfqs": {
        const rows = await getRfqReport(session.tenant.id, reportPeriod);
        return {
          title: "RFQs & tenders",
          header: ["PR No.", "Title", "Department", "Status", "Closing date", "Invited", "Quotations"],
          rows: rows
            .filter(
              (r) =>
                (!q || r.case_number.toLowerCase().includes(q) || r.title.toLowerCase().includes(q)) &&
                (!statusFilter || r.status === statusFilter) &&
                (!deptFilter || (r.department_name ?? "").toLowerCase() === deptFilter),
            )
            .map((r) => [r.case_number, r.title, r.department_name ?? "—", r.status, r.closing_date ?? "—", r.invited_count, r.quotation_count]),
        };
      }
      case "purchase-orders": {
        const rows = await getPurchaseOrderReport(session.tenant.id, reportPeriod);
        return {
          title: "Purchase orders",
          header: [
            "PO number",
            "PR No.",
            "Department",
            "Supplier",
            "Status",
            "Total (KES)",
            "Billed (KES)",
            "Still to come (KES)",
            "Issued",
            "Expected delivery",
            "First received",
            "Delivery variance (days)",
            "Days overdue",
          ],
          rows: rows
            .filter(
              (r) =>
                (!q || r.po_number.toLowerCase().includes(q) || r.case_number.toLowerCase().includes(q)) &&
                (!statusFilter || r.status === statusFilter) &&
                (!deptFilter || (r.department_name ?? "").toLowerCase() === deptFilter),
            )
            .map((r) => [
              r.po_number,
              r.case_number,
              r.department_name ?? "—",
              r.supplier_name,
              PO_STATUS_LABEL[r.status] ?? r.status,
              r.total_cents / 100,
              r.invoiced_net_cents / 100,
              Math.max(0, r.total_cents - r.invoiced_net_cents) / 100,
              r.issued_at,
              r.expected_delivery_date ?? "",
              r.first_received_at ?? "",
              r.delivery_variance_days ?? "",
              deliveryState(r.expected_delivery_date, r.first_received_at) === "overdue"
                ? (overdueDays(r.expected_delivery_date, r.first_received_at) ?? "")
                : "",
            ]),
        };
      }
      case "goods-received": {
        const rows = await getGoodsReceivedReport(session.tenant.id, reportPeriod);
        return {
          title: "Goods received",
          header: ["GRN number", "PO number", "PR No.", "Department", "Status", "Value (KES)", "Received", "Invoice", "Invoice status"],
          rows: rows
            .filter(
              (r) =>
                (!q || r.grn_number.toLowerCase().includes(q) || r.case_number.toLowerCase().includes(q)) &&
                (!statusFilter || r.status === statusFilter) &&
                (!deptFilter || (r.department_name ?? "").toLowerCase() === deptFilter),
            )
            .map((r) => [
              r.grn_number,
              r.po_number,
              r.case_number,
              r.department_name ?? "—",
              r.status,
              r.received_value_cents / 100,
              r.received_at,
              r.invoice_number ?? "—",
              r.invoice_status ?? "not yet invoiced",
            ]),
        };
      }
      case "invoices": {
        const rows = await getInvoiceReport(session.tenant.id, reportPeriod);
        return {
          title: "Invoices & payments",
          header: ["Invoice number", "PO number", "PR No.", "Department", "Supplier", "Status", "Total (KES)", "Due", "Submitted"],
          rows: rows
            .filter(
              (r) =>
                (!q || r.invoice_number.toLowerCase().includes(q) || r.case_number.toLowerCase().includes(q)) &&
                (!statusFilter || r.status === statusFilter) &&
                (!deptFilter || (r.department_name ?? "").toLowerCase() === deptFilter),
            )
            .map((r) => [r.invoice_number, r.po_number ?? "—", r.case_number, r.department_name ?? "—", r.supplier_name, r.status, r.total_cents / 100, r.due_date ?? "—", r.submitted_at]),
        };
      }
    }
    throw new Error("Unreachable — isTableKey already validated table");
  })();

  return tableResponse(format, {
    name: `${table}-${new Date().toISOString().slice(0, 10)}`,
    title: built.title,
    tenantName: session.tenant.name,
    header: built.header,
    rows: built.rows,
  });
}
