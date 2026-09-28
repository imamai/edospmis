import { describe, expect, it } from "vitest";
import { daysUntil, effectiveStatus, moneyLabel, priceLabel, seatLabel, type Subscription } from "./plans";

/**
 * What a subscription is *today* is a date comparison, not a column, and the
 * banner and the billing page both decide from it. Nothing runs at midnight
 * to flip a trial to expired — deliberately, because a nightly job that fails
 * silently is a worse source of truth than arithmetic that cannot. So these
 * are the cases that matter: the boundaries either side of an end date.
 */

const NOW = new Date("2026-09-27T12:00:00Z");

function sub(over: Partial<Subscription> = {}): Subscription {
  return {
    planId: "p1",
    planCode: "starter",
    planName: "Starter",
    priceCents: 450_000,
    status: "trialing",
    trialEndsAt: "2026-10-11T12:00:00Z",
    currentPeriodEnd: "2026-10-11T12:00:00Z",
    startedAt: "2026-09-27T12:00:00Z",
    ...over,
  };
}

describe("effectiveStatus", () => {
  it("is trialing while the trial still has time on it", () => {
    expect(effectiveStatus(sub(), NOW)).toBe("trialing");
  });

  it("reads a lapsed trial as over, without the column having changed", () => {
    const lapsed = sub({ trialEndsAt: "2026-09-26T12:00:00Z" });
    expect(lapsed.status).toBe("trialing");
    expect(effectiveStatus(lapsed, NOW)).toBe("trial_over");
  });

  it("treats the moment the trial ends as over, not as a last free day", () => {
    expect(effectiveStatus(sub({ trialEndsAt: NOW.toISOString() }), NOW)).toBe("trial_over");
  });

  it("is active while the paid period runs", () => {
    expect(effectiveStatus(sub({ status: "active" }), NOW)).toBe("active");
  });

  it("is past due once the paid period has ended", () => {
    const lapsed = sub({ status: "active", currentPeriodEnd: "2026-09-01T12:00:00Z" });
    expect(effectiveStatus(lapsed, NOW)).toBe("past_due");
  });

  it("keeps a cancelled subscription cancelled whatever the dates say", () => {
    expect(effectiveStatus(sub({ status: "cancelled" }), NOW)).toBe("cancelled");
  });

  it("does not claim a trial is running when no end date was ever set", () => {
    // A row written by hand with no trial_ends_at: better to read as an open
    // trial than to lock somebody out over a missing column.
    expect(effectiveStatus(sub({ trialEndsAt: null }), NOW)).toBe("trialing");
  });
});

describe("daysUntil", () => {
  it("counts whole days remaining", () => {
    expect(daysUntil("2026-10-11T12:00:00Z", NOW)).toBe(14);
  });

  it("rounds a part day up, so 'ends tomorrow' never reads as zero", () => {
    expect(daysUntil("2026-09-28T09:00:00Z", NOW)).toBe(1);
  });

  it("floors at zero rather than going negative", () => {
    expect(daysUntil("2026-09-01T12:00:00Z", NOW)).toBe(0);
    expect(daysUntil(null, NOW)).toBe(0);
  });
});

describe("labels", () => {
  it("renders shillings from cents with a thousands separator", () => {
    expect(priceLabel({ priceCents: 450_000, currency: "KES" })).toBe("KES 4,500");
    expect(priceLabel({ priceCents: 1_000_000, currency: "KES" })).toBe("KES 10,000");
    expect(moneyLabel(750_000)).toBe("KES 7,500");
  });

  it("says unlimited rather than printing nothing when there is no ceiling", () => {
    expect(seatLabel({ maxUsers: 5 })).toBe("Up to 5 users");
    expect(seatLabel({ maxUsers: null })).toBe("Unlimited users");
  });
});
