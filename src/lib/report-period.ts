export type PeriodKey = "today" | "week" | "month" | "year" | "all" | "custom";

export interface ResolvedPeriod {
  key: PeriodKey;
  label: string;
  from: string | null;
  to: string | null;
}

const LABEL: Record<Exclude<PeriodKey, "custom">, string> = {
  today: "Today",
  week: "This week",
  month: "This month",
  year: "This year",
  all: "All time",
};

/** Monday-start week, UTC-anchored so the boundary doesn't drift with the server's local zone. */
export function resolvePeriod(params: { period?: string; from?: string; to?: string }): ResolvedPeriod {
  if (params.from || params.to) {
    return {
      key: "custom",
      label: "Custom",
      from: params.from ? new Date(`${params.from}T00:00:00.000Z`).toISOString() : null,
      to: params.to ? new Date(`${params.to}T23:59:59.999Z`).toISOString() : null,
    };
  }

  const key = (params.period as PeriodKey) || "all";
  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  if (key === "today") return { key, label: LABEL.today, from: startOfToday.toISOString(), to: null };
  if (key === "week") {
    const diffToMonday = (startOfToday.getUTCDay() + 6) % 7;
    const start = new Date(startOfToday);
    start.setUTCDate(start.getUTCDate() - diffToMonday);
    return { key, label: LABEL.week, from: start.toISOString(), to: null };
  }
  if (key === "month") {
    return { key, label: LABEL.month, from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(), to: null };
  }
  if (key === "year") {
    return { key, label: LABEL.year, from: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString(), to: null };
  }
  return { key: "all", label: LABEL.all, from: null, to: null };
}
