import { describe, expect, it } from "vitest";
import {
  averageGap,
  dayGap,
  dayGapLabel,
  deliveryState,
  deliveryVariance,
  deliveryVarianceLabel,
  overdueDays,
} from "./cycle-time";

/**
 * Every "Days from X to Y" column in the procure-to-receive report runs
 * through these three functions, so what matters is the distinction between
 * "took no time" and "has not happened yet". Reporting the second as zero
 * would make a stalled pipeline read as an instant one.
 */

describe("dayGap", () => {
  it("measures whole days between two moments", () => {
    expect(dayGap("2026-09-01T09:00:00Z", "2026-09-04T09:00:00Z")).toBe(3);
  });

  it("keeps one decimal, so an afternoon's delay is not rounded away", () => {
    // Four hours is the shape of most approval gaps — reporting "0 days"
    // would hide exactly what the report exists to show.
    expect(dayGap("2026-09-01T08:00:00Z", "2026-09-01T12:00:00Z")).toBe(0.2);
  });

  it("is null, not zero, when the request has not reached that gate", () => {
    expect(dayGap("2026-09-01T09:00:00Z", null)).toBeNull();
    expect(dayGap(null, "2026-09-04T09:00:00Z")).toBeNull();
    expect(dayGap(null, null)).toBeNull();
  });

  it("is null rather than NaN for an unparseable timestamp", () => {
    expect(dayGap("not a date", "2026-09-04T09:00:00Z")).toBeNull();
  });

  it("reports a negative gap rather than hiding it", () => {
    // A PO dated before its requisition means the data is wrong, and a report
    // that clamps it to zero is the reason nobody notices.
    expect(dayGap("2026-09-04T09:00:00Z", "2026-09-01T09:00:00Z")).toBe(-3);
  });
});

describe("dayGapLabel", () => {
  it("renders a gap in days", () => {
    expect(dayGapLabel(3)).toBe("3.0 d");
    expect(dayGapLabel(0.2)).toBe("0.2 d");
  });

  it("renders a missing gap as a dash", () => {
    expect(dayGapLabel(null)).toBe("—");
  });
});

describe("averageGap", () => {
  it("averages only the gaps that exist", () => {
    // The null is a request still sitting at approval. Counting it as zero
    // would drag the average down and make a slow desk look fast.
    expect(averageGap([2, 4, null])).toBe(3);
  });

  it("is null when nothing has completed that step", () => {
    expect(averageGap([null, null])).toBeNull();
    expect(averageGap([])).toBeNull();
  });

  it("rounds to one decimal", () => {
    expect(averageGap([1, 2, 2])).toBe(1.7);
  });
});

/**
 * The delivery window is a promise about a calendar day, not a moment, and
 * the difference matters: an order due on the 5th that arrives at 11pm on the
 * 5th was kept. Measuring in hours would call it most of a day late.
 */

const TODAY = new Date("2026-10-12T09:00:00Z");

describe("deliveryVariance", () => {
  it("is zero when the goods arrive on the promised day, whatever the hour", () => {
    expect(deliveryVariance("2026-10-05", "2026-10-05T09:00:00Z")).toBe(0);
    expect(deliveryVariance("2026-10-05", "2026-10-05T23:30:00Z")).toBe(0);
  });

  it("counts whole days late", () => {
    expect(deliveryVariance("2026-10-05", "2026-10-09T14:00:00Z")).toBe(4);
  });

  it("counts early as a negative, rather than clamping it to on time", () => {
    // A supplier who consistently delivers early is worth knowing about too.
    expect(deliveryVariance("2026-10-05", "2026-10-02T08:00:00Z")).toBe(-3);
  });

  it("is null where no window was agreed or nothing has arrived", () => {
    expect(deliveryVariance(null, "2026-10-09T14:00:00Z")).toBeNull();
    expect(deliveryVariance("2026-10-05", null)).toBeNull();
  });
});

describe("overdueDays", () => {
  it("counts days past the window while nothing has been received", () => {
    expect(overdueDays("2026-10-05", null, TODAY)).toBe(7);
  });

  it("is zero, not negative, while the order is still within its window", () => {
    expect(overdueDays("2026-10-20", null, TODAY)).toBe(0);
  });

  it("stops counting once the goods arrive", () => {
    expect(overdueDays("2026-10-05", "2026-10-09T14:00:00Z", TODAY)).toBeNull();
  });

  it("is null where no window was agreed", () => {
    expect(overdueDays(null, null, TODAY)).toBeNull();
  });
});

describe("deliveryState", () => {
  it("does not call an order with no agreed date on time", () => {
    // Nothing was promised, so nothing was kept — reporting "on time" here is
    // how a supplier with no window comes out looking punctual.
    expect(deliveryState(null, "2026-10-09T14:00:00Z", TODAY)).toBe("no_window");
  });

  it("separates received-late from still-running-late", () => {
    expect(deliveryState("2026-10-05", "2026-10-09T14:00:00Z", TODAY)).toBe("late");
    expect(deliveryState("2026-10-05", null, TODAY)).toBe("overdue");
  });

  it("reads an order inside its window as awaiting, not late", () => {
    expect(deliveryState("2026-10-20", null, TODAY)).toBe("awaiting");
  });

  it("reads on-the-day and early distinctly", () => {
    expect(deliveryState("2026-10-05", "2026-10-05T09:00:00Z", TODAY)).toBe("on_time");
    expect(deliveryState("2026-10-05", "2026-10-01T09:00:00Z", TODAY)).toBe("early");
  });
});

describe("deliveryVarianceLabel", () => {
  it("says it in words, with the singular right", () => {
    expect(deliveryVarianceLabel(4)).toBe("4 days late");
    expect(deliveryVarianceLabel(1)).toBe("1 day late");
    expect(deliveryVarianceLabel(-2)).toBe("2 days early");
    expect(deliveryVarianceLabel(0)).toBe("On the day");
    expect(deliveryVarianceLabel(null)).toBe("—");
  });
});
