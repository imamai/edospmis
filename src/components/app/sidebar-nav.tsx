"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X, ChevronRight } from "lucide-react";
import { NAV_GROUPS, NAV_BOTTOM_ITEMS, type NavItem } from "@/lib/nav-items";
import { cn } from "@/lib/utils";
import { signOut } from "@/app/app/actions";

/**
 * The navigation, desktop rail and phone drawer both.
 *
 * These used to be two components with two copies of NavLink, two copies of
 * the permission filtering, two renderings of the bottom items and two sign-out
 * forms — and they had already drifted: the phone version styled the active row
 * in brand-on-light while the rail used white-on-brand, and only the rail was
 * ever updated when the active-row treatment changed. One component, one set of
 * rules, rendered into two shells.
 */

/**
 * A nav row as a chevron: the active one is cut into an arrow pointing at the
 * content beside it, the same `clip-path` language the workflow stepper and
 * the requisitions stage strip already use. It reads as "you are here, and
 * this is what it opens" rather than as a highlighted rectangle.
 *
 * Only the active row is clipped — clipping every row would turn the sidebar
 * into a column of arrows with nothing to distinguish the current one.
 */
function NavLink({
  item,
  activeHref,
  count,
  onNavigate,
}: {
  item: NavItem;
  activeHref: string | null;
  count?: number;
  onNavigate?: () => void;
}) {
  const active = item.href.split("?")[0] === activeHref;
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      style={active ? { clipPath: "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%)" } : undefined}
      className={cn(
        "group flex items-center gap-2.5 rounded-lg py-2 pl-3 text-sm font-medium transition-colors",
        active
          ? "rounded-r-none bg-brand-mid pr-5 text-white"
          : "pr-3 text-brand-soft/80 hover:bg-white/[0.07] hover:text-white",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate text-left">{item.label}</span>
      {!!count && (
        <span
          className={cn(
            "tnum shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
            active ? "bg-white/15 text-white" : "bg-brand-darker text-brand-soft",
          )}
        >
          {count}
        </span>
      )}
      {!active && !count && (
        <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-60" />
      )}
    </Link>
  );
}

function NavBody({
  tenantName,
  groups,
  activeHref,
  counts,
  onNavigate,
}: {
  tenantName: string;
  groups: typeof NAV_GROUPS;
  activeHref: string | null;
  counts: Record<string, number>;
  onNavigate?: () => void;
}) {
  return (
    <>
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
              <NavLink
                key={item.href}
                item={item}
                activeHref={activeHref}
                count={item.countKey ? counts[item.countKey] : undefined}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ))}
        <div className="flex flex-col gap-0.5 border-t border-white/10 pt-3">
          {NAV_BOTTOM_ITEMS.map((item) => (
            <NavLink key={item.href} item={item} activeHref={activeHref} onNavigate={onNavigate} />
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
    </>
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
  const [open, setOpen] = useState(false);

  // Navigating closes the drawer; without this it stays open over the page it
  // just opened, which on a phone reads as the tap having done nothing.
  // Adjusted during render rather than in an effect — React's own guidance for
  // state derived from a changing prop, and it avoids a frame where the drawer
  // still covers the new page.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  // The drawer is a layer over the page, so the page behind it must not scroll.
  // The previous value is restored rather than cleared, so this composes with
  // anything else that locks scrolling (a modal opened from the same screen).
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const granted = new Set(permissions);
  const groups = NAV_GROUPS.filter((g) => !g.platformOnly || isPlatformAdmin)
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.requires || granted.has(i.requires)) }))
    .filter((g) => g.items.length > 0);

  // The longest href that matches the current path wins. Testing each row
  // against its own prefix lit up a parent and its child at the same time —
  // on /app/reports/goods-received both "Goods received" and "Reports" read
  // as the page you are on. A deep link like
  // "/app/requisitions?stage=awarded" still matches on its path alone.
  const activeHref =
    [...groups.flatMap((g) => g.items), ...NAV_BOTTOM_ITEMS]
      .map((i) => i.href.split("?")[0])
      .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
      .sort((a, b) => b.length - a.length)[0] ?? null;

  return (
    <>
      {/* Phone: a compact bar holding the menu button, since there is no room
          for a rail. */}
      <div className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-white/10 bg-brand-darker px-4 text-white md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          aria-expanded={open}
          className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/10"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <p className="text-sm leading-tight font-semibold">EDOSPMIS</p>
          <p className="truncate text-[11px] leading-tight text-brand-soft/70">{tenantName}</p>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-ink/50" onClick={() => setOpen(false)} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-brand-darker text-brand-soft shadow-raised">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
              className="absolute top-4 right-3 flex h-8 w-8 items-center justify-center rounded-lg text-white hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>
            <NavBody
              tenantName={tenantName}
              groups={groups}
              activeHref={activeHref}
              counts={counts}
              onNavigate={() => setOpen(false)}
            />
          </aside>
        </div>
      )}

      <aside className="hidden w-64 shrink-0 flex-col bg-brand-darker text-brand-soft md:flex">
        <NavBody tenantName={tenantName} groups={groups} activeHref={activeHref} counts={counts} />
      </aside>
    </>
  );
}
