import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const TONES = {
  brand: "bg-brand-soft text-brand",
  good: "bg-good-soft text-good",
  attention: "bg-attention-soft text-attention",
  critical: "bg-critical-soft text-critical",
  info: "bg-info-soft text-info",
} as const;

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "brand",
  sub,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: keyof typeof TONES;
  sub?: string;
}) {
  return (
    <div className="group flex items-start gap-3 rounded-xl border border-line bg-surface p-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-raised">
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-110",
          TONES[tone],
        )}
      >
        <Icon className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-ink-faint">{label}</p>
        <p className="mt-0.5 truncate text-xl font-semibold tnum text-ink">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-ink-faint">{sub}</p>}
      </div>
    </div>
  );
}
