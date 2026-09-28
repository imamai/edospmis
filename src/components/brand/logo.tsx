import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The EDOSPMIS mark: a document with a check cut into its corner — a request
 * that has been through an approval. Drawn rather than imported so it inherits
 * `currentColor` and stays crisp at any size.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={cn("h-7 w-7", className)}>
      <path
        d="M8 4.5h10.5L25 11v16.5H8V4.5Z"
        fill="currentColor"
        opacity="0.16"
      />
      <path
        d="M8 4.5h10.5L25 11v16.5H8V4.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M18 4.5V11h7" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path
        d="m11.5 19.2 3 3 6.2-6.6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark({
  className,
  href = "/",
  tone = "ink",
}: {
  className?: string;
  href?: string | null;
  tone?: "ink" | "light";
}) {
  const inner = (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className={tone === "light" ? "text-accent" : "text-brand"} />
      <span
        className={cn(
          "font-display text-[1.0625rem] leading-none font-extrabold tracking-tight",
          tone === "light" ? "text-white" : "text-ink",
        )}
      >
        EDOS<span className={tone === "light" ? "text-accent" : "text-brand"}>PMIS</span>
      </span>
    </span>
  );

  if (!href) return inner;
  return (
    <Link href={href} className="inline-flex" aria-label="EDOSPMIS home">
      {inner}
    </Link>
  );
}
