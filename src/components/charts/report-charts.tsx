"use client";

import { Area, AreaChart, Bar, BarChart, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_PROPS, CHART, PALETTE, TOOLTIP_STYLE } from "./theme";
import { formatMoney } from "@/lib/utils";

/** Shared empty state so a chart never renders as a blank rectangle. */
function NoData({ height, message }: { height: number; message: string }) {
  return (
    <div
      className="flex items-center justify-center rounded-lg border border-dashed border-line text-center text-xs text-ink-faint"
      style={{ height }}
    >
      <span className="max-w-[18rem] px-4 leading-relaxed">{message}</span>
    </div>
  );
}

function formatHoursTick(minutes: number): string {
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(hours < 10 ? 1 : 0)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

export function StageDurationsChart({
  data,
  height = 240,
}: {
  data: { stage_key: string; label: string; avg_minutes: number }[];
  height?: number;
}) {
  if (data.length === 0) return <NoData height={height} message="No cases yet — this fills in once cases move through stages." />;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
        <XAxis type="number" tickFormatter={formatHoursTick} {...AXIS_PROPS} />
        <YAxis type="category" dataKey="label" width={100} {...AXIS_PROPS} />
        <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [formatHoursTick(Number(v)), "Avg time in stage"]} />
        <Bar dataKey="avg_minutes" fill={CHART.brand} radius={[0, 4, 4, 0]} maxBarSize={22} cursor="pointer" animationDuration={600} animationEasing="ease-out" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SlaComplianceChart({
  data,
  height = 220,
}: {
  data: { stage_key: string; label: string; on_time: number; breached: number }[];
  height?: number;
}) {
  if (data.length === 0) return <NoData height={height} message="No completed tasks with an SLA target yet." />;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <XAxis dataKey="label" {...AXIS_PROPS} />
        <YAxis allowDecimals={false} {...AXIS_PROPS} />
        <Tooltip {...TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="on_time" name="On time" stackId="s" fill={CHART.good} radius={[0, 0, 0, 0]} maxBarSize={40} cursor="pointer" animationDuration={600} animationEasing="ease-out" />
        <Bar dataKey="breached" name="Breached" stackId="s" fill={CHART.critical} radius={[4, 4, 0, 0]} maxBarSize={40} cursor="pointer" animationDuration={600} animationEasing="ease-out" animationBegin={100} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SpendByCategoryChart({
  data,
  height = 240,
}: {
  data: { category_name: string; total_estimated_cents: number }[];
  height?: number;
}) {
  if (data.length === 0) return <NoData height={height} message="No requests yet — spend by category appears once PRs are created." />;

  return (
    <ResponsiveContainer width="100%" height={height + 24}>
      <PieChart>
        <Pie
          data={data}
          dataKey="total_estimated_cents"
          nameKey="category_name"
          cx="50%"
          cy="45%"
          innerRadius="45%"
          outerRadius="75%"
          paddingAngle={1.5}
          cursor="pointer"
          animationDuration={700}
          animationEasing="ease-out"
        >
          {data.map((entry, i) => (
            <Cell key={entry.category_name} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip {...TOOLTIP_STYLE} formatter={(v) => formatMoney(Number(v))} />
        <Legend wrapperStyle={{ fontSize: 11 }} layout="horizontal" verticalAlign="bottom" align="center" />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function RequestsTrendChart({
  data,
  height = 220,
}: {
  data: { day: string; request_count: number }[];
  height?: number;
}) {
  if (data.every((d) => d.request_count === 0)) {
    return <NoData height={height} message="No requests raised in this period yet." />;
  }
  const formatted = data.map((d) => ({ ...d, label: new Date(d.day).toLocaleDateString("en-KE", { day: "numeric", month: "short" }) }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={formatted} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
        <defs>
          <linearGradient id="requestsTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART.brand} stopOpacity={0.35} />
            <stop offset="100%" stopColor={CHART.brand} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="label" {...AXIS_PROPS} minTickGap={24} />
        <YAxis allowDecimals={false} {...AXIS_PROPS} width={28} />
        <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [String(v), "Requests"]} />
        <Area
          type="monotone"
          dataKey="request_count"
          stroke={CHART.brand}
          strokeWidth={2}
          fill="url(#requestsTrendFill)"
          animationDuration={700}
          animationEasing="ease-out"
          dot={false}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function SupplierSpendChart({
  data,
  height = 240,
}: {
  data: { supplier_name: string; total_cents: number }[];
  height?: number;
}) {
  if (data.length === 0) return <NoData height={height} message="No purchase orders yet." />;
  const top = [...data].sort((a, b) => b.total_cents - a.total_cents).slice(0, 8);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={top} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 4 }}>
        <XAxis type="number" tickFormatter={(v) => formatMoney(v, {}).replace(/\.00$/, "")} {...AXIS_PROPS} />
        <YAxis type="category" dataKey="supplier_name" width={110} {...AXIS_PROPS} />
        <Tooltip {...TOOLTIP_STYLE} formatter={(v) => formatMoney(Number(v))} />
        <Bar dataKey="total_cents" fill={CHART.accent} radius={[0, 4, 4, 0]} maxBarSize={22} cursor="pointer" animationDuration={600} animationEasing="ease-out" />
      </BarChart>
    </ResponsiveContainer>
  );
}
