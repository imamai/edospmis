import Link from "next/link";
import { ClipboardList, Wallet, Gavel, CheckCircle2, Search } from "lucide-react";
import { requireSession, can } from "@/lib/data/session";
import { getRequisitionOverview, OPEN_STATUSES, type RequisitionListItem } from "@/lib/data/requisitions";
import { getCaseDetail, getStageDurations } from "@/lib/data/cases";
import { getProcurementDetail } from "@/lib/data/procurement";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { WorkflowStepper } from "@/components/app/workflow-stepper";
import { STAGE_LABEL, STAGE_TONE, STAGE_HINT, TERMINAL_LABEL } from "@/lib/stage-labels";
import { formatMoney, formatDate, cn } from "@/lib/utils";

/**
 * The 9 visual segments the chevron strip and its own filter operate on —
 * distinct from the 14-key `STAGE_LABEL`/`STAGE_TONE` vocabulary, because
 * `po_approval` (a PO-approval gate the reference spec's simpler prototype
 * never had — see the write-up shared with the user before this page was
 * built) isn't its own segment here, just folded into "Procurement". This
 * mirrors `PANEL_STAGE_KEYS.procurement` in stage-labels.ts, but Awarded and
 * Receiving stay two separate segments here (unlike that map's grouping,
 * which is for a different purpose: which case-detail panel to highlight).
 */
const CHEVRON_STAGES: { key: string; label: string; matches: string[] }[] = [
  { key: "draft", label: "Draft", matches: ["draft", "submitted"] },
  { key: "approval", label: "Approval", matches: ["approval"] },
  { key: "approved", label: "Approved", matches: ["approved"] },
  { key: "procurement", label: "Procurement", matches: ["procurement", "po_approval"] },
  { key: "awarded", label: "Awarded", matches: ["awarded"] },
  { key: "receiving", label: "Receiving", matches: ["receiving"] },
  { key: "finance", label: "Finance", matches: ["finance"] },
  { key: "delivery", label: "Delivery", matches: ["delivery"] },
  { key: "closed", label: "Completed", matches: ["closed"] },
];

const PROCUREMENT_ACTIVE_STATUSES = ["procurement", "po_approval", "awarded", "receiving", "finance", "delivery", "closed"];

function buildHref(sp: { stage?: string; q?: string; selected?: string }, overrides: Partial<{ stage: string | null; selected: string | null }>) {
  const stage = "stage" in overrides ? overrides.stage : (sp.stage ?? null);
  const selected = "selected" in overrides ? overrides.selected : (sp.selected ?? null);
  const params = new URLSearchParams();
  if (stage) params.set("stage", stage);
  if (sp.q) params.set("q", sp.q);
  if (selected) params.set("selected", selected);
  const qs = params.toString();
  return `/app/requisitions${qs ? `?${qs}` : ""}`;
}

export default async function RequisitionsPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; q?: string; selected?: string }>;
}) {
  const session = await requireSession();
  if (!can(session, "procurement.pr.view")) {
    return (
      <div className="empty-frame mx-auto max-w-md px-6 py-10 text-center text-sm text-ink-faint">
        You don&rsquo;t have permission to view the requisition pipeline in this workspace.
      </div>
    );
  }

  const sp = await searchParams;
  const { rows, counts } = await getRequisitionOverview(session.tenant.id);

  const activeChevron = CHEVRON_STAGES.find((s) => s.key === sp.stage) ?? null;
  const q = (sp.q ?? "").trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (activeChevron && !activeChevron.matches.includes(r.status)) return false;
    if (!q) return true;
    return `${r.case_number} ${r.title} ${r.department_name ?? ""}`.toLowerCase().includes(q);
  });

  const openRows = rows.filter((r) => OPEN_STATUSES.includes(r.status));
  const openValueCents = openRows.reduce((sum, r) => sum + r.amount_cents, 0);
  const sourcingCount = (counts.procurement ?? 0) + (counts.po_approval ?? 0) + (counts.awarded ?? 0);
  const completedCount = counts.closed ?? 0;

  const selectedId = sp.selected && filtered.some((r) => r.case_id === sp.selected) ? sp.selected : (filtered[0]?.case_id ?? null);
  const selectedRow: RequisitionListItem | undefined = filtered.find((r) => r.case_id === selectedId);
  const selectedDetail = selectedId ? await getCaseDetail(session.tenant.id, selectedId) : null;
  const stageDurations = selectedId ? await getStageDurations(session.tenant.id, selectedId) : [];
  const procurementDetail =
    selectedDetail && PROCUREMENT_ACTIVE_STATUSES.includes(selectedDetail.case.status)
      ? await getProcurementDetail(session.tenant.id, selectedId!)
      : null;
  const supplierName = procurementDetail?.po
    ? (procurementDetail.quotations.find((qt) => qt.supplier_id === procurementDetail.po!.supplier_id)?.supplier_name ?? null)
    : null;

  const stageHints = STAGE_HINT;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-ink-faint">Procurement / Requisitions</p>
          <h1 className="text-xl font-semibold text-ink">Requisition pipeline</h1>
        </div>
        {can(session, "procurement.pr.create") && (
          <ButtonLink href="/app/prs/new" size="sm">
            New requisition
          </ButtonLink>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Open requisitions"
          value={String(openRows.length)}
          icon={ClipboardList}
          tone="brand"
          sub={`${counts.approval ?? 0} awaiting approval`}
        />
        <StatCard label="Value in pipeline" value={formatMoney(openValueCents)} icon={Wallet} tone="brand" sub={`Across ${openRows.length} open PRs`} />
        <StatCard label="In sourcing & award" value={String(sourcingCount)} icon={Gavel} tone="info" sub="RFQs and LPOs in progress" />
        <StatCard label="Completed" value={String(completedCount)} icon={CheckCircle2} tone="good" sub="Closed and archived" />
      </div>

      <Card>
        <CardBody className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">
              Pipeline by stage <span className="font-normal text-ink-faint">· click a stage to filter</span>
            </p>
            <Link
              href={buildHref(sp, { stage: null })}
              className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:border-brand hover:text-brand"
            >
              {activeChevron ? `Showing ${activeChevron.label} · Clear` : "All stages"}
            </Link>
          </div>
          <div className="flex gap-0.5 overflow-x-auto scroll-slim">
            {CHEVRON_STAGES.map((stage, i) => {
              const active = activeChevron?.key === stage.key;
              const count = stage.matches.reduce((sum, key) => sum + (counts[key] ?? 0), 0);
              const isFirst = i === 0;
              const isLast = i === CHEVRON_STAGES.length - 1;
              const clipPath = isFirst
                ? "polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)"
                : isLast
                  ? "polygon(0 0, 100% 0, 100% 100%, 0 100%, 14px 50%)"
                  : "polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%, 14px 50%)";
              return (
                <Link
                  key={stage.key}
                  href={buildHref(sp, { stage: active ? null : stage.key, selected: null })}
                  aria-pressed={active}
                  style={{ clipPath }}
                  className={cn(
                    "flex h-[3.6rem] min-w-[6.5rem] flex-1 shrink-0 flex-col items-center justify-center gap-0.5 px-4 transition-colors",
                    !isFirst && "-ml-2",
                    active ? "bg-brand text-white" : "bg-surface-sunk text-ink-soft hover:bg-brand-soft hover:text-brand",
                  )}
                >
                  <span className="tnum text-lg leading-none font-bold">{count}</span>
                  <span className="text-[11px] font-semibold">{stage.label}</span>
                </Link>
              );
            })}
          </div>
        </CardBody>
      </Card>

      {selectedDetail && selectedRow && (
        <Card>
          <CardBody className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-lg border border-line bg-surface-sunk px-2.5 py-1 font-mono text-xs text-ink">{selectedRow.case_number}</span>
              <span className="text-base font-semibold text-ink">{selectedRow.title}</span>
              {selectedRow.department_name && <span className="text-sm text-ink-faint">{selectedRow.department_name}</span>}
              <span className="flex-1" />
              <span className="text-sm text-ink-faint">
                Now: <b className="text-ink">{STAGE_LABEL[selectedDetail.case.status] ?? selectedDetail.case.status}</b>
                {stageHints[selectedDetail.case.status] && ` · ${stageHints[selectedDetail.case.status]}`}
              </span>
            </div>
            <div className="rounded-xl border border-line-strong bg-surface-sunk p-2">
              <WorkflowStepper
                stages={selectedDetail.stages.length > 0 ? selectedDetail.stages : [{ key: "draft", label: "Draft" }]}
                currentKey={selectedDetail.case.current_stage_key}
                terminal={
                  selectedDetail.case.status in TERMINAL_LABEL
                    ? { key: selectedDetail.case.status, label: TERMINAL_LABEL[selectedDetail.case.status] }
                    : null
                }
                stageHints={stageHints}
                hrefForStage={(key) => buildHref(sp, { stage: CHEVRON_STAGES.find((c) => c.matches.includes(key))?.key ?? key, selected: null })}
              />
            </div>
          </CardBody>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <div className="border-b border-line bg-surface-sunk px-4 py-2.5">
            <form action="/app/requisitions" method="get" className="flex w-full max-w-sm items-center gap-2">
              {sp.stage && <input type="hidden" name="stage" value={sp.stage} />}
              <input
                type="search"
                name="q"
                defaultValue={sp.q ?? ""}
                placeholder="Search by PR number, item or department"
                className="h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-brand"
              />
              <button
                type="submit"
                aria-label="Search"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-ink-soft hover:border-brand hover:text-brand"
              >
                <Search className="h-4 w-4" />
              </button>
            </form>
          </div>
          <CardBody className="overflow-x-auto p-0">
            {filtered.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-ink-faint">No requisitions match this filter.</p>
            ) : (
              <table className="w-full table-fixed text-left text-sm">
                <colgroup>
                  <col className="w-40" />
                  <col />
                  <col className="w-32" />
                  <col className="w-28" />
                </colgroup>
                <thead>
                  <tr className="border-b border-line bg-surface-sunk text-[11px] uppercase tracking-wide text-ink-faint">
                    <th className="px-4 py-2.5 font-medium">PR No.</th>
                    <th className="px-4 py-2.5 font-medium">Item / Department</th>
                    <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                    <th className="px-4 py-2.5 font-medium">Stage</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const selected = r.case_id === selectedId;
                    return (
                      <tr
                        key={r.case_id}
                        className={cn("border-b border-line last:border-0", selected && "bg-good-soft shadow-[inset_3px_0_0_var(--color-good)]")}
                      >
                        <td className="p-0">
                          <Link
                            href={buildHref(sp, { selected: r.case_id })}
                            className="block truncate px-4 py-3 font-mono text-xs whitespace-nowrap text-ink"
                          >
                            {r.case_number}
                          </Link>
                        </td>
                        <td className="p-0">
                          <Link href={buildHref(sp, { selected: r.case_id })} className="block px-4 py-3">
                            <p className="truncate text-sm font-medium text-ink">{r.title}</p>
                            <p className="text-xs text-ink-faint">
                              {r.department_name ?? "—"} · {r.requester_name ?? "—"}
                            </p>
                          </Link>
                        </td>
                        <td className="p-0">
                          <Link href={buildHref(sp, { selected: r.case_id })} className="block px-4 py-3 text-right">
                            <span className="tnum text-sm font-semibold text-ink">{formatMoney(r.amount_cents, { currency: r.currency })}</span>
                          </Link>
                        </td>
                        <td className="p-0">
                          <Link href={buildHref(sp, { selected: r.case_id })} className="block px-4 py-3">
                            <Badge tone={STAGE_TONE[r.status] ?? "neutral"}>{STAGE_LABEL[r.status] ?? r.status}</Badge>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>

        {selectedDetail && selectedRow ? (
          <Card className="flex flex-col gap-4 overflow-hidden">
            <CardBody className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-ink-faint">Requisition value</p>
                  <p className="tnum text-2xl font-bold text-ink">{formatMoney(selectedRow.amount_cents, { currency: selectedRow.currency })}</p>
                </div>
                <Badge tone={STAGE_TONE[selectedDetail.case.status] ?? "neutral"}>{STAGE_LABEL[selectedDetail.case.status] ?? selectedDetail.case.status}</Badge>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-line bg-surface-sunk p-3">
                {[
                  { k: "Department", v: selectedRow.department_name ?? "—" },
                  { k: "Requested by", v: selectedRow.requester_name ?? "—" },
                  { k: "Created", v: formatDate(selectedRow.opened_at) },
                  { k: "Supplier", v: supplierName ?? "—" },
                ].map((f) => (
                  <div key={f.k}>
                    <p className="text-[11px] font-semibold tracking-wide text-ink-faint uppercase">{f.k}</p>
                    <p className="text-sm font-medium text-ink">{f.v}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold text-ink">Activity</p>
                {[...stageDurations].reverse().map((d, i) => {
                  const isNow = d.left_at === null;
                  return (
                    <div key={`${d.stage_key}-${i}`} className="grid grid-cols-[0.75rem_1fr_auto] items-start gap-2.5">
                      <span className={cn("mt-1.5 h-2.5 w-2.5 rounded-full", isNow ? "bg-brand shadow-[0_0_0_4px_var(--color-brand-soft)]" : "bg-good")} />
                      <div>
                        <p className="text-sm font-medium text-ink">
                          {isNow ? "Now in " : "Completed: "}
                          {STAGE_LABEL[d.stage_key] ?? d.stage_key}
                        </p>
                        <p className="text-xs text-ink-faint">{stageHints[d.stage_key] ?? ""}</p>
                      </div>
                      <span className="tnum text-xs text-ink-faint">{formatDate(d.entered_at)}</span>
                    </div>
                  );
                })}
              </div>

              <ButtonLink href={`/app/cases/${selectedRow.case_id}`} variant="secondary" className="mt-auto">
                Open in case workspace
              </ButtonLink>
            </CardBody>
          </Card>
        ) : (
          <Card>
            <CardBody className="flex h-full items-center justify-center py-10 text-sm text-ink-faint">Select a requisition to see its detail.</CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
