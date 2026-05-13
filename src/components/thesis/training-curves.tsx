"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { FiActivity, FiSettings, FiMaximize2, FiFilter } from "react-icons/fi";

type WandBRun = {
  id: string;
  name: string;
};

type HistoryPoint = {
  step: number;
  loss?: number;
  learning_rate?: number;
  grad_norm?: number;
  [key: string]: any;
};

export function TrainingCurves() {
  const [runs, setRuns] = useState<WandBRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [smoothing, setSmoothing] = useState(0.8);
  const [activeMetric, setActiveMetric] = useState<string>("loss");

  useEffect(() => {
    async function fetchRuns() {
      try {
        const response = await fetch("/api/eval-results/wandb");
        const data = await response.json();
        if (data.runs) {
          setRuns(data.runs);
          if (data.runs.length > 0) setSelectedRunId(data.runs[0].id);
        }
      } catch (err) {
        console.error("Failed to fetch runs", err);
      }
    }
    fetchRuns();
  }, []);

  useEffect(() => {
    if (!selectedRunId) return;
    async function fetchHistory() {
      setLoading(true);
      try {
        const response = await fetch(`/api/eval-results/wandb?runId=${selectedRunId}`);
        const data = await response.json();
        setHistory(data);
      } catch (err) {
        console.error("Failed to fetch history", err);
      } finally {
        setLoading(false);
      }
    }
    fetchHistory();
  }, [selectedRunId]);

  const findMetricKey = (metric: string, point: any) => {
    if (point[metric] !== undefined) return metric;
    // Common WandB prefixes
    const prefixes = ["train/", "eval/", "system/", "monitor/"];
    for (const p of prefixes) {
      if (point[p + metric] !== undefined) return p + metric;
    }
    // Case-insensitive search
    const keys = Object.keys(point);
    const found = keys.find(k => k.toLowerCase() === metric.toLowerCase() || k.toLowerCase().endsWith("/" + metric.toLowerCase()));
    return found || metric;
  };

  const smoothedData = useMemo(() => {
    if (history.length === 0) return [];
    
    // Auto-detect the actual key in the data
    const actualKey = findMetricKey(activeMetric, history[0]);
    
    let lastSmoothedValue: number | null = null;
    return history.map((point) => {
      const value = point[actualKey];
      if (value === undefined || value === null || typeof value !== 'number') return point;

      let smoothedValue = value;
      if (lastSmoothedValue !== null) {
        smoothedValue = lastSmoothedValue * smoothing + value * (1 - smoothing);
      }
      lastSmoothedValue = smoothedValue;

      return {
        ...point,
        display_value: value,
        display_value_smoothed: smoothedValue,
      };
    });
  }, [history, activeMetric, smoothing]);

  if (runs.length === 0) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[oklch(0.82_0.035_66)] bg-[oklch(0.985_0.012_76)] text-[oklch(0.41_0.095_42)]">
            <FiActivity className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-[oklch(0.25_0.025_62)]">实验训练曲线</h3>
            <p className="text-xs text-[oklch(0.43_0.025_68)]">从 WandB 同步的实时训练指标</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedRunId}
            onChange={(e) => setSelectedRunId(e.target.value)}
            className="rounded-xl border border-[oklch(0.84_0.025_72)] bg-[oklch(0.96_0.018_75)] px-3 py-2 text-sm text-[oklch(0.25_0.025_62)] outline-none"
          >
            {runs.map((run) => (
              <option key={run.id} value={run.id}>
                {run.name} ({run.id})
              </option>
            ))}
          </select>

          <div className="flex rounded-xl border border-[oklch(0.84_0.025_72)] bg-[oklch(0.96_0.018_75)] p-1">
            {[
              { id: "loss", label: "Loss" },
              { id: "learning_rate", label: "LR" },
              { id: "grad_norm", label: "Grad" },
              { id: "success", label: "Success" }
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => setActiveMetric(m.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  activeMetric === m.id
                    ? "bg-[oklch(0.25_0.025_62)] text-[oklch(0.98_0.012_76)]"
                    : "text-[oklch(0.43_0.025_68)] hover:text-[oklch(0.25_0.025_62)]"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[oklch(0.84_0.025_72)] bg-[oklch(0.985_0.012_76)] p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
               <div className="h-3 w-3 rounded-full bg-[oklch(0.6_0.15_40_/_0.3)]" />
               <span className="text-xs text-[oklch(0.43_0.025_68)]">原始数据</span>
            </div>
            <div className="flex items-center gap-2">
               <div className="h-3 w-3 rounded-full bg-[oklch(0.6_0.15_40)]" />
               <span className="text-xs text-[oklch(0.43_0.025_68)]">平滑曲线</span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <FiFilter className="h-4 w-4 text-[oklch(0.43_0.025_68)]" />
            <span className="text-xs font-medium text-[oklch(0.43_0.025_68)]">平滑度: {smoothing.toFixed(2)}</span>
            <input
              type="range"
              min="0"
              max="0.99"
              step="0.01"
              value={smoothing}
              onChange={(e) => setSmoothing(parseFloat(e.target.value))}
              className="h-1.5 w-24 accent-[oklch(0.25_0.025_62)]"
            />
          </div>
        </div>

        <div className="h-[400px] w-full">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-[oklch(0.84_0.025_72)] border-t-[oklch(0.25_0.025_62)]" />
                <span className="text-sm text-[oklch(0.43_0.025_68)]">正在加载历史数据...</span>
              </div>
            </div>
          ) : history.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={smoothedData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="oklch(0.9_0.02_72)" />
                <XAxis 
                  dataKey="step" 
                  type="number"
                  tick={{ fontSize: 11, fill: "oklch(0.43_0.025_68)" }}
                  stroke="oklch(0.84_0.025_72)"
                  domain={['auto', 'auto']}
                  label={{ value: 'Steps', position: 'insideBottomRight', offset: -5, fontSize: 11 }}
                />
                <YAxis 
                  tick={{ fontSize: 11, fill: "oklch(0.43_0.025_68)" }}
                  stroke="oklch(0.84_0.025_72)"
                  domain={['auto', 'auto']}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: "oklch(0.985_0.012_76)", 
                    borderRadius: "12px", 
                    border: "1px solid oklch(0.84_0.025_72)",
                    fontSize: "12px",
                    boxShadow: "0 10px 25px rgba(0,0,0,0.05)"
                  }}
                  formatter={(value: number) => [value.toFixed(6), activeMetric]}
                />
                <Line
                  type="monotone"
                  dataKey="display_value"
                  stroke="oklch(0.6_0.15_40)"
                  strokeOpacity={0.2}
                  dot={false}
                  strokeWidth={1}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="display_value_smoothed"
                  stroke="oklch(0.6_0.15_40)"
                  dot={false}
                  strokeWidth={2}
                  animationDuration={500}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[oklch(0.43_0.025_68)]">
              该实验暂无曲线数据 (History is empty)
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
