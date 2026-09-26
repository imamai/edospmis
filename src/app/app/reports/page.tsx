import Link from "next/link";
import { ChevronRight, Clock3, FileSearch, PackageCheck, Receipt, ShieldCheck, ShoppingCart, Tags, Truck } from "lucide-react";
import { requireSession, can } from "@/lib/data/session";
import { getAnalytics } from "@/lib/data/analytics";
import { resolvePeriod } from "@/lib/report-period";
import { ExportLinks } from "@/components/ui/export-links";
import { PeriodFilterSuspended } from "@/components/ui/period-filter-suspended";
import { formatMoney } from "@/lib/utils";

const REPORTS = [
  {
    key: "aging",
    title: "Open requests by age",
    description: "Every case still open, oldest first — with stage and priority.",
    category: "requests",
    icon: Clock3,
  },
  {
    key: "stage-durations",
    title: "Time in each stage",
    description: "Average time spent per stage, and how many cases are sitting there right now.",
    category: "requests",
    icon: Clock3,
  },
  {
    key: "sla-compliance",
    title: "Approval SLA compliance",
    description: "Completed approvals against their SLA target, per stage.",
    category: "compliance",
    icon: ShieldCheck,
  },
  {
    key: "rfqs",
    title: "RFQs & tenders",
    description: "Every request for quotation raised, who was invited, and how many quoted back.",
    category: "procurement",
    icon: FileSearch,
  },
  {
    key: "purchase-orders",
    title: "Purchase orders",
    description: "Every LPO issued, its supplier, value and status — filterable by department and period.",
    category: "procurement",
    icon: ShoppingCart,
  },
  {
    key: "goods-received",
    title: "Goods received",
    description: "Every GRN raised against a purchase order, inspected or not.",
    category: "procurement",
    icon: PackageCheck,
  },
  {
    key: "supplier-performance",
    title: "Supplier performance",
    description: "Spend, acceptance rate and lead time per supplier.",
    category: "procurement",
    icon: Truck,
  },
  {
    key: "invoices",
    title: "Invoices & payments",
    description: "Every invoice submitted, matched, approved or paid, with what's still outstanding.",
    category: "finance",
    icon: Receipt,
  },
  {
    key: "spend-by-category",
    title: "Spend by category",
    description: "Estimated cost of every request, grouped by category.",
    category: "finance",
    icon: Tags,
  },
] as const;

const TABS = [
  { key: "all", label: "All reports" },
  { key: "requests", label: "Requests" },
  { key: "compliance", label: "Compliance" },
  { key: "procurement", label: "Procurement" },
  { key: "finance", label: "Finance" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; period?: string; from?: string; to?: string }>;
}) {
  const session = await requireSession();
  if (!can(session, "reports.view")) {
    return (
      <div className="empty-frame mx-auto max-w-md px-6 py-10 text-center text-sm text-ink-faint">
        You don&rsquo;t have permission to view reports in this workspace.
      </div>
    );
  }

  const sp = await searchParams;
  const tab: TabKey = TABS.some((t) => t.key === sp.tab) ? (sp.tab as TabKey) : "all";
  const canExport = can(session, "reports.export");
  const visible = REPORTS.filter((r) => tab === "all" || r.category === tab);

  // The "at a glance" strip below, in the same spirit as edos-poa's Reports
  // tab — a snapshot for the selected period, reusing the exact same
  // `getAnalytics` call every individual report/dashboard already makes
  // rather than a new query just for this summary.
  const period = resolvePeriod(sp);
  const data = await getAnalytics(session.tenant.id, { from: period.from, to: period.to });
  const totalSpend = data.spendByCategory.reduce((sum, c) => sum + c.total_estimated_cents, 0);
  const totalPoValue = data.supplierPerformance.reduce((sum, s) => sum + s.total_cents, 0);
  const slaTotal = data.slaCompliance.reduce((sum, s) => sum + s.total, 0);
  const slaOnTime = data.slaCompliance.reduce((sum, s) => sum + s.on_time, 0);
  const slaRate = slaTotal > 0 ? Math.round((slaOnTime / slaTotal) * 100) : null;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Reports</h1>
          <p className="mt-1 text-sm text-ink-faint">
            Open a report to read it, narrow it to what you&rsquo;re asking about, and download it as CSV, Excel or PDF.
            Looking for trend charts instead? Try{" "}
            <Link href="/app/analytics" className="text-brand hover:underline">
              Analytics
            </Link>
            .
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <PeriodFilterSuspended activeKey={period.key} />
          {canExport && (
            <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
              <span className="text-xs font-medium text-ink-faint">Export invoices</span>
              <ExportLinks base="/api/export/invoices" />
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "all" ? "/app/reports" : `/app/reports?tab=${t.key}`}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.key ? "border-brand text-brand" : "border-transparent text-ink-faint hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((r) => {
          const Icon = r.icon;
          return (
            <Link
              key={r.key}
              href={`/app/reports/${r.key}`}
              className="group flex items-start gap-3 rounded-xl border border-line bg-surface p-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-raised"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand transition-transform duration-200 group-hover:scale-110">
                <Icon className="h-4.5 w-4.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{r.title}</p>
                <p className="mt-0.5 text-xs text-ink-faint">{r.description}</p>
              </div>
              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-ink-faint transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-brand" />
            </Link>
          );
        })}
      </div>

      <div className="rounded-xl border border-line bg-surface p-5">
        <p className="text-sm font-semibold text-ink">{period.label} at a glance</p>
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
          <Glance label="Open requests" value={String(data.aging.length)} />
          <Glance label="Estimated spend" value={formatMoney(totalSpend)} />
          <Glance label="At risk of SLA breach" value={String(data.slaRisk.length)} />
          <Glance label="Approval SLA on time" value={slaRate === null ? "—" : `${slaRate}%`} />
          <Glance label="Suppliers engaged" value={String(data.supplierPerformance.length)} />
          <Glance label="Total PO value" value={formatMoney(totalPoValue)} />
        </div>
        <p className="mt-4 text-xs text-ink-faint">
          A report shows only what your permissions allow. For a single case&rsquo;s own record, open it directly from its case workspace.
        </p>
      </div>
    </div>
  );
}

function Glance({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-ink-faint">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tnum text-ink">{value}</p>
    </div>
  );
}
