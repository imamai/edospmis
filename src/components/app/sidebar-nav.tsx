"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav-items";
import { cn } from "@/lib/utils";
import { signOut } from "@/app/app/actions";

export function SidebarNav({
  tenantName,
  permissions,
}: {
  tenantName: string;
  permissions: string[];
}) {
  const pathname = usePathname();
  const granted = new Set(permissions);
  const items = NAV_ITEMS.filter((i) => !i.requires || granted.has(i.requires));

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface md:flex">
      <div className="border-b border-line px-5 py-4">
        <p className="text-lg font-semibold text-brand">EDOSPMIS</p>
        <p className="mt-0.5 truncate text-xs text-ink-faint">{tenantName}</p>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 p-3">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
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
        })}
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
