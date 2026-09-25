import Link from "next/link";

/** CSV first — the most universally-openable format — then Excel, then PDF. `base` may already carry its own querystring (the screen's active filters) — the download always matches what's on screen. */
export function ExportLinks({ base }: { base: string }) {
  const sep = base.includes("?") ? "&" : "?";
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <Link href={`${base}${sep}format=csv`} className="font-semibold text-ink-soft hover:text-brand">
        CSV
      </Link>
      <span className="text-ink-faint">&middot;</span>
      <Link href={`${base}${sep}format=xlsx`} className="font-semibold text-ink-soft hover:text-brand">
        Excel
      </Link>
      <span className="text-ink-faint">&middot;</span>
      <Link href={`${base}${sep}format=pdf`} className="font-semibold text-ink-soft hover:text-brand">
        PDF
      </Link>
    </div>
  );
}
