import Link from "next/link";
import { AlertTriangle, Clock } from "lucide-react";
import {
  daysUntil,
  effectiveStatus,
  moneyLabel,
  type Subscription,
} from "@/lib/plans";
import { formatDate } from "@/lib/utils";

/**
 * A slim strip at the top of the application when money needs attention.
 *
 * It is deliberately quiet, and deliberately absent most of the time: it says
 * nothing at all while a trial has more than five days to run or a paid
 * period is comfortably inside its term. A banner that is always there is a
 * banner nobody reads.
 *
 * It never blocks anything. An ended trial does not lock somebody out of
 * their own records — that would be a business decision taken by accident.
 */
export function TrialBanner({
  subscription,
  canManage,
}: {
  subscription: Subscription | null;
  canManage: boolean;
}) {
  if (!subscription) return null;

  const state = effectiveStatus(subscription);
  const trialLeft = daysUntil(subscription.trialEndsAt);

  let tone: "info" | "attention" | null = null;
  let message: React.ReactNode = null;

  if (state === "trialing" && trialLeft <= 5) {
    tone = "info";
    message = (
      <>
        Your free trial ends in{" "}
        <strong className="font-semibold">
          {trialLeft} {trialLeft === 1 ? "day" : "days"}
        </strong>{" "}
        — on {formatDate(subscription.trialEndsAt)}. After that,{" "}
        {subscription.planName} is {moneyLabel(subscription.priceCents)} a month.
      </>
    );
  } else if (state === "trial_over") {
    tone = "attention";
    message = (
      <>
        Your free trial ended on {formatDate(subscription.trialEndsAt)}. Nothing has
        been locked — the subscription is simply payable now.
      </>
    );
  } else if (state === "past_due") {
    tone = "attention";
    message = (
      <>
        The paid period ended on {formatDate(subscription.currentPeriodEnd)}. Record
        the next payment to extend it.
      </>
    );
  }

  if (!tone) return null;

  const Icon = tone === "attention" ? AlertTriangle : Clock;

  return (
    <div
      className={
        tone === "attention"
          ? "flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-attention/25 bg-attention-soft px-4 py-2.5 text-sm text-attention sm:px-6"
          : "flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-info/25 bg-info-soft px-4 py-2.5 text-sm text-info sm:px-6"
      }
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1">{message}</p>
      {canManage ? (
        <Link
          href="/app/settings/billing"
          className="font-semibold underline underline-offset-2 hover:no-underline"
        >
          Billing
        </Link>
      ) : (
        // Somebody who cannot act on it should not be sent to a page that
        // will refuse them.
        <span className="text-xs opacity-80">Ask an administrator</span>
      )}
    </div>
  );
}
