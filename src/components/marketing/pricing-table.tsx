import Link from "next/link";
import { Check } from "lucide-react";
import {
  ONBOARDING_NOTE,
  TRIAL_DAYS,
  priceLabel,
  seatLabel,
  type Plan,
} from "@/lib/plans";
import { cn } from "@/lib/utils";

/**
 * The published price list.
 *
 * `plans` comes from the database — the same rows a workspace is billed
 * against — so the figure advertised here and the figure on somebody's
 * subscription cannot disagree.
 */
export function PricingTable({ plans }: { plans: Plan[] }) {
  return (
    <div>
      <div className="grid gap-5 lg:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.code}
            className={cn(
              "flex flex-col rounded-2xl border bg-surface p-6",
              plan.isPopular
                ? "border-brand shadow-raised ring-1 ring-brand/20"
                : "border-line shadow-card",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-lg font-bold text-ink">{plan.name}</h3>
              {plan.isPopular && (
                <span className="rounded-full bg-brand px-2.5 py-1 text-[0.6875rem] font-semibold tracking-wide text-white uppercase">
                  Most chosen
                </span>
              )}
            </div>
            {plan.tagline && <p className="mt-1 text-sm text-ink-faint">{plan.tagline}</p>}

            <div className="mt-5 flex items-baseline gap-1.5">
              <span className="font-display text-3xl font-extrabold tracking-tight text-ink tnum">
                {priceLabel(plan)}
              </span>
              <span className="text-sm text-ink-faint">/{plan.billingPeriod}</span>
            </div>
            <p className="mt-1.5 text-xs text-ink-faint">
              {seatLabel(plan)} · plus a one-off onboarding fee
            </p>

            <Link
              href="/signup"
              className={cn(
                "mt-5 inline-flex h-11 items-center justify-center rounded-lg text-sm font-medium transition-colors",
                plan.isPopular
                  ? "bg-brand text-white hover:bg-brand-dark"
                  : "border border-line-strong text-ink hover:border-brand hover:text-brand",
              )}
            >
              Start {plan.name} free
            </Link>

            <ul className="mt-6 flex flex-col gap-2.5 border-t border-line pt-5">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-ink-soft">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-good" aria-hidden="true" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* The onboarding fee is the one figure not on the cards, because it is
          quoted per organisation. It gets stated plainly right under them
          rather than buried in the FAQ. */}
      <div className="mt-6 rounded-xl border border-accent/25 bg-accent-soft px-5 py-4">
        <p className="text-sm leading-relaxed text-ink">
          <span className="font-semibold">Onboarding, once.</span> {ONBOARDING_NOTE}
        </p>
      </div>

      <p className="mt-4 text-center text-sm text-ink-faint">
        Every plan starts with {TRIAL_DAYS} days free. No card needed.{" "}
        <Link href="/contact" className="font-medium text-brand hover:underline">
          Need something larger? Talk to us
        </Link>
      </p>
    </div>
  );
}
