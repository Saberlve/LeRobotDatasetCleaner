"use client";

import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const ablationData = [
  { name: "勺子->毛巾", full: 62.5, noAgg: 66.7 },
  { name: "胡萝卜->盘子", full: 50.0, noAgg: 58.3 },
  { name: "绿块->黄块", full: 62.5, noAgg: 12.5 },
  { name: "茄子->篮子", full: 83.3, noAgg: 33.3 },
  { name: "Simpler平均", full: 64.6, noAgg: 42.7 },
  { name: "交换方块", full: 20.0, noAgg: 0.8 },
];

export function AblationAggregationChart() {
  return (
    <div className="h-[400px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={ablationData}
          margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
          barGap={8}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#d8ccbb" vertical={false} />
          <XAxis
            dataKey="name"
            stroke="#665c52"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            interval={0}
          />
          <YAxis
            stroke="#665c52"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            domain={[0, 100]}
            tickFormatter={(value) => `${value}%`}
          />
          <Tooltip
            cursor={{ fill: "#efe6d9", opacity: 0.4 }}
            contentStyle={{
              backgroundColor: "#fffaf4",
              border: "1px solid #d8ccbb",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            formatter={(value: number) => [`${value}%`]}
          />
          <Legend
            verticalAlign="top"
            align="right"
            iconType="circle"
            wrapperStyle={{ fontSize: "12px", paddingBottom: "20px" }}
          />
          <Bar
            name="具有聚合模块"
            dataKey="full"
            fill="#2a211c"
            radius={[4, 4, 0, 0]}
            barSize={32}
          />
          <Bar
            name="去除聚合模块"
            dataKey="noAgg"
            fill="#c15f3c"
            radius={[4, 4, 0, 0]}
            barSize={32}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
