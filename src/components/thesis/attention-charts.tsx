"use client";

import React from "react";
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

const attentionDistributionData = [
  {
    name: "无记忆基线",
    图像: 64.6,
    语言: 35.4,
    记忆: 0,
  },
  {
    name: "压缩式上下文记忆",
    图像: 6.9,
    语言: 3.8,
    记忆: 89.2,
  },
];

export function AttentionDistributionChart() {
  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={attentionDistributionData}
          layout="vertical"
          margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#d8ccbb" />
          <XAxis type="number" domain={[0, 100]} hide />
          <YAxis
            dataKey="name"
            type="category"
            stroke="#665c52"
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: "transparent" }}
            contentStyle={{
              backgroundColor: "#fffaf4",
              border: "1px solid #d8ccbb",
              borderRadius: "8px",
              fontSize: "12px",
            }}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }} />
          <Bar dataKey="图像" stackId="a" fill="#2a211c" radius={[0, 0, 0, 0]} barSize={40} />
          <Bar dataKey="语言" stackId="a" fill="#7a6f64" />
          <Bar dataKey="记忆" stackId="a" fill="#c15f3c" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const attentionOverTimeData = Array.from({ length: 20 }, (_, i) => {
  const step = i * 7;
  const memoryAttn = 87 + Math.random() * 5;
  const imageAttn = 5 + Math.random() * 4;
  const baselineImageAttn = 64.6 + (Math.random() - 0.5) * 5;
  return {
    step,
    memoryAttn: parseFloat(memoryAttn.toFixed(1)),
    imageAttn: parseFloat(imageAttn.toFixed(1)),
    baselineImageAttn: parseFloat(baselineImageAttn.toFixed(1)),
  };
});

export function AttentionOverTimeChart() {
  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={attentionOverTimeData}
          margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#d8ccbb" vertical={false} />
          <XAxis
            dataKey="step"
            stroke="#665c52"
            fontSize={11}
            label={{ value: "时间步 (Step)", position: "bottom", offset: 0, fontSize: 11 }}
          />
          <YAxis
            stroke="#665c52"
            fontSize={11}
            domain={[0, 100]}
            label={{ value: "注意力权重 (%)", angle: -90, position: "insideLeft", fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#fffaf4",
              border: "1px solid #d8ccbb",
              borderRadius: "8px",
              fontSize: "12px",
            }}
          />
          <Legend verticalAlign="top" height={36} iconType="plainline" wrapperStyle={{ fontSize: "12px" }} />
          <Line
            name="Comp 记忆注意力"
            type="monotone"
            dataKey="memoryAttn"
            stroke="#c15f3c"
            strokeWidth={2}
            dot={false}
          />
          <Line
            name="基线 图像注意力 (参考)"
            type="monotone"
            dataKey="baselineImageAttn"
            stroke="#2a211c"
            strokeWidth={1.5}
            strokeDasharray="5 5"
            dot={false}
          />
          <Line
            name="Comp 图像注意力"
            type="monotone"
            dataKey="imageAttn"
            stroke="#7a6f64"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
