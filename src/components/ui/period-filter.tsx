"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PeriodKey } from "@/lib/report-period";

const OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
  { key: "all", label: "All time" },
];

export function PeriodFilter({ activeKey }: { activeKey: PeriodKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [customOpen, setCustomOpen] = useState(activeKey === "custom");
  const [from, setFrom] = useState(searchParams.get("from") ?? "");
  const [to, setTo] = useState(searchParams.get("to") ?? "");

  function go(params: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(params)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    router.push(`${pathname}?${next.toString()}`);
  }

  function selectPreset(key: PeriodKey) {
    setCustomOpen(false);
    go({ period: key, from: null, to: null });
  }

  function applyCustom() {
    if (!from && !to) return;
    go({ period: null, from: from || null, to: to || null });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {OPTIONS.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => selectPreset(o.key)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
            activeKey === o.key ? "border-brand bg-brand text-white" : "border-line text-ink-soft hover:border-brand/50",
          )}
        >
          {o.label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setCustomOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
          activeKey === "custom" ? "border-brand bg-brand text-white" : "border-line text-ink-soft hover:border-brand/50",
        )}
      >
        <Calendar className="h-3.5 w-3.5" />
        Custom
      </button>
      {customOpen && (
        <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-2 py-1.5 shadow-card">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="From date"
            className="rounded-md border border-line-strong px-1.5 py-1 text-xs"
          />
          <span className="text-xs text-ink-faint">to</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-label="To date"
            className="rounded-md border border-line-strong px-1.5 py-1 text-xs"
          />
          <button type="button" onClick={applyCustom} className="rounded-md bg-brand px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-mid">
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
