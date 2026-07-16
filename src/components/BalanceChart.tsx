"use client";

import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { memo } from "react";
import { metricConfig } from "@/lib/metrics";

type ChartPoint = Record<string, number | string>;

function BalanceChart({
  data,
  activeMetrics,
  primaryMetricKey,
}: {
  data: ChartPoint[];
  activeMetrics: Set<string>;
  primaryMetricKey: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
        <defs>
          {metricConfig.map((m) => (
            <linearGradient key={m.key} id={`chartGradient-${m.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={m.color} stopOpacity={0.35} />
              <stop offset="95%" stopColor={m.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff1a" vertical={false} />
        <XAxis
          dataKey="date"
          fontSize={11}
          stroke="#94a3b8"
          angle={-45}
          textAnchor="end"
          height={50}
          minTickGap={16}
          interval="preserveStartEnd"
        />
        <YAxis
          yAxisId="left"
          domain={[0, (max: number) => (max <= 0 ? 10 : max)]}
          fontSize={11}
          stroke="#94a3b8"
          tickFormatter={(v: number) => (primaryMetricKey === "commission" ? `€${Math.round(v).toLocaleString("de-DE")}` : Math.round(v).toLocaleString("de-DE"))}
          width={52}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          domain={[0, (max: number) => (max <= 0 ? 10 : max)]}
          fontSize={11}
          stroke="#94a3b8"
          tickFormatter={(v: number) => Math.round(v).toLocaleString("de-DE")}
          width={Array.from(activeMetrics).some((k) => k !== primaryMetricKey) ? 46 : 0}
          hide={!Array.from(activeMetrics).some((k) => k !== primaryMetricKey)}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#0a0a0a",
            border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: 8,
          }}
          labelStyle={{ color: "#94a3b8" }}
          itemStyle={{ color: "#34d399" }}
          formatter={(value, name) => {
            const metric = metricConfig.find((m) => m.key === name);
            return [value, metric ? metric.label : name];
          }}
        />
        {(() => {
          const showArea = activeMetrics.size <= 2;
          return metricConfig.map((m) => {
            const isPrimary = m.key === primaryMetricKey;
            const commonProps = {
              key: m.key,
              type: "monotone" as const,
              dataKey: m.key,
              yAxisId: isPrimary ? "left" : "right",
              stroke: m.color,
              strokeWidth: 2,
              dot: { r: 3, strokeWidth: 2, fill: "#0a0a0a" },
              hide: !activeMetrics.has(m.key),
            };
            return showArea ? (
              <Area {...commonProps} fill={`url(#chartGradient-${m.key})`} />
            ) : (
              <Line {...commonProps} />
            );
          });
        })()}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export default memo(BalanceChart);
