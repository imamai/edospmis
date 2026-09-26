"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { NAV_GROUPS, NAV_BOTTOM_ITEMS, type NavItem } from "@/lib/nav-items";
import { cn } from "@/lib/utils";
import { signOut } from "@/app/app/actions";

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-brand-soft text-brand" : "text-ink-soft hover:bg-surface-sunk hover:text-ink",
      )}
    >
      <Icon className="h-4 w-4" />
      {item.label}
    </Link>
  );
}

export function SidebarNav({
  tenantName,
  permissions,
  isPlatformAdmin,
}: {
  tenantName: string;
  permissions: string[];
  isPlatformAdmin: boolean;
}) {
  const pathname = usePathname();
  const granted = new Set(permissions);
  const groups = NAV_GROUPS.filter((g) => !g.platformOnly || isPlatformAdmin)
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.requires || granted.has(i.requires)) }))
    .filter((g) => g.items.length > 0);

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface md:flex">
      <div className="border-b border-line px-5 py-4">
        <p className="text-lg font-semibold text-brand">EDOSPMIS</p>
        <p className="mt-0.5 truncate text-xs text-ink-faint">{tenantName}</p>
      </div>
      <nav className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
        {groups.map((group) => (
          <div key={group.label ?? "top"} className="flex flex-col gap-0.5">
            {group.label && (
              <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                {group.label}
              </p>
            )}
            {group.items.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </div>
        ))}
        <div className="flex flex-col gap-0.5 border-t border-line pt-3">
          {NAV_BOTTOM_ITEMS.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>
      </nav>
      <form action={signOut} className="border-t border-line p-3">
        <button
          type="submit"
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink-soft hover:bg-surface-sunk hover:text-critical"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </form>
    </aside>
  );
}
