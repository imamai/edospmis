"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { NAV_GROUPS, NAV_BOTTOM_ITEMS, type NavItem } from "@/lib/nav-items";
import { cn } from "@/lib/utils";
import { signOut } from "@/app/app/actions";

function NavLink({ item, pathname, count }: { item: NavItem; pathname: string; count?: number }) {
  // A deep-link like "/app/requisitions?stage=awarded" should still light up
  // as active while on /app/requisitions — compare on the path only.
  const itemPath = item.href.split("?")[0];
  const active = pathname === itemPath || pathname.startsWith(`${itemPath}/`);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-brand-mid text-white" : "text-brand-soft/80 hover:bg-white/[0.07] hover:text-white",
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", active ? "bg-good" : "bg-transparent")} />
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate text-left">{item.label}</span>
      {!!count && (
        <span className="shrink-0 rounded-full bg-brand-darker px-2 py-0.5 text-[11px] font-semibold tnum text-brand-soft">
          {count}
        </span>
      )}
    </Link>
  );
}

export function SidebarNav({
  tenantName,
  permissions,
  isPlatformAdmin,
  counts = {},
}: {
  tenantName: string;
  permissions: string[];
  isPlatformAdmin: boolean;
  counts?: Record<string, number>;
}) {
  const pathname = usePathname();
  const granted = new Set(permissions);
  const groups = NAV_GROUPS.filter((g) => !g.platformOnly || isPlatformAdmin)
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.requires || granted.has(i.requires)) }))
    .filter((g) => g.items.length > 0);

  return (
    <aside className="hidden w-64 shrink-0 flex-col bg-brand-darker text-brand-soft md:flex">
      <div className="border-b border-white/10 px-5 py-4">
        <p className="text-lg font-semibold text-white">EDOSPMIS</p>
        <p className="mt-0.5 truncate text-xs text-brand-soft/70">{tenantName}</p>
      </div>
      <nav className="scroll-slim flex flex-1 flex-col gap-3 overflow-y-auto p-3">
        {groups.map((group) => (
          <div key={group.label ?? "top"} className="flex flex-col gap-0.5">
            {group.label && (
              <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-brand-soft/50">
                {group.label}
              </p>
            )}
            {group.items.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} count={item.countKey ? counts[item.countKey] : undefined} />
            ))}
          </div>
        ))}
        <div className="flex flex-col gap-0.5 border-t border-white/10 pt-3">
          {NAV_BOTTOM_ITEMS.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>
      </nav>
      <form action={signOut} className="border-t border-white/10 p-3">
        <button
          type="submit"
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-brand-soft/80 hover:bg-white/[0.07] hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </form>
    </aside>
  );
}
