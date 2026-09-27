"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

const SIZES = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-xl",
  xl: "max-w-4xl",
};

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = "md",
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  size?: keyof typeof SIZES;
  dismissible?: boolean;
}) {
  // "Have we hydrated yet" — a portal needs document.body, which does not
  // exist during the server render. useSyncExternalStore answers that without
  // a render-then-setState round trip: server snapshot false, client true.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const panel = panelRef.current;
    // Focus the panel rather than its first control, so a screen reader
    // announces the dialog's title before whatever field happens to be first.
    panel?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && dismissible) {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus();
    };
  }, [open, dismissible, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-ink/40 transition-opacity"
        onClick={() => dismissible && onClose()}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
        className={cn(
          "relative w-full border border-line bg-surface shadow-raised outline-none transition-all",
          // On a phone it rises from the bottom edge, which is where a thumb
          // is; from sm: up it is a centred dialog as before.
          "max-h-[90dvh] overflow-y-auto rounded-t-2xl sm:rounded-xl",
          SIZES[size],
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            <h2 className="truncate text-[0.9375rem] font-semibold text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-ink-faint">{description}</p>}
          </div>
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 rounded-lg p-1.5 text-ink-faint hover:bg-surface-sunk hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="px-4 py-4 sm:px-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function ModalFormActions({
  onCancel,
  submitLabel,
  busy,
  danger,
  cancelLabel = "Cancel",
}: {
  onCancel: () => void;
  submitLabel: string;
  busy?: boolean;
  danger?: boolean;
  cancelLabel?: string;
}) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button
        type="button"
        onClick={onCancel}
        className="rounded-lg px-3 py-2 text-sm font-semibold text-ink-faint hover:text-ink"
      >
        {cancelLabel}
      </button>
      <Button type="submit" busy={busy} variant={danger ? "danger" : "primary"}>
        {submitLabel}
      </Button>
    </div>
  );
}
