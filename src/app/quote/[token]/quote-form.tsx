"use client";

import { useActionState, useMemo, useState } from "react";
import { submitQuotation, declineInvite, type QuoteFormState } from "./actions";
import { Button } from "@/components/ui/button";
import { TextArea, TextInput } from "@/components/ui/field";
import { formatMoney } from "@/lib/utils";
import type { PRItem } from "@/lib/database.types";

const initial: QuoteFormState = { error: null };

export function QuoteForm({ token, items, defaultName }: { token: string; items: PRItem[]; defaultName: string }) {
  const [state, action, pending] = useActionState(submitQuotation.bind(null, token), initial);
  const [prices, setPrices] = useState<string[]>(() => items.map(() => ""));

  const linePrices = items.map((item, i) => ({
    description: item.description,
    qty: item.qty,
    unit: item.unit,
    unit_price_cents: Math.round((Number(prices[i]) || 0) * 100),
  }));
  const total = useMemo(() => linePrices.reduce((sum, l) => sum + l.qty * l.unit_price_cents, 0), [linePrices]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="line_prices" value={JSON.stringify(linePrices)} />

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-sunk text-xs uppercase tracking-wide text-ink-faint">
              <th className="p-2.5 font-medium">Item</th>
              <th className="p-2.5 font-medium">Qty</th>
              <th className="p-2.5 font-medium">Unit</th>
              <th className="p-2.5 font-medium">Your unit price</th>
              <th className="p-2.5 text-right font-medium">Line total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                <td className="p-2.5 text-ink">{item.description}</td>
                <td className="p-2.5 tnum text-ink-soft">{item.qty}</td>
                <td className="p-2.5 text-ink-soft">{item.unit}</td>
                <td className="p-2.5">
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={prices[i]}
                    onChange={(e) => setPrices((p) => p.map((v, idx) => (idx === i ? e.target.value : v)))}
                    className="h-9 w-28 rounded-md border border-line-strong bg-surface px-2 text-sm tnum focus:border-brand focus:outline-none"
                  />
                </td>
                <td className="p-2.5 text-right tnum text-ink-soft">{formatMoney(item.qty * Math.round((Number(prices[i]) || 0) * 100))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t border-line bg-surface-sunk p-2.5 text-sm">
          <span className="font-medium text-ink">Total</span>
          <span className="font-semibold tnum text-ink">{formatMoney(total)}</span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <TextInput label="Company / your name" name="supplier_name" defaultValue={defaultName} required />
        <TextInput label="Email" name="supplier_email" type="email" hint="So we can reach you" />
        <TextInput label="Phone" name="supplier_phone" hint="Optional" />
      </div>
      <TextArea label="Notes" name="notes" rows={3} hint="Lead time, terms, anything else worth knowing — optional" />

      {state.error && (
        <p role="alert" className="rounded-lg border border-critical/25 bg-critical-soft px-3 py-2 text-sm text-critical">
          {state.error}
        </p>
      )}

      <div>
        <Button type="submit" busy={pending} disabled={total <= 0}>
          {pending ? "Submitting" : "Submit quotation"}
        </Button>
      </div>
    </form>
  );
}

export function DeclineInviteControl({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(declineInvite.bind(null, token), initial);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-ink-faint hover:text-critical">
        We can&rsquo;t quote this
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border border-line p-3">
      <TextInput label="Reason (optional)" name="reason" placeholder="Let them know why" />
      {state.error && <p className="text-xs text-critical">{state.error}</p>}
      <div className="flex items-center gap-2">
        <Button type="submit" variant="danger" size="sm" busy={pending}>
          Decline to quote
        </Button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm font-semibold text-ink-faint hover:text-ink">
          Cancel
        </button>
      </div>
    </form>
  );
}
