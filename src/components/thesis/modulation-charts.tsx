"use client";

import React, { useEffect, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Fig313Data {
  layer: number;
  gca_mean: number;
  gca_std: number;
  mod_mean: number;
  mod_std: number;
}

interface ModulationData {
  figure_3_12: number[][] | null;
  figure_3_13: Fig313Data[] | null;
  figure_3_14: number[][];
}

const COLORS = {
  delta: "#4C78A8",
  mod: "#C44E52",
  norm: "#59A14F",
  grid: "#D9D9D9",
  text: "#2c2421",
  subtext: "#8a7e72",
};

export function ModulationAnalysisCharts() {
  const [data, setData] = useState<ModulationData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/data/modulation_analysis.json")
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load modulation analysis data:", err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex h-[600px] items-center justify-center rounded-xl border border-[#e8e0d5] bg-white">
        <div className="text-[#a89a8b]">正在加载分析数据...</div>
      </div>
    );
  }

  if (!data) return null;

  const fig313Extended = data.figure_3_13?.map((d) => ({
    ...d,
    gca_low: Math.max(0, d.gca_mean - d.gca_std),
    gca_high: d.gca_mean + d.gca_std,
    mod_low: Math.max(0, d.mod_mean - d.mod_std),
    mod_high: d.mod_mean + d.mod_std,
    gca_range: [Math.max(0, d.gca_mean - d.gca_std), d.gca_mean + d.gca_std],
    mod_range: [Math.max(0, d.mod_mean - d.mod_std), d.mod_mean + d.mod_std],
  }));

  return (
    <div className="space-y-8 py-4">
      {/* Heatmaps (3-12 & 3-14) */}
      <div className="grid gap-6 lg:grid-cols-2">
        {data.figure_3_12 && (
          <Heatmap
            id="3-12"
            title="图 3-12: 门控交叉注意力 逐去噪步逐层热力图"
            data={data.figure_3_12}
            vmax={0.1}
            label="有效变化比例"
            xAxisLabel="动作专家层索引"
            yAxisLabel="去噪步"
          />
        )}
        <Heatmap
          id="3-14"
          title="图 3-14: 归一化调制 逐去噪步逐层热力图"
          data={data.figure_3_14}
          vmax={1.2}
          label="调制贡献比例 ρ mod"
          xAxisLabel="动作专家层索引"
          yAxisLabel="去噪步"
        />
      </div>

      {/* Comparison: 门控交叉注意力 vs Modulator (3-13) */}
      {fig313Extended && (
        <ChartWrapper
          id="3-13"
          title="图 3-13: 门控交叉注意力 vs 归一化调制 逐层影响比例对比"
          description="对比 自适应层归一化与交叉注意力机制对隐藏状态的影响。自适应层归一化在中间层的扰动强度显著高于 门控交叉注意力。"
        >
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={fig313Extended}
                margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
              >
                <CartesianGrid
                  vertical={false}
                  stroke={COLORS.grid}
                  strokeDasharray="3 3"
                />
                <XAxis
                  dataKey="layer"
                  label={{
                    value: "动作专家层索引",
                    position: "bottom",
                    offset: 10,
                    fontSize: 12,
                  }}
                  tick={{ fontSize: 11 }}
                  stroke={COLORS.subtext}
                />
                <YAxis tick={{ fontSize: 11 }} stroke={COLORS.subtext} />
                <Tooltip content={<CustomTooltip />} />
                <Legend verticalAlign="top" align="right" height={36} />

                <Area
                  dataKey="gca_range"
                  stroke="none"
                  fill={COLORS.delta}
                  fillOpacity={0.15}
                  tooltipType="none"
                  legendType="none"
                />
                <Line
                  name="门控交叉注意力（GCA）"
                  type="monotone"
                  dataKey="gca_mean"
                  stroke={COLORS.delta}
                  strokeWidth={2}
                  dot={{ r: 4, fill: COLORS.delta }}
                />

                <Area
                  dataKey="mod_range"
                  stroke="none"
                  fill={COLORS.mod}
                  fillOpacity={0.15}
                  tooltipType="none"
                  legendType="none"
                />
                <Line
                  name="归一化调制（AdaLN）"
                  type="monotone"
                  dataKey="mod_mean"
                  stroke={COLORS.mod}
                  strokeWidth={2}
                  dot={{
                    r: 4,
                    fill: COLORS.mod,
                    strokeWidth: 1,
                    stroke: "white",
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartWrapper>
      )}
    </div>
  );
}

function ChartWrapper({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-[#e8e0d5] bg-white shadow-sm transition-all hover:shadow-md">
      <div className="border-b border-[#f0e8dc] bg-[#fdfcfb] px-8 py-4">
        <div className="flex items-baseline justify-between">
          <h3 className="text-xl font-bold text-[#2a211c]">{title}</h3>
          <span className="font-mono text-[10px] uppercase tracking-widest text-[#a89a8b]">
            Figure {id}
          </span>
        </div>
        <p className="mt-1 text-sm leading-7 text-[#665c52]">{description}</p>
      </div>
      <div className="p-6">{children}</div>
    </article>
  );
}

function Heatmap({
  id,
  title,
  data,
  vmax,
  label,
  xAxisLabel,
  yAxisLabel,
}: {
  id: string;
  title: string;
  data: number[][];
  vmax: number;
  label: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
}) {
  const heatmapGrid = (
    <div className="min-w-[400px]">
      <div className="grid grid-cols-[40px_repeat(18,1fr)] gap-px border border-[#f0e8dc] bg-[#f0e8dc]">
        <div className="h-6 bg-[#fdfcfb]"></div>
        {Array.from({ length: 18 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-center bg-[#fdfcfb] text-[11px] font-medium text-[#8a7e72]"
          >
            {i + 1}
          </div>
        ))}
        {data.map((row, stepIdx) => (
          <React.Fragment key={stepIdx}>
            <div className="flex items-center justify-center bg-[#fdfcfb] text-[11px] font-medium text-[#8a7e72]">
              S{stepIdx + 1}
            </div>
            {row.map((val, layerIdx) => (
              <div
                key={layerIdx}
                className="group relative aspect-square"
                style={{ backgroundColor: getHeatmapColor(val, vmax) }}
              >
                <div className="invisible absolute -top-8 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded bg-[#2a211c] px-2 py-1 text-[10px] text-white group-hover:visible">
                  L{layerIdx + 1} S{stepIdx + 1}: {val.toFixed(3)}
                </div>
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>
      {xAxisLabel && (
        <div className="mt-3 pl-10 text-center text-xs font-semibold tracking-normal text-[#665c52]">
          {xAxisLabel}
        </div>
      )}
    </div>
  );

  return (
    <article className="flex flex-col rounded-2xl border border-[#e8e0d5] bg-white p-6 shadow-sm">
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-[#2a211c]">{title}</h4>
          <span className="font-mono text-[9px] text-[#a89a8b]">FIG {id}</span>
        </div>
      </div>
      <div className="relative flex-1 overflow-x-auto">
        <div className={yAxisLabel ? "min-w-[430px]" : "min-w-[400px]"}>
          {yAxisLabel ? (
            <div className="grid grid-cols-[18px_minmax(400px,1fr)] items-center gap-2">
              <div className="flex h-full min-h-40 items-center justify-center">
                <span className="-rotate-90 whitespace-nowrap text-xs font-semibold tracking-normal text-[#665c52]">
                  {yAxisLabel}
                </span>
              </div>
              {heatmapGrid}
            </div>
          ) : (
            heatmapGrid
          )}
          <div className="mt-6 flex items-center justify-center space-x-3 text-[10px] text-[#8a7e72]">
            <span>0.0</span>
            <div
              className="h-2 w-32 rounded-full"
              style={{
                background:
                  "linear-gradient(to right, #fff7ed, #fdba74, #f97316, #c2410c, #7c2d12)",
              }}
            ></div>
            <span>{vmax.toFixed(1)}+</span>
            <span className="ml-4 italic">{label}</span>
          </div>
        </div>
      </div>
    </article>
  );
}

function getHeatmapColor(value: number, vmax: number) {
  const normalized = Math.min(Math.max(value / vmax, 0), 1);
  const colors = [
    { r: 255, g: 247, b: 237 }, // #fff7ed
    { r: 253, g: 186, b: 116 }, // #fdba74
    { r: 249, g: 115, b: 22 }, // #f97316
    { r: 194, g: 65, b: 12 }, // #c2410c
    { r: 124, g: 45, b: 18 }, // #7c2d12
  ];

  const idx = normalized * (colors.length - 1);
  const low = Math.floor(idx);
  const high = Math.ceil(idx);
  const ratio = idx - low;

  const r = Math.round(
    colors[low].r + (colors[high].r - colors[low].r) * ratio,
  );
  const g = Math.round(
    colors[low].g + (colors[high].g - colors[low].g) * ratio,
  );
  const b = Math.round(
    colors[low].b + (colors[high].b - colors[low].b) * ratio,
  );

  return `rgb(${r}, ${g}, ${b})`;
}

function CustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border border-[#d8ccbb] bg-white p-3 shadow-lg">
        <p className="mb-2 border-b border-[#f0e8dc] pb-1 text-xs font-bold text-[#2a211c]">
          第 {label} 层
        </p>
        <div className="space-y-1">
          {payload.map((entry: any, index: number) => {
            if (entry.dataKey && entry.dataKey.includes("range")) return null;
            return (
              <div
                key={index}
                className="flex items-center justify-between gap-4 text-[11px]"
              >
                <span
                  className="flex items-center gap-1.5"
                  style={{ color: entry.color || entry.stroke }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: entry.color || entry.stroke }}
                  ></span>
                  {entry.name}:
                </span>
                <span className="font-mono font-bold text-[#2a211c]">
                  {entry.value.toFixed(4)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  return null;
}
