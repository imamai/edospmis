import { requireSession } from "@/lib/data/session";
import { SidebarNav } from "@/components/app/sidebar-nav";
import { MobileNav } from "@/components/app/mobile-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const permissions = Array.from(session.permissions);

  return (
    <div className="flex min-h-screen">
      <SidebarNav tenantName={session.tenant.name} permissions={permissions} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav tenantName={session.tenant.name} permissions={permissions} />
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
