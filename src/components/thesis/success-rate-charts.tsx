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

type SuccessRateData = {
  name: string;
  value: number;
  isMain?: boolean;
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
    <div className="h-[400px] w-full rounded-xl border border-[#d8ccbb] bg-[#fffaf4] p-4 shadow-sm">
      <h3 className="mb-4 text-center text-base font-semibold text-[#2a211c]">
        {taskName} 成功率 (%)
      </h3>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 5, right: 20, left: 0, bottom: 60 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e6dccb" />
          <XAxis
            dataKey="name"
            angle={-45}
            textAnchor="end"
            interval={0}
            height={60}
            tick={{ fontSize: 10, fill: "#665c52" }}
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
                fill={entry.isMain ? "#2a211c" : color}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Data from Table 3-4 in paper/chapter3.md
// | 方法 | 将勺子放到毛巾上 | 将勺子放到毛巾上 (sic - likely carrot) | 将绿块放到黄块上 | 将茄子放 进黄色篮子里 | 平均成功率 |
// | RT-1-X | 0.0 | 4.2 | 0.0 | 0.0 | 1.1 |
// | Octo-Base | 15.8 | 12.5 | 0.0 | 41.7 | 17.5 |
// | OpenVLA | 4.2 | 0.0 | 0.0 | 12.5 | 4.2 |
// | π₀ | 29.1 | 0.0 | 16.6 | 62.5 | 27.1 |
// | π₀-FAST | 29.1 | 21.9 | 10.8 | 66.6 | 48.3 |
// | SpatialVLA | 16.7 | 25.0 | 29.2 | 100.0 | 42.7 |
// | CogACT | 71.7 | 50.8 | 15.0 | 67.5 | 51.3 |
// | GROOT-N1.5 | 75.3 | 54.3 | 57.0 | 61.3 | 61.9 |
// | 本文 π-GCA | 62.5 | 50.0 | 62.5 | 83.3 | 64.6 |

const MODELS = [
  "RT-1-X",
  "Octo-Base",
  "OpenVLA",
  "π₀",
  "π₀-FAST",
  "SpatialVLA",
  "CogACT",
  "GROOT-N1.5",
  "本文 π-GCA",
];

const spoonData: SuccessRateData[] = [
  { name: "RT-1-X", value: 0.0 },
  { name: "Octo-Base", value: 15.8 },
  { name: "OpenVLA", value: 4.2 },
  { name: "π₀", value: 29.1 },
  { name: "π₀-FAST", value: 29.1 },
  { name: "SpatialVLA", value: 16.7 },
  { name: "CogACT", value: 71.7 },
  { name: "GROOT-N1.5", value: 75.3 },
  { name: "本文 π-GCA", value: 62.5, isMain: true },
];

const carrotData: SuccessRateData[] = [
  { name: "RT-1-X", value: 4.2 },
  { name: "Octo-Base", value: 12.5 },
  { name: "OpenVLA", value: 0.0 },
  { name: "π₀", value: 0.0 },
  { name: "π₀-FAST", value: 21.9 },
  { name: "SpatialVLA", value: 25.0 },
  { name: "CogACT", value: 50.8 },
  { name: "GROOT-N1.5", value: 54.3 },
  { name: "本文 π-GCA", value: 50.0, isMain: true },
];

const stackData: SuccessRateData[] = [
  { name: "RT-1-X", value: 0.0 },
  { name: "Octo-Base", value: 0.0 },
  { name: "OpenVLA", value: 0.0 },
  { name: "π₀", value: 16.6 },
  { name: "π₀-FAST", value: 10.8 },
  { name: "SpatialVLA", value: 29.2 },
  { name: "CogACT", value: 15.0 },
  { name: "GROOT-N1.5", value: 57.0 },
  { name: "本文 π-GCA", value: 62.5, isMain: true },
];

const eggplantData: SuccessRateData[] = [
  { name: "RT-1-X", value: 0.0 },
  { name: "Octo-Base", value: 41.7 },
  { name: "OpenVLA", value: 12.5 },
  { name: "π₀", value: 62.5 },
  { name: "π₀-FAST", value: 66.6 },
  { name: "SpatialVLA", value: 100.0 },
  { name: "CogACT", value: 67.5 },
  { name: "GROOT-N1.5", value: 61.3 },
  { name: "本文 π-GCA", value: 83.3, isMain: true },
];

const avgData: SuccessRateData[] = [
  { name: "RT-1-X", value: 1.1 },
  { name: "Octo-Base", value: 17.5 },
  { name: "OpenVLA", value: 4.2 },
  { name: "π₀", value: 27.1 },
  { name: "π₀-FAST", value: 48.3 },
  { name: "SpatialVLA", value: 42.7 },
  { name: "CogACT", value: 51.3 },
  { name: "GROOT-N1.5", value: 61.9 },
  { name: "本文 π-GCA", value: 64.6, isMain: true },
];

export function SimplerEnvSuccessRateCharts() {
  return (
    <div className="mt-8 space-y-10">
      <div className="grid gap-6 md:grid-cols-2">
        <SuccessRateBarChart taskName="勺子放毛巾" data={spoonData} />
        <SuccessRateBarChart taskName="胡萝卜放盘子" data={carrotData} />
        <SuccessRateBarChart taskName="绿块叠黄块" data={stackData} />
        <SuccessRateBarChart taskName="茄子入黄篮" data={eggplantData} />
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
