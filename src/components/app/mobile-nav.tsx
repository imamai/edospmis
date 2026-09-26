"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, LogOut } from "lucide-react";
import { NAV_GROUPS, NAV_BOTTOM_ITEMS, type NavItem } from "@/lib/nav-items";
import { cn } from "@/lib/utils";
import { signOut } from "@/app/app/actions";

function NavLink({ item, pathname, onClick }: { item: NavItem; pathname: string; onClick: () => void }) {
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
        active ? "bg-brand-soft text-brand" : "text-ink-soft hover:bg-surface-sunk",
      )}
    >
      <Icon className="h-4 w-4" />
      {item.label}
    </Link>
  );
}

export function MobileNav({
  tenantName,
  permissions,
  isPlatformAdmin,
}: {
  tenantName: string;
  permissions: string[];
  isPlatformAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const granted = new Set(permissions);
  const groups = NAV_GROUPS.filter((g) => !g.platformOnly || isPlatformAdmin)
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.requires || granted.has(i.requires)) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="border-b border-line bg-surface md:hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <p className="text-base font-semibold text-brand">EDOSPMIS</p>
          <p className="text-xs text-ink-faint">{tenantName}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          className="rounded-lg p-2 text-ink-soft hover:bg-surface-sunk"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <nav className="flex flex-col gap-3 border-t border-line p-3">
          {groups.map((group) => (
            <div key={group.label ?? "top"} className="flex flex-col gap-0.5">
              {group.label && (
                <p className="px-3 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  {group.label}
                </p>
              )}
              {group.items.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} onClick={() => setOpen(false)} />
              ))}
            </div>
          ))}
          <div className="flex flex-col gap-0.5 border-t border-line pt-3">
            {NAV_BOTTOM_ITEMS.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} onClick={() => setOpen(false)} />
            ))}
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink-soft hover:bg-surface-sunk hover:text-critical"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </form>
        </nav>
      )}
    </div>
  );
}
