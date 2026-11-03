"use client";

import type { CSSProperties } from "react";
import { Area, AreaChart, Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const chartColors = {
  green: "#4dd7d0",
  blue: "#6f9cff",
  purple: "#9369e9",
  available: "rgba(255,255,255,.28)",
  paper: "#edf6f3",
  red: "#e45167",
};

type GaugeTone = "good" | "warning" | "danger";

const gaugeToneColors: Record<GaugeTone, string> = {
  good: "#19bc67",
  warning: "#d9871e",
  danger: "#c83b45",
};

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload || {};
  return <div className="dashboard-chart-tooltip"><strong>{row.tooltipLabel || label}</strong><span>{row.tooltipValue || payload[0].value}</span></div>;
}

function MiniBarChart({ data, className = "" }: { data: any[]; className?: string }) {
  return <div className={`dashboard-chart-frame dashboard-chart-mini ${className}`} role="img" aria-label="Dashboard comparison chart">
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 5, right: 4, bottom: 0, left: 4 }}>
        <Tooltip content={<ChartTooltip />} cursor={false} />
        <Bar dataKey="value" barSize={26} radius={[5, 5, 2, 2]} isAnimationActive={false}>
          {data.map((row, index) => <Cell key={`${row.name}-${index}`} fill={row.fill || chartColors.green} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div>;
}

function MiniAreaChart({ data, className = "" }: { data: any[]; className?: string }) {
  return <div className={`dashboard-chart-frame dashboard-chart-mini ${className}`} role="img" aria-label="Dashboard line chart">
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 5, bottom: 0, left: 5 }}>
        <defs><linearGradient id="dashboard-mini-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={chartColors.green} stopOpacity={0.42} /><stop offset="100%" stopColor={chartColors.green} stopOpacity={0.03} /></linearGradient></defs>
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: "rgba(255,255,255,.45)", strokeWidth: 1 }} />
        <Area type="monotone" dataKey="value" stroke={chartColors.green} strokeWidth={2.2} fill="url(#dashboard-mini-area)" dot={{ r: 2.5, fill: "#fff", stroke: chartColors.green, strokeWidth: 1.5 }} activeDot={{ r: 4, fill: "#fff", stroke: chartColors.green, strokeWidth: 2 }} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  </div>;
}

function SegmentedCapacityGauge({
  value,
  total,
  className = "",
}: {
  value: number;
  total: number;
  className?: string;
}) {
  const segmentCount = 28;
  const ratio = total > 0 ? Math.min(Math.max(value / total, 0), 1) : 0;
  const filledSegments = Math.round(ratio * segmentCount);

  return (
    <div
      className={`dashboard-chart-frame dashboard-chart-mini dashboard-segmented-capacity ${className}`}
      role="img"
      aria-label={`${value} of ${total} capacity used`}
    >
      <div className="dashboard-segmented-capacity-bars">
        {Array.from({ length: segmentCount }, (_, index) => (
          <i
            className={`dashboard-segmented-capacity-segment${index < filledSegments ? " is-filled" : ""}`}
            style={{ "--dashboard-segment-delay": `${index * 80}ms` } as CSSProperties}
            key={index}
          />
        ))}
      </div>
    </div>
  );
}

function OccupancyChart({ occupied, available, tone }: { occupied: number; available: number; tone: GaugeTone }) {
  const data = [{ name: "Occupied", value: occupied, fill: gaugeToneColors[tone] }, { name: "Available", value: available, fill: "#edf6f3" }];
  return <div className="dashboard-chart-frame dashboard-chart-donut" role="img" aria-label={`${occupied} occupied and ${available} available seats`}>
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Tooltip content={<ChartTooltip />} />
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="88%" paddingAngle={2} startAngle={90} endAngle={-270} stroke="none" isAnimationActive animationBegin={0} animationDuration={3200} animationEasing="ease-out">
          {data.map((row) => <Cell key={row.name} fill={row.fill} />)}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  </div>;
}

function CapacityChart({ data }: { data: any[] }) {
  return <div className="dashboard-chart-frame dashboard-chart-main" role="img" aria-label="Capacity by workspace type">
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#8994a3", fontSize: 10 }} />
        <YAxis hide domain={[0, "dataMax"]} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(77,215,208,.08)" }} />
        <Bar dataKey="occupied" name="Occupied" stackId="capacity" fill="#008761" barSize={56} radius={[0, 0, 0, 0]} isAnimationActive={false} />
        <Bar dataKey="available" name="Available" stackId="capacity" fill="#e8f3f0" barSize={56} radius={[7, 7, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  </div>;
}

function RevenueChart({ data }: { data: any[] }) {
  return <div className="dashboard-chart-frame dashboard-chart-revenue" role="img" aria-label="Revenue by workspace type">
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#8994a3", fontSize: 10 }} />
        <YAxis hide />
        <Tooltip content={<ChartTooltip />} cursor={false} />
        <Bar dataKey="value" name="MRR" barSize={56} radius={[8, 8, 2, 2]} isAnimationActive={false}>
          {data.map((row) => <Cell key={row.name} fill={row.fill} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div>;
}

export function DashboardChart({
  variant,
  metrics,
  tone = "good",
}: {
  variant: string;
  metrics: any;
  tone?: GaugeTone;
}) {
  const available = metrics.privateAvailable + metrics.sharedAvailable;
  if (variant === "mini-occupancy") return <MiniAreaChart className="dashboard-chart-dark" data={[{ name: "Occupied", value: metrics.totalOccupied }, { name: "Available", value: available }, { name: "Total", value: metrics.totalSeats }]} />;
  if (variant === "mini-available") return <MiniBarChart className="dashboard-chart-turquoise" data={[{ name: "Private", value: metrics.privateAvailable, fill: "rgba(255,255,255,.7)" }, { name: "Shared", value: metrics.sharedAvailable, fill: "rgba(255,255,255,.45)" }]} />;
  if (variant === "segmented-occupancy") return <SegmentedCapacityGauge value={metrics.totalOccupied} total={metrics.totalSeats} className={`dashboard-chart-segmented dashboard-chart-segmented-${tone}`} />;
  if (variant === "segmented-available") return <SegmentedCapacityGauge value={available} total={metrics.totalSeats} className={`dashboard-chart-segmented dashboard-chart-segmented-${tone}`} />;
  if (variant === "mini-revenue") return <MiniBarChart className="dashboard-chart-blue" data={[{ name: "Private", value: metrics.privateMrr, fill: "rgba(255,255,255,.82)" }, { name: "Shared", value: metrics.sharedMrr, fill: "rgba(255,255,255,.5)" }]} />;
  if (variant === "mini-opportunity") return <MiniBarChart className="dashboard-chart-red" data={[{ name: "Private", value: metrics.privateAvailable * metrics.privateAveragePrice, fill: "rgba(228,81,103,.55)" }, { name: "Shared", value: metrics.sharedAvailable * metrics.sharedAveragePrice, fill: "rgba(228,81,103,.85)" }]} />;
  if (variant === "occupancy") return <OccupancyChart occupied={metrics.totalOccupied} available={available} tone={tone} />;
  if (variant === "capacity") return <CapacityChart data={[{ name: "Private", occupied: metrics.privateOccupied, available: metrics.privateAvailable }, { name: "Shared", occupied: metrics.sharedOccupied, available: metrics.sharedAvailable }]} />;
  if (variant === "revenue") return <RevenueChart data={[{ name: "Private", value: metrics.privateMrr, fill: "#008761" }, { name: "Shared", value: metrics.sharedMrr, fill: "#9369e9" }]} />;
  return null;
}

