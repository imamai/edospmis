import { requireSession, can } from "@/lib/data/session";
import {
  getRequisitionStageCounts,
  OPEN_STATUSES,
} from "@/lib/data/requisitions";
import { getSubscription } from "@/lib/data/billing";
import { SidebarNav } from "@/components/app/sidebar-nav";
import { NotificationBell } from "@/components/app/notification-bell";
import { getInbox } from "@/lib/notify/notifications";
import { TrialBanner } from "@/components/app/trial-banner";
import { ServiceWorkerRegister } from "@/components/app/sw-register";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
      open: OPEN_STATUSES.reduce(
        (sum, key) => sum + (stageCounts[key] ?? 0),
        0,
      ),
      sourcing: (stageCounts.procurement ?? 0) + (stageCounts.po_approval ?? 0),
    };
  }

  // A tenant's accent color tints buttons/links (--color-brand) in the
  // content area only — the sidebar keeps its fixed navy shell, so this
  // never touches EDOSPMIS's own brand identity, only what a tenant sees
  // once inside their workspace.
  const accent = session.tenant.branding.accent_color;

  // One row, memoised for the request. The banner renders nothing at all
  // unless a trial is nearly over or a period has lapsed.
  const subscription = await getSubscription(session.tenant.id);
  // Read in the layout so the count is right on every page, and so arriving
  // at a case from a notification immediately stops it being unread.
  const inbox = await getInbox();

  // SidebarNav renders both shells itself — the rail from md: up, and the
  // phone bar plus drawer below it — so the layout no longer has to know
  // which one applies at which width.
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <ServiceWorkerRegister />
      <SidebarNav
        tenantName={session.tenant.name}
        permissions={permissions}
        isPlatformAdmin={session.isPlatformAdmin}
        counts={counts}
      />
      <div
        className="flex min-w-0 flex-1 flex-col"
        style={
          accent
            ? ({ "--color-brand": accent } as React.CSSProperties)
            : undefined
        }
      >
        <TrialBanner
          subscription={subscription}
          canManage={can(session, "admin.org.manage")}
        />
        {/* A slim bar rather than a full header: the sidebar already carries
            the workspace and the navigation, and a second row repeating them
            would cost vertical space on a phone for nothing. */}
        <div className="flex items-center justify-end border-b border-line px-4 py-1.5 sm:px-6">
          <NotificationBell items={inbox} userId={session.user.id} />
        </div>
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
