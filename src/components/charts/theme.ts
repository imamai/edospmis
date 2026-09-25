/** EDOSPMIS's own palette, not recharts' defaults — same tokens as globals.css. */
export const CHART = {
  brand: "#1d3557",
  brandMid: "#2f4d78",
  accent: "#d98e2f",
  info: "#1f6f8b",
  good: "#2e7d52",
  attention: "#b45309",
  critical: "#b42318",
};

export const PALETTE = [CHART.brand, CHART.accent, CHART.info, CHART.good, CHART.attention, CHART.brandMid, CHART.critical];

export const AXIS_PROPS = {
  stroke: "#e2e5ee",
  tick: { fill: "#545b6b", fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: "#e2e5ee" },
} as const;

export const TOOLTIP_STYLE = {
  contentStyle: { background: "#ffffff", border: "1px solid #e2e5ee", borderRadius: 8, fontSize: 12, padding: "8px 10px" },
  labelStyle: { color: "#161a23", fontWeight: 600, marginBottom: 2 },
  cursor: { fill: "#eef0f6" },
} as const;
