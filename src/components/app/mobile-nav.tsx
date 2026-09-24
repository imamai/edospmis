"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, LogOut } from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav-items";
import { cn } from "@/lib/utils";
import { signOut } from "@/app/app/actions";

export function MobileNav({ tenantName, permissions }: { tenantName: string; permissions: string[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const granted = new Set(permissions);
  const items = NAV_ITEMS.filter((i) => !i.requires || granted.has(i.requires));

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
        <nav className="flex flex-col gap-0.5 border-t border-line p-3">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
                  active ? "bg-brand-soft text-brand" : "text-ink-soft hover:bg-surface-sunk",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
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
