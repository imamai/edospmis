"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Boxes, Check, Search } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { findCatalogueItems } from "@/app/app/settings/catalogue/actions";
import { formatMoney } from "@/lib/utils";
import type { CatalogueItem } from "@/lib/data/catalogue";

export interface PickedItem {
  catalogueItemId: string;
  description: string;
  unit: string;
  qty: number;
  /** In whole currency units, because that is what the cost field takes. */
  cost: number | null;
}

/**
 * Choosing requisition lines from the catalogue.
 *
 * Several at once, because a request is usually a list — opening and closing a
 * dialog once per line is the thing this feature exists to replace.
 *
 * Searched on the server rather than by shipping the catalogue to the browser:
 * a catalogue worth having is too big to send to every requester who opens the
 * form, and most of it is irrelevant to any one request.
 */
export function CataloguePicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (items: PickedItem[]) => void;
}) {
  const [term, setTerm] = useState("");
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [chosen, setChosen] = useState<Record<string, number>>({});
  const [searching, startSearch] = useTransition();
  const [loaded, setLoaded] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Debounced, so typing "laptop" is one query and not six.
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      startSearch(async () => {
        setItems(await findCatalogueItems(term));
        setLoaded(true);
      });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [term, open]);

  // The dialog focuses its panel so a screen reader announces the title, so
  // the search box asks for focus itself — it is the one control anybody
  // wants first. Nothing is reset here: the parent mounts this component only
  // while it is open, so every opening starts with fresh state and a stale
  // selection cannot survive into the next request.
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => searchRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [open]);

  const count = Object.keys(chosen).length;

  function toggle(item: CatalogueItem) {
    setChosen((prev) => {
      const next = { ...prev };
      if (item.id in next) delete next[item.id];
      else next[item.id] = 1;
      return next;
    });
  }

  function setQty(id: string, qty: number) {
    setChosen((prev) => ({ ...prev, [id]: qty > 0 ? qty : 1 }));
  }

  function add() {
    // Built from `items` rather than from `chosen`, so the lines arrive in the
    // order they are shown rather than in whatever order they were ticked.
    const picked: PickedItem[] = items
      .filter((item) => item.id in chosen)
      .map((item) => ({
        catalogueItemId: item.id,
        description: item.description,
        unit: item.unit,
        qty: chosen[item.id],
        cost:
          item.indicative_unit_cost_cents === null
            ? null
            : item.indicative_unit_cost_cents / 100,
      }));
    onPick(picked);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add items from the catalogue"
      description="Tick what you need and set the quantity. You can still type your own lines afterwards."
      size="lg"
    >
      <div className="flex flex-col gap-3">
        <label className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
            aria-hidden="true"
          />
          <input
            ref={searchRef}
            id="catalogue-picker-search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search by description or code"
            aria-label="Search the catalogue"
            className="h-11 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
          />
        </label>

        <div className="max-h-[48dvh] overflow-y-auto rounded-lg border border-line">
          {!loaded && searching ? (
            <p className="px-3 py-6 text-center text-sm text-ink-faint">
              Searching…
            </p>
          ) : items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-ink-faint">
              {term.trim()
                ? `Nothing in the catalogue matches “${term.trim()}”. Close this and type the line instead.`
                : "The catalogue is empty. Ask whoever maintains it to import your item list, or type the line instead."}
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {items.map((item) => {
                const picked = item.id in chosen;
                return (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center gap-3 px-3 py-2.5"
                  >
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        checked={picked}
                        onChange={() => toggle(item)}
                        className="h-4 w-4 shrink-0 accent-[var(--brand)]"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-ink">
                          {item.description}
                        </span>
                        <span className="block text-xs text-ink-faint">
                          {item.code ? (
                            <span className="font-mono">{item.code}</span>
                          ) : (
                            "no code"
                          )}{" "}
                          · per {item.unit}
                          {item.indicative_unit_cost_cents !== null
                            ? ` · about ${formatMoney(item.indicative_unit_cost_cents, { currency: item.currency })}`
                            : " · no indicative price"}
                        </span>
                      </span>
                    </label>

                    {picked && (
                      <label className="flex shrink-0 items-center gap-1.5 text-xs text-ink-soft">
                        Qty
                        <input
                          type="number"
                          min={1}
                          step="any"
                          value={chosen[item.id]}
                          onChange={(e) =>
                            setQty(item.id, Number(e.target.value))
                          }
                          aria-label={`Quantity of ${item.description}`}
                          className="h-9 w-20 rounded-md border border-line bg-surface px-2 text-sm text-ink focus:border-brand focus:outline-none"
                        />
                      </label>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-ink-faint">
            {count === 0
              ? "Nothing selected yet."
              : `${count} item${count === 1 ? "" : "s"} selected.`}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-ink-faint hover:text-ink"
            >
              Cancel
            </button>
            <Button type="button" disabled={count === 0} onClick={add}>
              {count > 0 ? (
                <Check className="mr-1.5 h-4 w-4" />
              ) : (
                <Boxes className="mr-1.5 h-4 w-4" />
              )}
              Add {count > 0 ? count : ""} to the request
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
