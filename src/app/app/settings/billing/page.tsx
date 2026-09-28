import Link from "next/link";
import { requireSession, can } from "@/lib/data/session";
import { getPlans, getSubscription, getSubscriptionPayments } from "@/lib/data/billing";
import {
  CURRENCY,
  PAYMENT_NOTE,
  TRIAL_DAYS,
  daysUntil,
  effectiveStatus,
  moneyLabel,
  priceLabel,
  seatLabel,
  type EffectiveStatus,
} from "@/lib/plans";
import { Badge, type Tone } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PaymentForm, PlanChooser } from "./billing-forms";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Billing" };

/** "mpesa" capitalised by CSS reads as "Mpesa", which is not how it is written. */
const PROVIDER: Record<string, string> = {
  mpesa: "M-Pesa",
  bank: "Bank transfer",
  cash: "Cash",
  other: "Other",
};

const STATUS: Record<EffectiveStatus, { label: string; tone: Tone }> = {
  trialing: { label: "Free trial", tone: "info" },
  trial_over: { label: "Trial ended", tone: "attention" },
  active: { label: "Paid", tone: "good" },
  past_due: { label: "Payment due", tone: "attention" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export default async function BillingPage() {
  const session = await requireSession();
  if (!can(session, "admin.org.manage")) {
    return (
      <div className="empty-frame mx-auto max-w-md px-6 py-10 text-center text-sm text-ink-faint">
        You don&rsquo;t have permission to see billing for this workspace.
      </div>
    );
  }

  const [plans, subscription, payments] = await Promise.all([
    getPlans(),
    getSubscription(session.tenant.id),
    getSubscriptionPayments(session.tenant.id),
  ]);

  if (!subscription) {
    return (
      <div className="empty-frame mx-auto max-w-md px-6 py-10 text-center text-sm text-ink-faint">
        This workspace has no subscription record yet. Contact EDOS Centre and we
        will set one up.
      </div>
    );
  }

  const state = effectiveStatus(subscription);
  const badge = STATUS[state];
  const trialLeft = daysUntil(subscription.trialEndsAt);
  const periodLeft = daysUntil(subscription.currentPeriodEnd);
  const plan = plans.find((p) => p.code === subscription.planCode) ?? null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Billing</h1>
        <p className="mt-1 text-sm text-ink-faint">
          What this workspace is on, when it is due, and what has been paid.
        </p>
      </div>

      {/* ------------------------------------------------- where you stand -- */}
      <Card>
        <CardHeader
          title={`${subscription.planName} · ${priceLabel({ priceCents: subscription.priceCents, currency: CURRENCY })} a month`}
          subtitle={plan ? seatLabel(plan) : undefined}
          action={<Badge tone={badge.tone}>{badge.label}</Badge>}
        />
        <CardBody className="flex flex-col gap-4">
          {state === "trialing" && (
            <p className="text-sm leading-relaxed text-ink">
              Your {TRIAL_DAYS}-day free trial ends{" "}
              <strong className="font-semibold">
                {formatDate(subscription.trialEndsAt)}
              </strong>{" "}
              — {trialLeft} {trialLeft === 1 ? "day" : "days"} from now. Nothing has
              been charged, and nothing will be until you pay an invoice.
            </p>
          )}

          {state === "trial_over" && (
            <p className="text-sm leading-relaxed text-ink">
              The free trial ended {formatDate(subscription.trialEndsAt)}. Your records
              are untouched and the workspace still works — but the subscription is
              now payable. Record the payment below once it has been made.
            </p>
          )}

          {state === "active" && (
            <p className="text-sm leading-relaxed text-ink">
              Paid up to{" "}
              <strong className="font-semibold">
                {formatDate(subscription.currentPeriodEnd)}
              </strong>{" "}
              — {periodLeft} {periodLeft === 1 ? "day" : "days"} remaining.
            </p>
          )}

          {state === "past_due" && (
            <p className="text-sm leading-relaxed text-ink">
              The paid period ended {formatDate(subscription.currentPeriodEnd)}. Record
              the next payment below to extend it.
            </p>
          )}

          {state === "cancelled" && (
            <p className="text-sm leading-relaxed text-ink">
              This subscription is cancelled. Talk to EDOS Centre to start it again.
            </p>
          )}

          <p className="text-xs leading-relaxed text-ink-faint">{PAYMENT_NOTE}</p>
        </CardBody>
      </Card>

      {/* -------------------------------------------------------- the plan -- */}
      <Card>
        <CardHeader
          title="Plan"
          subtitle="What you are invoiced for each month"
          action={
            <Link href="/pricing" className="text-sm font-medium text-brand hover:underline">
              Compare plans
            </Link>
          }
        />
        <CardBody>
          <PlanChooser plans={plans} current={subscription.planCode} />
        </CardBody>
      </Card>

      {/* ----------------------------------------------------- record a payment */}
      <Card>
        <CardHeader
          title="Record a payment"
          subtitle="Money already received — this does not take a payment"
        />
        <CardBody>
          <PaymentForm plans={plans} current={subscription.planCode} />
        </CardBody>
      </Card>

      {/* ------------------------------------------------------------ history */}
      <Card>
        <CardHeader title="Payments" subtitle="Most recent first" />
        <CardBody>
          {payments.length === 0 ? (
            <p className="empty-frame px-4 py-8 text-center text-sm text-ink-faint">
              Nothing recorded yet.
            </p>
          ) : (
            <div className="scroll-slim overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-ink-faint uppercase">
                    <th className="py-2 pr-3 font-medium">Paid</th>
                    <th className="py-2 pr-3 font-medium">For</th>
                    <th className="py-2 pr-3 font-medium">Method</th>
                    <th className="py-2 pr-3 font-medium">Reference</th>
                    <th className="py-2 pr-3 text-right font-medium">Amount</th>
                    <th className="py-2 font-medium">Covers</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-b border-line last:border-0">
                      <td className="py-2.5 pr-3 whitespace-nowrap text-ink">
                        {formatDate(p.paidAt)}
                      </td>
                      <td className="py-2.5 pr-3 text-ink-soft">
                        {p.kind === "onboarding" ? "Onboarding" : "Subscription"}
                      </td>
                      <td className="py-2.5 pr-3 text-ink-soft">{PROVIDER[p.provider] ?? p.provider}</td>
                      <td className="py-2.5 pr-3 text-ink-soft">{p.reference ?? "—"}</td>
                      <td className="py-2.5 pr-3 text-right text-ink tnum">
                        {moneyLabel(p.amountCents, p.currency)}
                      </td>
                      <td className="py-2.5 whitespace-nowrap text-ink-faint">
                        {p.coversTo ? `to ${formatDate(p.coversTo)}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
