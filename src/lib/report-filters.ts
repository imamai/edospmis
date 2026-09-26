import type { PeriodKey } from "./report-period";

/**
 * Which controls each report shows, in one place.
 *
 * This used to live as a chain of `key === "aging" || isProcurementReportKey(key)`
 * conditionals wrapped around each control in the page's JSX, which meant adding
 * a report or a filter involved editing several conditions that had to agree
 * with each other. Now a report declares what it can be narrowed by, and the
 * form renders from that.
 */
export interface ReportFilterFlags {
  /** A period select plus a custom From/To pair. */
  dates: boolean;
  search?: boolean;
  status?: boolean;
  priority?: boolean;
  stage?: boolean;
  dept?: boolean;
  /** The placeholder for the search box — what you can actually type into it. */
  searchHint?: string;
}

export const REPORT_FILTERS: Record<string, ReportFilterFlags> = {
  aging: { dates: true, search: true, status: true, priority: true, searchHint: "PR number or title" },
  "stage-durations": { dates: true, stage: true },
  "sla-compliance": { dates: true, stage: true },
  "supplier-performance": { dates: true, search: true, searchHint: "Supplier name" },
  "spend-by-category": { dates: true, search: true, searchHint: "Category name" },
  rfqs: { dates: true, search: true, status: true, dept: true, searchHint: "PR number or RFQ title" },
  "purchase-orders": { dates: true, search: true, status: true, dept: true, searchHint: "PO number, PR number or supplier" },
  "goods-received": { dates: true, search: true, status: true, dept: true, searchHint: "GRN number, PO number or PR number" },
  invoices: { dates: true, search: true, status: true, dept: true, searchHint: "Invoice number, PR number or supplier" },
};

export const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
];
