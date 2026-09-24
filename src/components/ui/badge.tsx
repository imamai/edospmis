import { cn } from "@/lib/utils";

type Tone = "neutral" | "good" | "attention" | "critical" | "info" | "brand";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-sunk text-ink-soft",
  good: "bg-good-soft text-good",
  attention: "bg-attention-soft text-attention",
  critical: "bg-critical-soft text-critical",
  info: "bg-info-soft text-info",
  brand: "bg-brand-soft text-brand",
};

/** A small status/role chip. Semantic color only — never the sole way state is conveyed. */
export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
