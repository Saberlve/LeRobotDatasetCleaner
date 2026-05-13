"use client";

import React from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import gateData from "./gate-data.json";

type GateDataPoint = (typeof gateData)[number];

export const GATE_GRAD_SMOOTHING = 0.6;

export function smoothGateGradData(
  data: GateDataPoint[],
  smoothing = GATE_GRAD_SMOOTHING,
) {
  let previousContinuous: number | null = null;
  let previousBaseline: number | null = null;

  return data.map((point) => {
    const continuousGrad =
      previousContinuous === null
        ? point.continuous_grad
        : previousContinuous * smoothing +
          point.continuous_grad * (1 - smoothing);
    const baselineGrad =
      previousBaseline === null
        ? point.baseline_grad
        : previousBaseline * smoothing + point.baseline_grad * (1 - smoothing);

    previousContinuous = continuousGrad;
    previousBaseline = baselineGrad;

    return {
      ...point,
      continuous_grad_smoothed: continuousGrad,
      baseline_grad_smoothed: baselineGrad,
    };
  });
}

const smoothedGateGradData = smoothGateGradData(gateData);

export function GateValueChart() {
  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={gateData}
          margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#d8ccbb"
            vertical={false}
          />
          <XAxis
            dataKey="step"
            stroke="#665c52"
            fontSize={11}
            tickFormatter={(val) => `${(val / 1000).toFixed(1)}k`}
            label={{
              value: "训练步数 (Steps)",
              position: "bottom",
              offset: 0,
              fontSize: 11,
            }}
          />
          <YAxis
            stroke="#665c52"
            fontSize={11}
            label={{
              value: "Gate 均值",
              angle: -90,
              position: "insideLeft",
              fontSize: 11,
              offset: 10,
            }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#fffaf4",
              border: "1px solid #d8ccbb",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            labelFormatter={(val) => `Step: ${val}`}
          />
          <Legend
            verticalAlign="top"
            height={36}
            iconType="plainline"
            wrapperStyle={{ fontSize: "12px" }}
          />
          <Line
            name="连续回合采样"
            type="monotone"
            dataKey="continuous_gate"
            stroke="#4C78A8"
            strokeWidth={2}
            dot={false}
          />
          <Line
            name="固定窗口采样"
            type="monotone"
            dataKey="baseline_gate"
            stroke="#C44E52"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GateGradNormChart() {
  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={smoothedGateGradData}
          margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#d8ccbb"
            vertical={false}
          />
          <XAxis
            dataKey="step"
            stroke="#665c52"
            fontSize={11}
            tickFormatter={(val) => `${(val / 1000).toFixed(1)}k`}
            label={{
              value: "训练步数 (Steps)",
              position: "bottom",
              offset: 0,
              fontSize: 11,
            }}
          />
          <YAxis
            stroke="#665c52"
            fontSize={11}
            label={{
              value: "梯度范数 (Grad Norm)",
              angle: -90,
              position: "insideLeft",
              fontSize: 11,
              offset: 10,
            }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#fffaf4",
              border: "1px solid #d8ccbb",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            labelFormatter={(val) => `Step: ${val}`}
          />
          <Legend
            verticalAlign="top"
            height={36}
            iconType="plainline"
            wrapperStyle={{ fontSize: "12px" }}
          />
          <Line
            name="连续回合采样"
            type="monotone"
            dataKey="continuous_grad_smoothed"
            stroke="#4C78A8"
            strokeWidth={2}
            dot={false}
          />
          <Line
            name="固定窗口采样"
            type="monotone"
            dataKey="baseline_grad_smoothed"
            stroke="#C44E52"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
