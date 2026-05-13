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
} from "recharts";
import { FiActivity, FiChevronDown, FiFilter } from "react-icons/fi";

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

type TrainingCurveMetric = {
  id: string;
  label: string;
  color: string;
};

type RunHistory = {
  runId: string;
  history: HistoryPoint[];
};

export const TRAINING_CURVE_METRICS: TrainingCurveMetric[] = [
  { id: "loss", label: "Loss", color: "oklch(0.6 0.15 40)" },
  { id: "learning_rate", label: "LR", color: "oklch(0.5 0.11 245)" },
  { id: "grad_norm", label: "Grad", color: "oklch(0.48 0.1 150)" },
];

const TRAINING_RUN_COLORS = [
  "oklch(0.6 0.15 40)",
  "oklch(0.5 0.11 245)",
  "oklch(0.48 0.1 150)",
  "oklch(0.58 0.13 310)",
  "oklch(0.56 0.12 80)",
  "oklch(0.46 0.1 210)",
];

export function formatSelectedRunsLabel(selectedRuns: WandBRun[]) {
  if (selectedRuns.length === 0) return "选择实验";
  if (selectedRuns.length === 1) {
    const run = selectedRuns[0];
    return `${run.name} (${run.id})`;
  }

  return `已选 ${selectedRuns.length} 个实验`;
}

function findMetricKey(metric: string, points: HistoryPoint[]) {
  const prefixes = ["", "train/", "eval/", "system/", "monitor/"];
  const lowerMetric = metric.toLowerCase();

  for (const point of points) {
    for (const prefix of prefixes) {
      const key = prefix + metric;
      if (point[key] !== undefined) return key;
    }

    const found = Object.keys(point).find((key) => {
      const lowerKey = key.toLowerCase();
      return lowerKey === lowerMetric || lowerKey.endsWith("/" + lowerMetric);
    });

    if (found) return found;
  }

  return metric;
}

export function buildRunComparisonCurveData(
  runHistories: RunHistory[],
  metric: string,
  smoothing: number,
) {
  const pointsByStep = new Map<number, HistoryPoint>();

  for (const { runId, history } of runHistories) {
    const actualKey = findMetricKey(metric, history);
    let lastSmoothedValue: number | undefined;

    for (const point of history) {
      if (typeof point.step !== "number") continue;

      const value = point[actualKey];
      if (value === undefined || value === null || typeof value !== "number")
        continue;

      const smoothedValue =
        lastSmoothedValue === undefined
          ? value
          : lastSmoothedValue * smoothing + value * (1 - smoothing);
      lastSmoothedValue = smoothedValue;

      const chartPoint = pointsByStep.get(point.step) ?? { step: point.step };
      chartPoint[`${runId}_value`] = value;
      chartPoint[`${runId}_smoothed`] = smoothedValue;
      pointsByStep.set(point.step, chartPoint);
    }
  }

  return Array.from(pointsByStep.values()).sort((a, b) => a.step - b.step);
}

export function TrainingCurves() {
  const [runs, setRuns] = useState<WandBRun[]>([]);
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([]);
  const [historiesByRunId, setHistoriesByRunId] = useState<
    Record<string, HistoryPoint[]>
  >({});
  const [loading, setLoading] = useState(false);
  const [runPickerOpen, setRunPickerOpen] = useState(false);
  const [smoothing, setSmoothing] = useState(0.8);
  const [activeMetric, setActiveMetric] = useState<string>("loss");

  useEffect(() => {
    async function fetchRuns() {
      try {
        const response = await fetch("/api/eval-results/wandb");
        const data = await response.json();
        if (data.runs) {
          setRuns(data.runs);
          if (data.runs.length > 0) setSelectedRunIds([data.runs[0].id]);
        }
      } catch (err) {
        console.error("Failed to fetch runs", err);
      }
    }
    fetchRuns();
  }, []);

  useEffect(() => {
    if (selectedRunIds.length === 0) return;
    let ignore = false;

    async function fetchHistories() {
      setLoading(true);
      try {
        const entries = await Promise.all(
          selectedRunIds.map(async (runId) => {
            const response = await fetch(
              `/api/eval-results/wandb?runId=${runId}`,
            );
            const data = await response.json();
            return [runId, data] as const;
          }),
        );

        if (!ignore) setHistoriesByRunId(Object.fromEntries(entries));
      } catch (err) {
        console.error("Failed to fetch history", err);
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    fetchHistories();
    return () => {
      ignore = true;
    };
  }, [selectedRunIds]);

  const smoothedData = useMemo(
    () =>
      buildRunComparisonCurveData(
        selectedRunIds.map((runId) => ({
          runId,
          history: historiesByRunId[runId] ?? [],
        })),
        activeMetric,
        smoothing,
      ),
    [activeMetric, historiesByRunId, selectedRunIds, smoothing],
  );
  const selectedRuns = useMemo(
    () => runs.filter((run) => selectedRunIds.includes(run.id)),
    [runs, selectedRunIds],
  );
  const selectedRunsLabel = formatSelectedRunsLabel(selectedRuns);

  const toggleRun = (runId: string) => {
    setSelectedRunIds((current) => {
      if (current.includes(runId)) {
        return current.length === 1
          ? current
          : current.filter((id) => id !== runId);
      }

      return [...current, runId];
    });
  };

  if (runs.length === 0) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[oklch(0.82_0.035_66)] bg-[oklch(0.985_0.012_76)] text-[oklch(0.41_0.095_42)]">
            <FiActivity className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-[oklch(0.25_0.025_62)]">
              实验训练曲线
            </h3>
            <p className="text-xs text-[oklch(0.43_0.025_68)]">
              从 WandB 同步的实时训练指标
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-xl border border-[oklch(0.84_0.025_72)] bg-[oklch(0.96_0.018_75)] p-1">
            {TRAINING_CURVE_METRICS.map((m) => {
              const isSelected = activeMetric === m.id;

              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setActiveMetric(m.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    isSelected
                      ? "bg-[oklch(0.25_0.025_62)] text-[oklch(0.98_0.012_76)]"
                      : "text-[oklch(0.43_0.025_68)] hover:text-[oklch(0.25_0.025_62)]"
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[oklch(0.84_0.025_72)] bg-[oklch(0.985_0.012_76)] p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-4">
          <div className="relative w-full max-w-xl">
            <button
              type="button"
              aria-expanded={runPickerOpen}
              onClick={() => setRunPickerOpen((open) => !open)}
              className="flex h-11 w-full items-center justify-between gap-3 rounded-xl border border-[oklch(0.84_0.025_72)] bg-[oklch(0.96_0.018_75)] px-3 text-left text-sm font-medium text-[oklch(0.25_0.025_62)] outline-none transition hover:border-[oklch(0.68_0.06_55)]"
            >
              <span className="truncate">{selectedRunsLabel}</span>
              <span className="flex items-center gap-2 text-xs text-[oklch(0.43_0.025_68)]">
                {selectedRunIds.length} / {runs.length}
                <FiChevronDown
                  className={`h-4 w-4 transition ${runPickerOpen ? "rotate-180" : ""}`}
                />
              </span>
            </button>

            {runPickerOpen ? (
              <div className="absolute left-0 right-0 top-12 z-20 max-h-72 overflow-y-auto rounded-xl border border-[oklch(0.84_0.025_72)] bg-[oklch(0.985_0.012_76)] p-2 shadow-[0_18px_45px_rgba(42,33,28,0.12)]">
                {runs.map((run) => {
                  const isSelected = selectedRunIds.includes(run.id);
                  const selectedIndex = selectedRunIds.indexOf(run.id);
                  const color =
                    TRAINING_RUN_COLORS[
                      selectedIndex >= 0
                        ? selectedIndex % TRAINING_RUN_COLORS.length
                        : 0
                    ];

                  return (
                    <button
                      key={run.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => toggleRun(run.id)}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-xs text-[oklch(0.25_0.025_62)] transition hover:bg-[oklch(0.96_0.018_75)]"
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          isSelected
                            ? "border-[oklch(0.56_0.11_42)] bg-[oklch(0.56_0.11_42)]"
                            : "border-[oklch(0.76_0.04_68)] bg-[oklch(0.99_0.01_76)]"
                        }`}
                      >
                        {isSelected ? (
                          <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.98_0.012_76)]" />
                        ) : null}
                      </span>
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{
                          backgroundColor: isSelected
                            ? color
                            : "oklch(0.82 0.025 72)",
                        }}
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {run.name} ({run.id})
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4">
              {selectedRuns.map((run, index) => (
                <div key={run.id} className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{
                      backgroundColor:
                        TRAINING_RUN_COLORS[index % TRAINING_RUN_COLORS.length],
                    }}
                  />
                  <span className="max-w-56 truncate text-xs text-[oklch(0.43_0.025_68)]">
                    {run.name}
                  </span>
                </div>
              ))}
              <span className="text-xs text-[oklch(0.43_0.025_68)]">
                浅线原始 / 实线平滑
              </span>
            </div>

            <div className="flex items-center gap-3">
              <FiFilter className="h-4 w-4 text-[oklch(0.43_0.025_68)]" />
              <span className="text-xs font-medium text-[oklch(0.43_0.025_68)]">
                平滑度: {smoothing.toFixed(2)}
              </span>
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
        </div>

        <div className="h-[400px] w-full">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-[oklch(0.84_0.025_72)] border-t-[oklch(0.25_0.025_62)]" />
                <span className="text-sm text-[oklch(0.43_0.025_68)]">
                  正在加载历史数据...
                </span>
              </div>
            </div>
          ) : smoothedData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={smoothedData}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="oklch(0.9 0.02 72)"
                />
                <XAxis
                  dataKey="step"
                  type="number"
                  tick={{ fontSize: 11, fill: "oklch(0.43 0.025 68)" }}
                  stroke="oklch(0.84 0.025 72)"
                  domain={["auto", "auto"]}
                  label={{
                    value: "Steps",
                    position: "insideBottomRight",
                    offset: -5,
                    fontSize: 11,
                  }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "oklch(0.43 0.025 68)" }}
                  stroke="oklch(0.84 0.025 72)"
                  domain={["auto", "auto"]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "oklch(0.985 0.012 76)",
                    borderRadius: "12px",
                    border: "1px solid oklch(0.84 0.025 72)",
                    fontSize: "12px",
                    boxShadow: "0 10px 25px rgba(0,0,0,0.05)",
                  }}
                  formatter={(value: number, name: string) => [
                    value.toFixed(6),
                    name,
                  ]}
                />
                {selectedRuns.flatMap((run, index) => {
                  const color =
                    TRAINING_RUN_COLORS[index % TRAINING_RUN_COLORS.length];

                  return [
                    <Line
                      key={`${run.id}-raw`}
                      type="monotone"
                      dataKey={`${run.id}_value`}
                      name={`${run.name} 原始`}
                      stroke={color}
                      strokeOpacity={0.2}
                      dot={false}
                      strokeWidth={1}
                      connectNulls
                    />,
                    <Line
                      key={`${run.id}-smoothed`}
                      type="monotone"
                      dataKey={`${run.id}_smoothed`}
                      name={`${run.name} 平滑`}
                      stroke={color}
                      dot={false}
                      strokeWidth={2}
                      animationDuration={500}
                      connectNulls
                    />,
                  ];
                })}
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
