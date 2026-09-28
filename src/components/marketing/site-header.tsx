"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Wordmark } from "@/components/brand/logo";
import { useScrolledPast } from "@/lib/use-scrolled-past";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#capabilities", label: "Capabilities" },
  { href: "/pricing", label: "Pricing" },
  { href: "/contact", label: "Contact" },
];

/** Pages that open on a dark full-bleed hero the header should float over. */
const DARK_HERO_ROUTES = ["/"];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const scrolled = useScrolledPast(8);

  // Transparent over the hero photograph, solid once the page scrolls past it
  // or when the page below is light.
  const overlay = DARK_HERO_ROUTES.includes(pathname) && !scrolled && !open;

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-colors",
        overlay
          ? "bg-transparent"
          : scrolled || open
            ? "border-b border-line bg-canvas/90 backdrop-blur-md"
            : "border-b border-line bg-canvas",
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Wordmark tone={overlay ? "light" : "ink"} />

        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                overlay
                  ? "text-white/80 hover:bg-white/10 hover:text-white"
                  : pathname === l.href
                    ? "bg-brand-soft text-brand"
                    : "text-ink-soft hover:bg-surface-sunk hover:text-ink",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Link
            href="/login"
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              overlay ? "text-white/80 hover:text-white" : "text-ink-soft hover:text-ink",
            )}
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className={cn(
              "inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium shadow-card transition-colors",
              overlay
                ? "bg-accent text-white hover:bg-white hover:text-brand-darker"
                : "bg-brand text-white hover:bg-brand-dark",
            )}
          >
            Start free trial
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-lg border transition-colors md:hidden",
            overlay ? "border-white/30 text-white" : "border-line-strong text-ink",
          )}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-line bg-canvas md:hidden">
          {/* Any tap in here navigates, so closing on click covers every case
              without an effect watching the pathname. */}
          <nav
            onClick={() => setOpen(false)}
            className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3"
          >
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-lg px-3 py-3 text-sm font-medium text-ink-soft hover:bg-surface-sunk"
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-line pt-3">
              <Link
                href="/login"
                className="rounded-lg border border-line-strong px-3 py-3 text-center text-sm font-medium text-ink"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="rounded-lg bg-brand px-3 py-3 text-center text-sm font-medium text-white"
              >
                Start free trial
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
