import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Every amount in this system is an integer number of cents — never a float shilling value. */
export function formatMoney(cents: number, opts: { currency?: string } = {}): string {
  const { currency = "KES" } = opts;
  return new Intl.NumberFormat("en-KE", { style: "currency", currency, maximumFractionDigits: 0 }).format(
    cents / 100,
  );
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}

export type SlaStatus = "normal" | "warning" | "breached" | "none";

/** Live SLA read from a due timestamp — no scheduled job needed for display. */
export function slaStatus(dueAt: string | null): { status: SlaStatus; label: string } {
  if (!dueAt) return { status: "none", label: "No SLA set" };
  const diffMs = new Date(dueAt).getTime() - Date.now();
  const hours = diffMs / (1000 * 60 * 60);
  if (diffMs < 0) return { status: "breached", label: `Breached ${Math.abs(hours).toFixed(1)}h ago` };
  if (hours < 6) return { status: "warning", label: `${hours.toFixed(1)}h remaining` };
  return { status: "normal", label: `${hours.toFixed(0)}h remaining` };
}
