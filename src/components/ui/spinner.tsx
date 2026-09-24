import { cn } from "@/lib/utils";

/** The circular progress indicator used for every async state in the app. */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("spin h-5 w-5", className)}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/** Full-panel loading state — used by route-level loading.tsx files. */
export function LoadingPanel({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
      <Spinner className="h-8 w-8 text-brand" />
      <p className="text-sm text-ink-faint">{label}…</p>
    </div>
  );
}
