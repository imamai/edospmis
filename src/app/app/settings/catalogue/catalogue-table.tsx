"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { setCatalogueItemActive } from "./actions";
import { formatMoney } from "@/lib/utils";
import type { CatalogueItem } from "@/lib/data/catalogue";

/**
 * The catalogue as a list, with a filter.
 *
 * Filtered in the browser: the whole catalogue is already on the page for an
 * administrator who came here to maintain it, so a round trip per keystroke
 * would be slower and no more correct.
 *
 * Withdrawing rather than deleting, throughout. A request raised last year
 * still points at a row, and deleting it would leave that history unreadable.
 */
export function CatalogueTable({
  items,
  currency,
}: {
  items: CatalogueItem[];
  currency: string;
}) {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const shown = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (i) =>
        i.description.toLowerCase().includes(needle) ||
        (i.code ?? "").toLowerCase().includes(needle),
    );
  }, [items, term]);

  function toggle(item: CatalogueItem) {
    setBusyId(item.id);
    start(async () => {
      await setCatalogueItemActive(item.id, !item.is_active);
      setBusyId(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="relative max-w-sm">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
          aria-hidden="true"
        />
        <input
          id="catalogue-filter"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Filter by description or code"
          aria-label="Filter the catalogue"
          className="h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
        />
      </label>

      {shown.length === 0 ? (
        <p className="text-sm text-ink-faint">
          Nothing matches &ldquo;{term}&rdquo;.
        </p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-faint">
              <th className="pb-2 pr-4 font-medium">Code</th>
              <th className="pb-2 pr-4 font-medium">Description</th>
              <th className="pb-2 pr-4 font-medium">Unit</th>
              <th className="pb-2 pr-4 text-right font-medium">
                Indicative cost
              </th>
              <th className="pb-2 pr-4 font-medium">Source</th>
              <th className="pb-2 pr-4 font-medium">Status</th>
              <th className="pb-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {shown.map((item) => (
              <tr
                key={item.id}
                className="border-b border-line/60 last:border-0"
              >
                <td className="py-2 pr-4 font-mono text-xs text-ink-faint">
                  {item.code ?? "—"}
                </td>
                <td className="py-2 pr-4 text-ink">{item.description}</td>
                <td className="py-2 pr-4 text-ink-soft">{item.unit}</td>
                <td className="tnum py-2 pr-4 text-right text-ink-soft">
                  {item.indicative_unit_cost_cents === null
                    ? "—"
                    : formatMoney(item.indicative_unit_cost_cents, {
                        currency: item.currency || currency,
                      })}
                </td>
                <td className="py-2 pr-4 text-xs text-ink-faint">
                  {item.source === "import" ? "imported" : "added by hand"}
                </td>
                <td className="py-2 pr-4">
                  {item.is_active ? (
                    <Badge tone="good">available</Badge>
                  ) : (
                    <Badge tone="neutral">withdrawn</Badge>
                  )}
                </td>
                <td className="py-2 text-right">
                  <button
                    type="button"
                    onClick={() => toggle(item)}
                    disabled={pending && busyId === item.id}
                    className="text-xs font-semibold text-brand hover:underline disabled:opacity-50"
                  >
                    {pending && busyId === item.id
                      ? "Saving…"
                      : item.is_active
                        ? "Withdraw"
                        : "Make available"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
