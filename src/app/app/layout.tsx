import { requireSession, can } from "@/lib/data/session";
import { getRequisitionStageCounts, OPEN_STATUSES } from "@/lib/data/requisitions";
import { SidebarNav } from "@/components/app/sidebar-nav";
import { MobileNav } from "@/components/app/mobile-nav";
import { ServiceWorkerRegister } from "@/components/app/sw-register";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const permissions = Array.from(session.permissions);

  // Nav-badge counts, keyed to match `countKey` in nav-items.ts. Skipped
  // entirely (nav renders with no badges) for a session with no procurement
  // visibility at all, rather than running a query whose result nobody can
  // see. Deliberately the cheap status-only read, not `getRequisitionOverview`
  // — this runs on every `/app/*` page load via the layout, so it must not
  // carry the PR/department/requester join only the Requisitions page needs.
  let counts: Record<string, number> = {};
  if (can(session, "procurement.pr.view")) {
    const stageCounts = await getRequisitionStageCounts(session.tenant.id);
    counts = {
      ...stageCounts,
      open: OPEN_STATUSES.reduce((sum, key) => sum + (stageCounts[key] ?? 0), 0),
      sourcing: (stageCounts.procurement ?? 0) + (stageCounts.po_approval ?? 0),
    };
  }

  return (
    <div className="flex min-h-screen">
      <ServiceWorkerRegister />
      <SidebarNav tenantName={session.tenant.name} permissions={permissions} isPlatformAdmin={session.isPlatformAdmin} counts={counts} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav tenantName={session.tenant.name} permissions={permissions} isPlatformAdmin={session.isPlatformAdmin} counts={counts} />
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
