"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const AXIS = { fontSize: 11, fill: "#64748b" } as const;
const GRID = "#e2e8f0";

/* A restrained categorical ramp — distinguishable in light UI and in print. */
export const SERIES_COLORS = ["#2f66d6", "#0e9488", "#b45309", "#7c3aed", "#be123c", "#0369a1"];

export function ComparisonBarChart({
  data,
  xKey,
  bars,
  height = 260,
  domain,
}: {
  data: Record<string, string | number | null>[];
  xKey: string;
  bars: { key: string; name: string; color?: string }[];
  height?: number;
  domain?: [number, number];
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -12 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} domain={domain} />
          <Tooltip
            cursor={{ fill: "rgba(47,102,214,0.06)" }}
            contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }}
          />
          {bars.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
          {bars.map((bar, i) => (
            <Bar
              key={bar.key}
              dataKey={bar.key}
              name={bar.name}
              fill={bar.color ?? SERIES_COLORS[i % SERIES_COLORS.length]}
              radius={[4, 4, 0, 0]}
              maxBarSize={44}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendLineChart({
  data,
  xKey,
  lines,
  height = 240,
}: {
  data: Record<string, string | number>[];
  xKey: string;
  lines: { key: string; name: string; color?: string }[];
  height?: number;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -12 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} />
          {lines.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
          {lines.map((line, i) => (
            <Line
              key={line.key}
              type="monotone"
              dataKey={line.key}
              name={line.name}
              stroke={line.color ?? SERIES_COLORS[i % SERIES_COLORS.length]}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Score distribution histogram; bars are tinted by band rather than by index. */
export function DistributionChart({
  data,
  height = 220,
}: {
  data: { label: string; count: number; tone: "danger" | "warning" | "info" | "success" }[];
  height?: number;
}) {
  const tint = { danger: "#b91c1c", warning: "#b45309", info: "#0369a1", success: "#15803d" };
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -12 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} />
          <Bar dataKey="count" name="Teams" radius={[4, 4, 0, 0]} maxBarSize={56}>
            {data.map((d) => (
              <Cell key={d.label} fill={tint[d.tone]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
