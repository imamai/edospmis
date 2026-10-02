"use client";

import { useActionState, useMemo, useState } from "react";
import { CircleAlert, FileSignature, PenLine } from "lucide-react";
import { submitBid, declineInvite, type QuoteFormState } from "./actions";
import { Button } from "@/components/ui/button";
import { TextArea, TextInput } from "@/components/ui/field";
import { formatMoney } from "@/lib/utils";
import { TenderPackForm } from "./tender-pack-form";
import type { BidPack } from "@/lib/tender-types";
import type { PRItem } from "@/lib/database.types";

const initial: QuoteFormState = { error: null };

/**
 * The bidder's whole response: prices, paperwork, signature, one button.
 *
 * It used to be two buttons on two components — "Submit quotation" here and
 * "Sign and submit" on the pack below — and there was no safe order to press
 * them in. Prices first closed the invitation, so the pack vanished and the
 * documents could never be sent; documents first signed a hash whose price
 * section read "no-quotation", so the signature bound no price. The live
 * system holds one of each mistake.
 *
 * The pack is rendered inside this form rather than beside it so there is
 * physically one submit on the page. Its uploads are their own buttons that
 * save as they go, which is why they can sit inside a form without being part
 * of it.
 */
export function QuoteForm({
  token,
  items,
  defaultName,
  pack,
}: {
  token: string;
  items: PRItem[];
  defaultName: string;
  /** Null when this tender asks for a price and nothing else. */
  pack: BidPack | null;
}) {
  const [state, action, pending] = useActionState(
    submitBid.bind(null, token),
    initial,
  );
  const [prices, setPrices] = useState<string[]>(() => items.map(() => ""));
  const [signedName, setSignedName] = useState("");
  const [signedPosition, setSignedPosition] = useState("");

  // What is still owed, by the same rule the database enforces on signing —
  // mandatory only, because an optional document they chose not to send is
  // their decision. Shown here so they are told before they press the button
  // rather than by an error afterwards.
  const suppliedDocTypes = new Set(
    (pack?.documents ?? []).map((d) => d.doc_type_id),
  );
  const answeredTemplates = new Set(
    (pack?.template_responses ?? []).map((t) => t.template_id),
  );
  const outstanding = (pack?.requirements ?? []).filter(
    (r) =>
      r.is_mandatory &&
      (r.kind === "document"
        ? !suppliedDocTypes.has(r.doc_type_id)
        : !answeredTemplates.has(r.template_id!)),
  );

  const signing = Boolean(pack && pack.requirements.length > 0);

  /**
   * A correction does not reopen the price.
   *
   * The prices table is not rendered at all rather than shown disabled: a
   * bidder looking at their own figures in a greyed-out box will try to change
   * them, and the server would refuse a second quotation in a way that reads
   * as the link being broken. Saying it plainly costs one sentence.
   */
  const correcting = Boolean(pack?.correction);

  const linePrices = items.map((item, i) => ({
    description: item.description,
    qty: item.qty,
    unit: item.unit,
    unit_price_cents: Math.round((Number(prices[i]) || 0) * 100),
  }));
  const total = useMemo(
    () => linePrices.reduce((sum, l) => sum + l.qty * l.unit_price_cents, 0),
    [linePrices],
  );

  const blocked = correcting
    ? outstanding.length > 0 || signedName.trim() === ""
    : total <= 0 ||
      (signing && (outstanding.length > 0 || signedName.trim() === ""));

  return (
    <form action={action} className="flex flex-col gap-4">
      <input
        type="hidden"
        name="line_prices"
        value={JSON.stringify(linePrices)}
      />

      {correcting ? (
        <p className="rounded-lg border border-line bg-surface-sunk px-3 py-2.5 text-sm text-ink-soft">
          Your price stands as you submitted it and is not being re-opened —
          only the documents below need correcting.
        </p>
      ) : (
        <>
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
                        onChange={(e) =>
                          setPrices((p) =>
                            p.map((v, idx) => (idx === i ? e.target.value : v)),
                          )
                        }
                        className="h-9 w-28 rounded-md border border-line-strong bg-surface px-2 text-sm tnum focus:border-brand focus:outline-none"
                      />
                    </td>
                    <td className="p-2.5 text-right tnum text-ink-soft">
                      {formatMoney(
                        item.qty * Math.round((Number(prices[i]) || 0) * 100),
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between border-t border-line bg-surface-sunk p-2.5 text-sm">
              <span className="font-medium text-ink">Total</span>
              <span className="font-semibold tnum text-ink">
                {formatMoney(total)}
              </span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <TextInput
              label="Company / your name"
              name="supplier_name"
              defaultValue={defaultName}
              required
            />
            <TextInput
              label="Email"
              name="supplier_email"
              type="email"
              hint="So we can reach you"
            />
            <TextInput label="Phone" name="supplier_phone" hint="Optional" />
          </div>
          <TextArea
            label="Notes"
            name="notes"
            rows={3}
            hint="Lead time, terms, anything else worth knowing — optional"
          />
        </>
      )}

      {/* The paperwork, inside the same form as the prices. */}
      {pack && pack.requirements.length > 0 && (
        <TenderPackForm token={token} pack={pack} />
      )}

      {signing && (
        <section className="flex flex-col gap-2 rounded-lg border border-line bg-surface-sunk p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <PenLine className="h-4 w-4 text-brand" aria-hidden="true" />
            Sign and submit
          </p>

          {outstanding.length > 0 ? (
            <p className="flex items-start gap-1.5 text-xs text-attention">
              <CircleAlert
                className="mt-0.5 h-3.5 w-3.5 shrink-0"
                aria-hidden="true"
              />
              Still needed before you can submit:{" "}
              {outstanding.map((r) => r.name).join(", ")}.
            </p>
          ) : (
            <p className="text-xs text-ink-faint">
              By signing you confirm the documents above, your answers and the
              prices you have entered are correct and that this offer stands.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput
              label="Name of the person signing"
              name="signed_name"
              value={signedName}
              onChange={(e) => setSignedName(e.target.value)}
              placeholder="e.g. Jane Wanjiru"
            />
            <TextInput
              label="Position"
              name="signed_position"
              value={signedPosition}
              onChange={(e) => setSignedPosition(e.target.value)}
              placeholder="e.g. Managing Director"
            />
          </div>
        </section>
      )}

      <input type="hidden" name="signing" value={signing ? "1" : "0"} />

      {state.error && (
        <p
          role="alert"
          className="rounded-lg border border-critical/25 bg-critical-soft px-3 py-2 text-sm text-critical"
        >
          {state.error}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <Button type="submit" busy={pending} disabled={blocked}>
          {signing && <FileSignature className="mr-1.5 h-4 w-4" />}
          {pending
            ? "Submitting"
            : correcting
              ? "Sign and resubmit"
              : signing
                ? "Sign and submit"
                : "Submit quotation"}
        </Button>
        {/* Why the button is dead, said next to it. A disabled button with no
            explanation reads as the page being broken, and this one has three
            different reasons to be disabled. */}
        {blocked && (
          <p className="text-xs text-ink-faint">
            {!correcting && total <= 0
              ? "Enter your prices above."
              : outstanding.length > 0
                ? "Attach what is still needed above."
                : "Type the name of the person signing."}
          </p>
        )}
      </div>
    </form>
  );
}

export function DeclineInviteControl({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    declineInvite.bind(null, token),
    initial,
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-ink-faint hover:text-critical"
      >
        We can&rsquo;t quote this
      </button>
    );
  }

  return (
    <form
      action={action}
      className="flex flex-col gap-3 rounded-lg border border-line p-3"
    >
      <TextInput
        label="Reason (optional)"
        name="reason"
        placeholder="Let them know why"
      />
      {state.error && <p className="text-xs text-critical">{state.error}</p>}
      <div className="flex items-center gap-2">
        <Button type="submit" variant="danger" size="sm" busy={pending}>
          Decline to quote
        </Button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm font-semibold text-ink-faint hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
