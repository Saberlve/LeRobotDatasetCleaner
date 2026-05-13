"use client";

import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ModelVariant = "baseline" | "pi05" | "main";

type SuccessRateData = {
  name: string;
  value: number;
  isMain?: boolean;
  variant?: ModelVariant;
};

type SuccessRateChartsProps = {
  taskName: string;
  data: SuccessRateData[];
  color?: string;
};

export function SuccessRateBarChart({
  taskName,
  data,
  color = "#c15f3c",
}: SuccessRateChartsProps) {
  return (
    <div className="h-[520px] w-full rounded-xl border border-[#d8ccbb] bg-[#fffaf4] p-4 shadow-sm">
      <h3 className="mb-2 text-center text-base font-semibold text-[#2a211c]">
        {taskName}成功率 (%)
      </h3>
      <div className="mb-6 flex flex-wrap items-center justify-center gap-6 text-xs font-medium text-[#665c52]">
        <span className="flex items-center gap-2">
          <span className="inline-block h-3.5 w-3.5 rounded-sm bg-[#c15f3c]" />
          基线方法
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-3.5 w-3.5 rounded-sm bg-[#5b9bd5]" />
          π₀.5 消融变体
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-3.5 w-3.5 rounded-sm bg-[#2a211c]" />
          本文方法
        </span>
      </div>
      <ResponsiveContainer width="100%" height="80%">
        <BarChart
          data={data}
          margin={{ top: 5, right: 20, left: 0, bottom: 80 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e6dccb" />
          <XAxis
            dataKey="name"
            angle={-45}
            textAnchor="end"
            interval={0}
            height={80}
            tick={{ fontSize: 9, fill: "#665c52" }}
            stroke="#7a6f64"
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: "#665c52" }}
            stroke="#7a6f64"
          />
          <Tooltip
            formatter={(value: number) => [`${value}%`, "成功率"]}
            contentStyle={{
              backgroundColor: "#fffaf4",
              borderRadius: "8px",
              border: "1px solid #d8ccbb",
              fontSize: "12px",
            }}
            cursor={{ fill: "#efe6d9", opacity: 0.4 }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={
                  entry.isMain
                    ? "#2a211c"
                    : entry.variant === "pi05"
                      ? "#5b9bd5"
                      : color
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Data from Table 3-4 in paper/chapter3.md
// SimplerEnv WidowX视觉匹配任务完整成功率（%）
// | RT-1-X | 0.0 | 4.2 | 0.0 | 0.0 | 1.1 |
// | Octo-Base | 15.8 | 12.5 | 0.0 | 41.7 | 17.5 |
// | Octo-Small | 41.7 | 8.2 | 0.0 | 56.7 | 26.7 |
// | OpenVLA | 4.2 | 0.0 | 0.0 | 12.5 | 4.2 |
// | CogACT | 71.7 | 50.8 | 15.0 | 67.5 | 51.3 |
// | SpatialVLA | 16.7 | 25.0 | 29.2 | 100.0 | 42.7 |
// | π₀ | 29.1 | 0.0 | 16.6 | 62.5 | 27.1 |
// | π₀-FAST | 29.1 | 21.9 | 10.8 | 66.6 | 48.3 |
// | π₀.5 | 49.3 | 64.7 | 44.7 | 69.7 | 57.1 |
// | π₀.5-Cache | 33.3 | 33.3 | 12.5 | 45.8 | 31.2 |
// | π₀.5-Comp | 66.7 | 58.3 | 62.5 | 58.3 | 61.5 |
// | π₀.5-Norm | 54.2 | 41.7 | 45.8 | 87.5 | 57.3 |
// | 本文 π₀.5-门控交叉注意力 | 62.5 | 50.0 | 62.5 | 83.3 | 64.6 |

const MODELS = [
  "RT-1-X",
  "Octo-Base",
  "Octo-Small",
  "OpenVLA",
  "CogACT",
  "SpatialVLA",
  "π₀",
  "π₀-FAST",
  "π₀.5",
  "π₀.5-Cache",
  "π₀.5-Comp",
  "π₀.5-Norm",
  "本文 π₀.5-门控交叉注意力",
];

const spoonData: SuccessRateData[] = [
  { name: "RT-1-X", value: 0.0 },
  { name: "Octo-Base", value: 15.8 },
  { name: "Octo-Small", value: 41.7 },
  { name: "OpenVLA", value: 4.2 },
  { name: "CogACT", value: 71.7 },
  { name: "SpatialVLA", value: 16.7 },
  { name: "π₀", value: 29.1 },
  { name: "π₀-FAST", value: 29.1 },
  { name: "π₀.5", value: 49.3 },
  { name: "π₀.5-Cache", value: 33.3, variant: "pi05" },
  { name: "π₀.5-Comp", value: 66.7, variant: "pi05" },
  { name: "π₀.5-Norm", value: 54.2, variant: "pi05" },
  { name: "本文 π₀.5-门控交叉注意力", value: 62.5, isMain: true },
];

const carrotData: SuccessRateData[] = [
  { name: "RT-1-X", value: 4.2 },
  { name: "Octo-Base", value: 12.5 },
  { name: "Octo-Small", value: 8.2 },
  { name: "OpenVLA", value: 0.0 },
  { name: "CogACT", value: 50.8 },
  { name: "SpatialVLA", value: 25.0 },
  { name: "π₀", value: 0.0 },
  { name: "π₀-FAST", value: 21.9 },
  { name: "π₀.5", value: 64.7 },
  { name: "π₀.5-Cache", value: 33.3, variant: "pi05" },
  { name: "π₀.5-Comp", value: 58.3, variant: "pi05" },
  { name: "π₀.5-Norm", value: 41.7, variant: "pi05" },
  { name: "本文 π₀.5-门控交叉注意力", value: 50.0, isMain: true },
];

const stackData: SuccessRateData[] = [
  { name: "RT-1-X", value: 0.0 },
  { name: "Octo-Base", value: 0.0 },
  { name: "Octo-Small", value: 0.0 },
  { name: "OpenVLA", value: 0.0 },
  { name: "CogACT", value: 15.0 },
  { name: "SpatialVLA", value: 29.2 },
  { name: "π₀", value: 16.6 },
  { name: "π₀-FAST", value: 10.8 },
  { name: "π₀.5", value: 44.7 },
  { name: "π₀.5-Cache", value: 12.5, variant: "pi05" },
  { name: "π₀.5-Comp", value: 62.5, variant: "pi05" },
  { name: "π₀.5-Norm", value: 45.8, variant: "pi05" },
  { name: "本文 π₀.5-门控交叉注意力", value: 62.5, isMain: true },
];

const eggplantData: SuccessRateData[] = [
  { name: "RT-1-X", value: 0.0 },
  { name: "Octo-Base", value: 41.7 },
  { name: "Octo-Small", value: 56.7 },
  { name: "OpenVLA", value: 12.5 },
  { name: "CogACT", value: 67.5 },
  { name: "SpatialVLA", value: 100.0 },
  { name: "π₀", value: 62.5 },
  { name: "π₀-FAST", value: 66.6 },
  { name: "π₀.5", value: 69.7 },
  { name: "π₀.5-Cache", value: 45.8, variant: "pi05" },
  { name: "π₀.5-Comp", value: 58.3, variant: "pi05" },
  { name: "π₀.5-Norm", value: 87.5, variant: "pi05" },
  { name: "本文 π₀.5-门控交叉注意力", value: 83.3, isMain: true },
];

const avgData: SuccessRateData[] = [
  { name: "RT-1-X", value: 1.1 },
  { name: "Octo-Base", value: 17.5 },
  { name: "Octo-Small", value: 26.7 },
  { name: "OpenVLA", value: 4.2 },
  { name: "CogACT", value: 51.3 },
  { name: "SpatialVLA", value: 42.7 },
  { name: "π₀", value: 27.1 },
  { name: "π₀-FAST", value: 48.3 },
  { name: "π₀.5", value: 57.1 },
  { name: "π₀.5-Cache", value: 31.2, variant: "pi05" },
  { name: "π₀.5-Comp", value: 61.5, variant: "pi05" },
  { name: "π₀.5-Norm", value: 57.3, variant: "pi05" },
  { name: "本文 π₀.5-门控交叉注意力", value: 64.6, isMain: true },
];

export function SimplerEnvSuccessRateCharts() {
  return (
    <div className="mt-8 space-y-10">
      <div className="grid gap-6 md:grid-cols-2">
        <SuccessRateBarChart taskName="将勺子放到毛巾上" data={spoonData} />
        <SuccessRateBarChart taskName="将胡萝卜放到盘子上" data={carrotData} />
        <SuccessRateBarChart taskName="将绿色方块放到黄色方块上" data={stackData} />
        <SuccessRateBarChart taskName="将茄子放进黄色篮子里" data={eggplantData} />
      </div>
      <div className="mx-auto max-w-4xl">
        <SuccessRateBarChart
          taskName="四任务平均"
          data={avgData}
          color="#8a7565"
        />
      </div>
    </div>
  );
}
