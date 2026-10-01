"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Check } from "lucide-react";
import { markNotificationsRead } from "@/app/app/notification-actions";
import { formatDate } from "@/lib/utils";
import type { InboxItem } from "@/lib/notify/notifications";

/**
 * What is waiting on you.
 *
 * Shows only what is still outstanding — resolved rows never appear, because
 * a bell that lists work somebody else already did is a bell people stop
 * opening. The count is of unread items, not of everything: once you have
 * seen a thing it stops shouting, but it stays in the list until it is
 * actually done.
 *
 * Opening the panel marks what is in it as read. That is deliberate: the
 * alternative is a per-item tick nobody presses, and a count that only ever
 * goes up.
 */
export function NotificationBell({ items }: { items: InboxItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);

  const unread = items.filter((i) => !i.read_at);

  // Click outside and Escape both close it. A panel that can only be closed by
  // the button that opened it is a trap on a phone.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node))
        setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread.length > 0) {
      start(async () => {
        await markNotificationsRead(unread.map((i) => i.id));
        router.refresh();
      });
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={toggle}
        aria-label={
          unread.length > 0
            ? `${unread.length} unread notification${unread.length === 1 ? "" : "s"}`
            : "Notifications"
        }
        aria-expanded={open}
        className="relative rounded-lg p-2 text-ink-soft transition-colors hover:bg-surface-sunk hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unread.length > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-critical px-1 text-[10px] font-semibold text-white">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-line bg-surface shadow-raised">
          <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
            <p className="text-sm font-semibold text-ink">Waiting on you</p>
            {items.length > 0 && (
              <span className="text-xs text-ink-faint">{items.length}</span>
            )}
          </div>

          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-ink-faint">
              Nothing waiting. Anything that needs you will appear here.
            </p>
          ) : (
            <ul className="max-h-[22rem] divide-y divide-line overflow-y-auto">
              {items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="flex gap-2.5 px-3 py-2.5 transition-colors hover:bg-surface-sunk"
                  >
                    <span
                      className={
                        item.read_at
                          ? "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-transparent"
                          : "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand"
                      }
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink">
                        {item.title}
                      </span>
                      {item.body && (
                        <span className="mt-0.5 block text-xs text-ink-faint">
                          {item.body}
                        </span>
                      )}
                      <span className="mt-0.5 block text-[11px] text-ink-faint">
                        {formatDate(item.created_at)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <p className="flex items-center gap-1.5 border-t border-line px-3 py-2 text-[11px] text-ink-faint">
            <Check className="h-3 w-3 shrink-0" aria-hidden="true" />
            These clear themselves once the work is done — by you or by anybody
            else.
          </p>
        </div>
      )}
    </div>
  );
}
