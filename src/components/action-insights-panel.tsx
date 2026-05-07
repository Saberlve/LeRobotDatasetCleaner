"use client";

import React, { useMemo, useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { useFlaggedEpisodes } from "@/context/flagged-episodes-context";
import { CHART_CONFIG } from "@/utils/constants";
import type {
  CrossEpisodeVarianceData,
  AggVelocityStat,
  AggAutocorrelation,
  SpeedDistEntry,
  JerkyEpisode,
  AggAlignment,
} from "@/app/[org]/[dataset]/[episode]/fetch-data";

const FullscreenCtx = React.createContext(false);
const useIsFullscreen = () => React.useContext(FullscreenCtx);

function InfoToggle({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-0.5 rounded-full text-slate-500 hover:text-slate-300 transition-colors shrink-0"
        title="切换说明"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </button>
      {open && <div className="mt-1">{children}</div>}
    </>
  );
}

function FullscreenWrapper({ children }: { children: React.ReactNode }) {
  const [fs, setFs] = useState(false);

  useEffect(() => {
    if (!fs) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFs(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fs]);

  return (
    <div className="relative">
      <button
        onClick={() => setFs((v) => !v)}
        className="absolute top-3 right-3 z-10 p-1.5 rounded bg-slate-700/60 hover:bg-slate-600 text-slate-400 hover:text-slate-200 transition-colors backdrop-blur-sm"
        title={fs ? "退出全屏" : "全屏"}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {fs ? (
            <>
              <polyline points="4 14 10 14 10 20" />
              <polyline points="20 10 14 10 14 4" />
              <line x1="14" y1="10" x2="21" y2="3" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </>
          ) : (
            <>
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </>
          )}
        </svg>
      </button>
      {fs ? (
        <div className="fixed inset-0 z-50 bg-slate-950/95 overflow-auto p-6">
          <button
            onClick={() => setFs(false)}
            className="fixed top-4 right-4 z-50 p-2 rounded bg-slate-700/80 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
            title="退出全屏 (Esc)"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="4 14 10 14 10 20" />
              <polyline points="20 10 14 10 14 4" />
              <line x1="14" y1="10" x2="21" y2="3" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
          <div className="max-w-7xl mx-auto">
            <FullscreenCtx.Provider value={true}>
              {children}
            </FullscreenCtx.Provider>
          </div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

function FlagBtn({ id }: { id: number }) {
  const { has, toggle } = useFlaggedEpisodes();
  const flagged = has(id);
  return (
    <button
      onClick={() => toggle(id)}
      title={flagged ? "取消标记" : "标记待审"}
      className={`p-0.5 rounded transition-colors ${flagged ? "text-orange-400" : "text-slate-600 hover:text-slate-400"}`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill={flagged ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
        <line x1="4" y1="22" x2="4" y2="15" />
      </svg>
    </button>
  );
}

function FlagAllBtn({ ids, label }: { ids: number[]; label?: string }) {
  const { addMany } = useFlaggedEpisodes();
  return (
    <button
      onClick={() => addMany(ids)}
      className="text-xs text-slate-500 hover:text-orange-400 transition-colors flex items-center gap-1"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
        <line x1="4" y1="22" x2="4" y2="15" />
      </svg>
      {label ?? "全部标记"}
    </button>
  );
}
const COLORS = [
  "#f97316",
  "#3b82f6",
  "#22c55e",
  "#ef4444",
  "#a855f7",
  "#eab308",
  "#06b6d4",
  "#ec4899",
  "#14b8a6",
  "#f59e0b",
  "#6366f1",
  "#84cc16",
];

function shortName(key: string): string {
  const parts = key.split(CHART_CONFIG.SERIES_NAME_DELIMITER);
  return parts.length > 1 ? parts[parts.length - 1] : key;
}

function getActionKeys(row: Record<string, number>): string[] {
  return Object.keys(row)
    .filter((k) => k.startsWith("action") && k !== "timestamp")
    .sort();
}

function getStateKeys(row: Record<string, number>): string[] {
  return Object.keys(row)
    .filter(
      (k) =>
        k.includes("state") && k !== "timestamp" && !k.startsWith("action"),
    )
    .sort();
}

// ─── Autocorrelation ─────────────────────────────────────────────

function computeAutocorrelation(values: number[], maxLag: number): number[] {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const centered = values.map((v) => v - mean);
  const variance = centered.reduce((a, v) => a + v * v, 0);
  if (variance === 0) return Array(maxLag).fill(0);

  const result: number[] = [];
  for (let lag = 1; lag <= maxLag; lag++) {
    let sum = 0;
    for (let t = 0; t < n - lag; t++) sum += centered[t] * centered[t + lag];
    result.push(sum / variance);
  }
  return result;
}

function findDecorrelationLag(acf: number[], threshold = 0.5): number | null {
  const idx = acf.findIndex((v) => v < threshold);
  return idx >= 0 ? idx + 1 : null;
}

function AutocorrelationSection({
  data,
  fps,
  agg,
  numEpisodes,
}: {
  data: Record<string, number>[];
  fps: number;
  agg?: AggAutocorrelation | null;
  numEpisodes?: number;
}) {
  const isFs = useIsFullscreen();
  const actionKeys = useMemo(
    () => (data.length > 0 ? getActionKeys(data[0]) : []),
    [data],
  );
  const maxLag = useMemo(
    () => Math.min(Math.floor(data.length / 2), 100),
    [data],
  );

  const fallback = useMemo(() => {
    if (agg) return null;
    if (actionKeys.length === 0 || maxLag < 2)
      return { chartData: [], suggestedChunk: null, shortKeys: [] as string[] };

    const acfs = actionKeys.map((key) => {
      const values = data.map((row) => row[key] ?? 0);
      return computeAutocorrelation(values, maxLag);
    });

    const rows = Array.from({ length: maxLag }, (_, lag) => {
      const row: Record<string, number> = {
        lag: lag + 1,
        time: (lag + 1) / fps,
      };
      actionKeys.forEach((key, ki) => {
        row[shortName(key)] = acfs[ki][lag];
      });
      return row;
    });

    const lags = acfs
      .map((acf) => findDecorrelationLag(acf, 0.5))
      .filter(Boolean) as number[];
    const suggested =
      lags.length > 0
        ? lags.sort((a, b) => a - b)[Math.floor(lags.length / 2)]
        : null;

    return {
      chartData: rows,
      suggestedChunk: suggested,
      shortKeys: actionKeys.map(shortName),
    };
  }, [data, actionKeys, maxLag, fps, agg]);

  const { chartData, suggestedChunk, shortKeys } = agg ??
    fallback ?? { chartData: [], suggestedChunk: null, shortKeys: [] };
  const isAgg = !!agg;
  const numEpisodesLabel = isAgg
    ? ` (${numEpisodes} 个回合已采样)`
    : " (当前回合)";

  const yDomain = useMemo(() => {
    if (chartData.length === 0 || shortKeys.length === 0)
      return [-0.2, 1] as [number, number];
    let min = Infinity;
    for (const row of chartData)
      for (const k of shortKeys) {
        const v = row[k];
        if (typeof v === "number" && v < min) min = v;
      }
    const lo = Math.floor(Math.min(min, 0) * 10) / 10;
    return [lo, 1] as [number, number];
  }, [chartData, shortKeys]);

  if (shortKeys.length === 0)
    return <p className="text-slate-500 italic">未找到动作列。</p>;

  return (
    <div className="bg-slate-800/60 rounded-lg p-5 border border-slate-700 space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-200">
            动作自相关
            <span className="text-xs text-slate-500 ml-2 font-normal">
              {numEpisodesLabel}
            </span>
          </h3>
          <InfoToggle>
            <p className="text-xs text-slate-400">
              展示每个动作维度在递增时间滞后下与自身的相关性。自相关降至 0.5
              以下的位置提示了一个{" "}
              <span className="text-orange-400 font-medium">
                自然的动作块边界
              </span>{" "}
              — 超过该滞后的动作基本相互独立，因此开环执行带来的收益递减。
              <br />
              <span className="text-slate-500">
                理论基础：块长度应随系统稳定性常数对数缩放（
                <a
                  href="https://arxiv.org/abs/2507.09061"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-slate-300"
                >
                  Zhang et al., 2025
                </a>
                ，定理 1）。
              </span>
            </p>
          </InfoToggle>
        </div>
      </div>

      {suggestedChunk && (
        <div className="flex items-center gap-3 bg-orange-500/10 border border-orange-500/30 rounded-md px-4 py-2.5">
          <span className="text-orange-400 font-bold text-lg tabular-nums">
            {suggestedChunk}
          </span>
          <div>
            <p className="text-sm text-orange-300 font-medium">
              建议块长度: {suggestedChunk} 步 (
              {(suggestedChunk / fps).toFixed(2)}秒)
            </p>
            <p className="text-xs text-slate-400">
              各动作维度自相关降至 0.5 以下的中位数滞后
            </p>
          </div>
        </div>
      )}

      <div className={isFs ? "h-[500px]" : "h-64"}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            key={isAgg ? "agg" : "ep"}
            data={chartData}
            margin={{ top: 8, right: 16, left: 0, bottom: 16 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              dataKey="lag"
              stroke="#94a3b8"
              label={{
                value: "滞后 (步)",
                position: "insideBottom",
                offset: -8,
                fill: "#94a3b8",
                fontSize: 13,
              }}
            />
            <YAxis
              stroke="#94a3b8"
              domain={yDomain}
              tickFormatter={(v) => Number(v.toFixed(2)).toString()}
            />
            <Tooltip
              contentStyle={{
                background: "#1e293b",
                border: "1px solid #475569",
                borderRadius: 6,
              }}
              labelFormatter={(v) =>
                `滞后 ${v} (${(Number(v) / fps).toFixed(2)}s)`
              }
              formatter={(v: number) => v.toFixed(3)}
            />
            <Line
              dataKey={() => 0.5}
              stroke="#64748b"
              strokeDasharray="6 4"
              dot={false}
              name="0.5 阈值"
              legendType="none"
              isAnimationActive={false}
            />
            {shortKeys.map((name, i) => (
              <Line
                key={name}
                dataKey={name}
                stroke={COLORS[i % COLORS.length]}
                dot={false}
                strokeWidth={1.5}
                legendType="none"
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Custom legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-1">
        {shortKeys.map((name, i) => (
          <div key={name} className="flex items-center gap-1.5">
            <span
              className="w-3 h-[3px] rounded-full shrink-0"
              style={{ background: COLORS[i % COLORS.length] }}
            />
            <span className="text-xs text-slate-400">{name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Action Velocity ─────────────────────────────────────────────

function ActionVelocitySection({
  data,
  agg,
  numEpisodes,
  jerkyEpisodes,
}: {
  data: Record<string, number>[];
  agg?: AggVelocityStat[];
  numEpisodes?: number;
  jerkyEpisodes?: JerkyEpisode[];
}) {
  const actionKeys = useMemo(
    () => (data.length > 0 ? getActionKeys(data[0]) : []),
    [data],
  );

  const fallbackStats = useMemo(() => {
    if (agg && agg.length > 0) return null;
    if (actionKeys.length === 0 || data.length < 2) return [];

    const ACTIVITY_THRESHOLD = 0.001; // 0.1% of motor range
    const DISCRETE_THRESHOLD = 4; // ≤ this many unique values → discrete
    return actionKeys.map((key) => {
      const values = data.map((row) => row[key] ?? 0);
      const motorMin = Math.min(...values);
      const motorMax = Math.max(...values);
      const motorRange = motorMax - motorMin || 1;
      const uniqueVals = new Set(values);
      const nUnique = uniqueVals.size;
      const discrete = nUnique <= DISCRETE_THRESHOLD;
      const deltas = values.slice(1).map((v, i) => v - values[i]);
      if (deltas.length === 0)
        return {
          name: shortName(key),
          std: 0,
          maxAbs: 0,
          bins: new Array(30).fill(0),
          lo: 0,
          hi: 0,
          motorRange,
          discrete,
        };

      // Activity score: p95 of |Δa|
      const absDeltas = deltas.map(Math.abs).sort((a, b) => a - b);
      const p95 = absDeltas[Math.floor(absDeltas.length * 0.95)];
      const inactive = p95 < motorRange * ACTIVITY_THRESHOLD;

      const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
      const rawStd = Math.sqrt(
        deltas.reduce((a, d) => a + (d - mean) ** 2, 0) / deltas.length,
      );
      const std = rawStd / motorRange;
      const maxAbsRaw = Math.max(...absDeltas);
      const maxAbs = maxAbsRaw / motorRange;

      const binCount = 30;
      const lo = Math.min(...deltas) / motorRange;
      const hi = Math.max(...deltas) / motorRange;
      const range = hi - lo || 1;
      const binW = range / binCount;
      const bins: number[] = new Array(binCount).fill(0);
      for (const d of deltas) {
        const normD = d / motorRange;
        let b = Math.floor((normD - lo) / binW);
        if (b >= binCount) b = binCount - 1;
        bins[b]++;
      }
      return {
        name: shortName(key),
        std,
        maxAbs,
        bins,
        lo,
        hi,
        motorRange,
        inactive,
        discrete,
      };
    });
  }, [data, actionKeys, agg]);

  const stats = useMemo(
    () => (agg && agg.length > 0 ? agg : (fallbackStats ?? [])),
    [agg, fallbackStats],
  );
  const isAgg = agg && agg.length > 0;

  const maxBinCount = useMemo(
    () => (stats.length > 0 ? Math.max(...stats.flatMap((s) => s.bins)) : 0),
    [stats],
  );
  const maxStd = useMemo(() => {
    const active = stats.filter((s) => !s.inactive && !s.discrete);
    return active.length > 0 ? Math.max(...active.map((s) => s.std)) : 1;
  }, [stats]);

  const insight = useMemo(() => {
    if (stats.length === 0) return null;
    const active = stats.filter((s) => !s.inactive && !s.discrete);
    const excluded = stats.filter((s) => s.inactive || s.discrete);
    const smooth = active.filter((s) => s.std / maxStd < 0.4);
    const moderate = active.filter(
      (s) => s.std / maxStd >= 0.4 && s.std / maxStd < 0.7,
    );
    const jerky = active.filter((s) => s.std / maxStd >= 0.7);
    const isGripper = (n: string) => /grip/i.test(n);
    const jerkyNonGripper = jerky.filter((s) => !isGripper(s.name));
    const jerkyGripper = jerky.filter((s) => isGripper(s.name));

    let verdict: { label: string; color: string };
    if (active.length === 0) {
      verdict = { label: "N/A", color: "text-zinc-400" };
    } else {
      const smoothRatio = smooth.length / active.length;
      if (smoothRatio >= 0.6 && jerkyNonGripper.length === 0)
        verdict = { label: "平滑", color: "text-green-400" };
      else if (jerkyNonGripper.length <= 2 && smoothRatio >= 0.3)
        verdict = { label: "中等", color: "text-yellow-400" };
      else verdict = { label: "抖动", color: "text-red-400" };
    }

    const lines: string[] = [];
    if (smooth.length > 0)
      lines.push(
        `${smooth.length} 平滑 (${smooth.map((s) => s.name).join(", ")})`,
      );
    if (moderate.length > 0)
      lines.push(
        `${moderate.length} 中等 (${moderate.map((s) => s.name).join(", ")})`,
      );
    if (jerkyNonGripper.length > 0)
      lines.push(
        `${jerkyNonGripper.length} 抖动 (${jerkyNonGripper.map((s) => s.name).join(", ")})`,
      );
    if (jerkyGripper.length > 0)
      lines.push(`${jerkyGripper.length} 夹爪抖动 — 二值开合动作的正常现象`);
    if (excluded.length > 0) {
      const discreteOnly = excluded.filter((s) => s.discrete);
      const inactiveOnly = excluded.filter((s) => s.inactive && !s.discrete);
      const parts: string[] = [];
      if (discreteOnly.length > 0)
        parts.push(
          `${discreteOnly.length} 离散 (${discreteOnly.map((s) => s.name).join(", ")})`,
        );
      if (inactiveOnly.length > 0)
        parts.push(
          `${inactiveOnly.length} 静止 (${inactiveOnly.map((s) => s.name).join(", ")})`,
        );
      lines.push(`${parts.join("; ")} — 不计入判定`);
    }

    let tip: string;
    if (verdict.label === "N/A")
      tip = "所有电机均为静止或离散类型 — 无可评估电机。";
    else if (verdict.label === "平滑")
      tip = "动作一致性良好 — 适合使用较长的动作块。";
    else if (verdict.label === "中等")
      tip = "部分维度存在突变。建议使用中等长度的动作块。";
    else tip = "多个维度抖动明显。建议使用更短的动作块，并考虑过滤异常回合。";

    return { verdict, lines, tip };
  }, [stats, maxStd]);

  if (stats.length === 0)
    return (
      <p className="text-slate-500 italic">没有可用于速度分析的动作数据。</p>
    );

  return (
    <div className="bg-slate-800/60 rounded-lg p-5 border border-slate-700 space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-200">
            动作速度 (Δa) — 平滑度代理
            <span className="text-xs text-slate-500 ml-2 font-normal">
              {isAgg ? `(${numEpisodes} 个回合已采样)` : "(当前回合)"}
            </span>
          </h3>
          <InfoToggle>
            <p className="text-xs text-slate-400">
              展示逐帧动作变化 (Δa = a<sub>t+1</sub> − a<sub>t</sub>)
              在每个维度上的分布。{" "}
              <span className="text-green-400">集中在零附近的紧分布</span>{" "}
              意味着平滑、可预测的控制 — 系统可能稳定，适合使用较长的动作块。
              <span className="text-red-400"> 厚尾或高标准差</span>{" "}
              表示抖动较大的演示，建议使用更短的动作块，并考虑加入噪声注入。
              <br />
              <span className="text-slate-500">
                与 Lipschitz 常数 L<sub>π</sub> 和平滑度 C<sub>π</sub> 相关，见{" "}
                <a
                  href="https://arxiv.org/abs/2507.09061"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-slate-300"
                >
                  Zhang et al. (2025)
                </a>
                ，控制复合误差边界（假设 3.1、4.1）。
              </span>
            </p>
          </InfoToggle>
        </div>
      </div>

      {/* Per-dimension mini histograms + stats */}
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}
      >
        {stats.map((s, si) => {
          const barH = 28;
          const dimmed = !!s.inactive || !!s.discrete;
          const tag =
            s.inactive && s.discrete
              ? "inactive & discrete"
              : s.discrete
                ? "离散"
                : s.inactive
                  ? "静止"
                  : null;
          return (
            <div
              key={s.name}
              className={`rounded-md px-2.5 py-2 space-y-1 ${dimmed ? "bg-slate-900/30 opacity-50" : "bg-slate-900/50"}`}
            >
              <p
                className={`text-xs font-medium truncate ${dimmed ? "text-slate-500" : "text-slate-200"}`}
                title={s.name}
              >
                {s.name}
                {tag && (
                  <span className="text-slate-600 ml-1 font-normal">
                    ({tag})
                  </span>
                )}
              </p>
              <div
                className={`flex gap-2 text-xs tabular-nums ${dimmed ? "text-slate-600" : "text-slate-400"}`}
              >
                <span>σ={s.std.toFixed(4)}</span>
                <span>
                  |Δ|<sub>max</sub>={s.maxAbs.toFixed(4)}
                </span>
              </div>
              <svg
                width="100%"
                viewBox={`0 0 ${s.bins.length} ${barH}`}
                preserveAspectRatio="none"
                className="h-7 rounded"
                aria-label={`Δa distribution for ${s.name}`}
              >
                {[...s.bins].map((count, bi) => {
                  const h = maxBinCount > 0 ? (count / maxBinCount) * barH : 0;
                  return (
                    <rect
                      key={bi}
                      x={bi}
                      y={barH - h}
                      width={0.85}
                      height={h}
                      fill={dimmed ? "#475569" : COLORS[si % COLORS.length]}
                      opacity={dimmed ? 0.4 : 0.7}
                    />
                  );
                })}
              </svg>
              <div className="h-1 w-full bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, (s.std / maxStd) * 100)}%`,
                    background: dimmed
                      ? "#475569"
                      : s.std / maxStd < 0.4
                        ? "#22c55e"
                        : s.std / maxStd < 0.7
                          ? "#eab308"
                          : "#ef4444",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {insight && (
        <div className="bg-slate-900/60 rounded-md px-4 py-3 border border-slate-700/60 space-y-1.5">
          <p className="text-sm font-medium text-slate-200">
            总体:{""}
            <span className={insight.verdict.color}>
              {insight.verdict.label}
            </span>
          </p>
          <ul className="text-xs text-slate-400 space-y-0.5 list-disc list-inside">
            {insight.lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
          <p className="text-xs text-slate-500 pt-1">{insight.tip}</p>
        </div>
      )}

      {jerkyEpisodes && jerkyEpisodes.length > 0 && (
        <JerkyEpisodesList episodes={jerkyEpisodes} />
      )}
    </div>
  );
}

function JerkyEpisodesList({ episodes }: { episodes: JerkyEpisode[] }) {
  const [showAll, setShowAll] = useState(false);
  const display = showAll ? episodes : episodes.slice(0, 15);

  return (
    <div className="bg-slate-900/60 rounded-md px-4 py-3 border border-slate-700/60 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-200">
          抖动最大的回合{" "}
          <span className="text-xs text-slate-500 font-normal">
            按平均 |Δa| 排序
          </span>
        </p>
        <div className="flex items-center gap-3">
          <FlagAllBtn ids={display.map((e) => e.episodeIndex)} />
          {episodes.length > 15 && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              {showAll ? "显示前 15" : `显示全部 ${episodes.length}`}
            </button>
          )}
        </div>
      </div>
      <div className="max-h-48 overflow-y-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 border-b border-slate-700">
              <th className="w-5 py-1" />
              <th className="text-left py-1 pr-3">回合</th>
              <th className="text-right py-1">平均 |Δa|</th>
            </tr>
          </thead>
          <tbody>
            {display.map((e) => (
              <tr
                key={e.episodeIndex}
                className="border-b border-slate-800/40 text-slate-300"
              >
                <td className="py-1">
                  <FlagBtn id={e.episodeIndex} />
                </td>
                <td className="py-1 pr-3">ep {e.episodeIndex}</td>
                <td className="py-1 text-right tabular-nums">
                  {e.meanAbsDelta.toFixed(4)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Cross-Episode Variance Heatmap ──────────────────────────────

function VarianceHeatmap({
  data,
  loading,
}: {
  data: CrossEpisodeVarianceData | null;
  loading: boolean;
}) {
  const isFs = useIsFullscreen();

  if (loading) {
    return (
      <div className="bg-slate-800/60 rounded-lg p-5 border border-slate-700">
        <h3 className="text-sm font-semibold text-slate-200 mb-2">
          跨回合动作方差
        </h3>
        <div className="flex items-center gap-2 text-slate-400 text-sm py-8 justify-center">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          正在加载跨回合数据（最多采样 500 个回合）…
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-slate-800/60 rounded-lg p-5 border border-slate-700">
        <h3 className="text-sm font-semibold text-slate-200 mb-2">
          跨回合动作方差
        </h3>
        <p className="text-slate-500 italic text-sm">
          回合数不足或没有动作数据来计算方差。
        </p>
      </div>
    );
  }
  const { actionNames, timeBins, variance, numEpisodes } = data;
  const numDims = actionNames.length;
  const numBins = timeBins.length;

  const maxVar = Math.max(...variance.flat(), 1e-10);

  const baseW = isFs ? 1000 : 560;
  const baseH = isFs ? 500 : 300;
  const cellW = Math.max(
    6,
    Math.min(isFs ? 24 : 14, Math.floor(baseW / numBins)),
  );
  const cellH = Math.max(
    20,
    Math.min(isFs ? 56 : 36, Math.floor(baseH / numDims)),
  );
  const labelW = 100;
  const svgW = labelW + numBins * cellW + 60;
  const svgH = numDims * cellH + 40;

  function varColor(v: number): string {
    const t = Math.sqrt(v / maxVar); // sqrt for better visual spread
    // Dark blue → teal → orange
    const r = Math.round(t * 249);
    const g = Math.round(t < 0.5 ? 80 + t * 200 : 180 - (t - 0.5) * 200);
    const b = Math.round((1 - t) * 200 + 30);
    return `rgb(${r},${g},${b})`;
  }

  return (
    <div className="bg-slate-800/60 rounded-lg p-5 border border-slate-700 space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-200">
            跨回合动作方差
            <span className="text-xs text-slate-500 ml-2 font-normal">
              ({numEpisodes} episodes sampled)
            </span>
          </h3>
          <InfoToggle>
            <p className="text-xs text-slate-400">
              展示每个动作维度在回合进程中各时间点的变化量（归一化 0–100%）。
              <span className="text-orange-400"> 高方差区域</span>{" "}
              表示多模态或不一致的演示 —
              生成式策略（扩散、流匹配）和动作分块通过建模多模态来帮助解决此问题。
              <span className="text-blue-400"> 低方差区域</span>{" "}
              表示各演示之间行为一致。
              <br />
              <span className="text-slate-500">
                与 &quot;覆盖率&quot; 讨论相关，见{" "}
                <a
                  href="https://arxiv.org/abs/2507.09061"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-slate-300"
                >
                  Zhang et al. (2025)
                </a>{" "}
                — 低方差区域可能缺乏防止复合误差所需的探索性覆盖（第 4 节）。
              </span>
            </p>
          </InfoToggle>
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg width={svgW} height={svgH} className="block">
          {/* Heatmap cells */}
          {variance.map((row, bi) =>
            row.map((v, di) => (
              <rect
                key={`${bi}-${di}`}
                x={labelW + bi * cellW}
                y={di * cellH}
                width={cellW}
                height={cellH}
                fill={varColor(v)}
                stroke="#1e293b"
                strokeWidth={0.5}
              >
                <title>{`${shortName(actionNames[di])} @ ${(timeBins[bi] * 100).toFixed(0)}%: var=${v.toFixed(5)}`}</title>
              </rect>
            )),
          )}

          {/* Y-axis: action names */}
          {actionNames.map((name, di) => (
            <text
              key={di}
              x={labelW - 4}
              y={di * cellH + cellH / 2}
              textAnchor="end"
              dominantBaseline="central"
              className="fill-slate-400"
              fontSize={Math.min(11, cellH - 4)}
            >
              {shortName(name)}
            </text>
          ))}

          {/* X-axis labels */}
          {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
            const binIdx = Math.round(frac * (numBins - 1));
            return (
              <text
                key={frac}
                x={labelW + binIdx * cellW + cellW / 2}
                y={numDims * cellH + 14}
                textAnchor="middle"
                className="fill-slate-400"
                fontSize={9}
              >
                {(frac * 100).toFixed(0)}%
              </text>
            );
          })}
          <text
            x={labelW + (numBins * cellW) / 2}
            y={numDims * cellH + 30}
            textAnchor="middle"
            className="fill-slate-500"
            fontSize={10}
          >
            回合进度
          </text>

          {/* Color bar */}
          {Array.from({ length: 10 }, (_, i) => {
            const t = i / 9;
            const barX = labelW + numBins * cellW + 16;
            const barH = (numDims * cellH) / 10;
            return (
              <rect
                key={i}
                x={barX}
                y={(9 - i) * barH}
                width={12}
                height={barH}
                fill={varColor(t * maxVar)}
              />
            );
          })}
          <text
            x={labelW + numBins * cellW + 34}
            y={10}
            className="fill-slate-500"
            fontSize={8}
            dominantBaseline="central"
          >
            高
          </text>
          <text
            x={labelW + numBins * cellW + 34}
            y={numDims * cellH - 4}
            className="fill-slate-500"
            fontSize={8}
            dominantBaseline="central"
          >
            低
          </text>
        </svg>
      </div>
    </div>
  );
}

// ─── Demonstrator Speed Variance ────────────────────────────────

function SpeedVarianceSection({
  distribution,
  numEpisodes,
}: {
  distribution: SpeedDistEntry[];
  numEpisodes: number;
}) {
  const isFs = useIsFullscreen();
  const { speeds, mean, std, cv, median, bins, lo, binW, maxBin, verdict } =
    useMemo(() => {
      const sp = distribution.map((d) => d.speed).sort((a, b) => a - b);
      const m = sp.reduce((a, b) => a + b, 0) / sp.length;
      const s = Math.sqrt(sp.reduce((a, v) => a + (v - m) ** 2, 0) / sp.length);
      const c = m > 0 ? s / m : 0;
      const med = sp[Math.floor(sp.length / 2)];

      const binCount = Math.min(30, Math.ceil(Math.sqrt(sp.length)));
      const lo = sp[0],
        hi = sp[sp.length - 1];
      const bw = (hi - lo || 1) / binCount;
      const b = new Array(binCount).fill(0);
      for (const v of sp) {
        let i = Math.floor((v - lo) / bw);
        if (i >= binCount) i = binCount - 1;
        b[i]++;
      }

      let v: { label: string; color: string; tip: string };
      if (c < 0.2)
        v = {
          label: "一致",
          color: "text-green-400",
          tip: "演示者执行速度相似 — 无需速度归一化。",
        };
      else if (c < 0.4)
        v = {
          label: "中等方差",
          color: "text-yellow-400",
          tip: "演示者之间存在一定速度差异。建议考虑速度归一化以获得最佳效果。",
        };
      else
        v = {
          label: "高方差",
          color: "text-red-400",
          tip: "演示之间速度差异较大。强烈建议在训练前进行速度归一化。",
        };

      return {
        speeds: sp,
        mean: m,
        std: s,
        cv: c,
        median: med,
        bins: b,
        lo,
        binW: bw,
        maxBin: Math.max(...b),
        verdict: v,
      };
    }, [distribution]);

  if (speeds.length < 3) return null;

  const barH = isFs ? 250 : 100;
  const barW = Math.max(8, Math.floor((isFs ? 900 : 500) / bins.length));

  return (
    <div className="bg-slate-800/60 rounded-lg p-5 border border-slate-700 space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-200">
            演示者速度方差
            <span className="text-xs text-slate-500 ml-2 font-normal">
              ({numEpisodes} episodes)
            </span>
          </h3>
          <InfoToggle>
            <p className="text-xs text-slate-400">
              所有回合的平均执行速度分布（每帧 mean ‖Δa<sub>t</sub>
              ‖）。不同人类演示者往往以{" "}
              <span className="text-orange-400">不同速度</span>
              执行，在动作分布中造成人为的多模态，使策略困惑。变异系数 (CV) 超过
              0.3 强烈建议在训练前对轨迹速度进行归一化。
              <br />
              <span className="text-slate-500">
                基于 &quot;Is Diversity All You Need&quot; (AGI-Bot, 2025)
                的研究，速度归一化显著提高了微调成功率。
              </span>
            </p>
          </InfoToggle>
        </div>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 overflow-x-auto">
          <svg width={bins.length * barW} height={barH + 24} className="block">
            {bins.map((count: number, i: number) => {
              const h = maxBin > 0 ? (count / maxBin) * barH : 0;
              const speed = lo + (i + 0.5) * binW;
              const ratio = median > 0 ? speed / median : 1;
              const dev = Math.abs(ratio - 1);
              const color =
                dev < 0.2 ? "#22c55e" : dev < 0.5 ? "#eab308" : "#ef4444";
              return (
                <rect
                  key={i}
                  x={i * barW}
                  y={barH - h}
                  width={barW - 1}
                  height={Math.max(1, h)}
                  fill={color}
                  opacity={0.7}
                  rx={1}
                >
                  <title>{`Speed ${(lo + i * binW).toFixed(3)}–${(lo + (i + 1) * binW).toFixed(3)}: ${count} ep (${ratio.toFixed(2)}× median)`}</title>
                </rect>
              );
            })}
            {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
              const idx = Math.round(frac * (bins.length - 1));
              return (
                <text
                  key={frac}
                  x={idx * barW + barW / 2}
                  y={barH + 14}
                  textAnchor="middle"
                  className="fill-slate-400"
                  fontSize={9}
                >
                  {(lo + idx * binW).toFixed(2)}
                </text>
              );
            })}
          </svg>
        </div>
        <div className="flex flex-col gap-2 text-xs shrink-0 min-w-[120px]">
          <div>
            <span className="text-slate-500">均值</span>{" "}
            <span className="text-slate-200 tabular-nums ml-1">
              {mean.toFixed(4)}
            </span>
          </div>
          <div>
            <span className="text-slate-500">中位数</span>{" "}
            <span className="text-slate-200 tabular-nums ml-1">
              {median.toFixed(4)}
            </span>
          </div>
          <div>
            <span className="text-slate-500">标准差</span>{" "}
            <span className="text-slate-200 tabular-nums ml-1">
              {std.toFixed(4)}
            </span>
          </div>
          <div>
            <span className="text-slate-500">CV</span>
            <span className={`tabular-nums ml-1 font-bold ${verdict.color}`}>
              {cv.toFixed(3)}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-slate-900/60 rounded-md px-4 py-3 border border-slate-700/60 space-y-1.5">
        <p className="text-sm font-medium text-slate-200">
          Verdict: <span className={verdict.color}>{verdict.label}</span>
        </p>
        <p className="text-xs text-slate-400">{verdict.tip}</p>
      </div>
    </div>
  );
}

// ─── State–Action Temporal Alignment ────────────────────────────

const EXPECTED_LEROBOT_ACTION_STATE_LAG = 1;

export function getStateActionAlignmentInterpretation({
  meanPeakLag,
  fps,
  lagRangeMin,
  lagRangeMax,
}: {
  meanPeakLag: number;
  fps: number;
  lagRangeMin: number;
  lagRangeMax: number;
}): {
  extraLag: number;
  tone: "ok" | "warn";
  title: string;
  detail: string;
} {
  const extraLag = meanPeakLag - EXPECTED_LEROBOT_ACTION_STATE_LAG;
  const rangeDetail =
    lagRangeMin !== lagRangeMax
      ? ` 各维度峰值范围：${lagRangeMin} 到 ${lagRangeMax} 原始滞后步。`
      : "";

  if (extraLag === 0) {
    return {
      extraLag,
      tone: "ok",
      title: "符合预期的单步动作/状态偏移",
      detail:
        `峰值滞后 1 符合 LeRobot 约定：state[t] 在 action[t] 之前被观测，action[t] 目标为 state[t+1] 的过渡。额外延迟：0 帧。` +
        rangeDetail,
    };
  }

  if (extraLag > 0) {
    return {
      extraLag,
      tone: "warn",
      title: `额外控制延迟：${extraLag} 步 (${(extraLag / fps).toFixed(3)}秒)`,
      detail:
        `状态变化比预期 LeRobot 单步偏移晚了约 ${extraLag} 帧。如非日志约定导致，可考虑将 action[t] 与 state[t+${meanPeakLag}] 对齐。` +
        rangeDetail,
    };
  }

  return {
    extraLag,
    tone: "warn",
    title: `早于预期的响应：${Math.abs(extraLag)} 步 (${(Math.abs(extraLag) / fps).toFixed(3)}秒)`,
    detail:
      `峰值滞后 ${meanPeakLag} 早于预期的 LeRobot 单步偏移。这通常表示预测性动作、命名不匹配或不同的数据集约定。` +
      rangeDetail,
  };
}

function StateActionAlignmentSection({
  data,
  fps,
  agg,
  numEpisodes,
}: {
  data: Record<string, number>[];
  fps: number;
  agg?: AggAlignment | null;
  numEpisodes?: number;
}) {
  const isFs = useIsFullscreen();
  const result = useMemo(() => {
    if (agg) return { ...agg, fromAgg: true };
    if (data.length < 10) return null;
    const actionKeys = getActionKeys(data[0]);
    const stateKeys = getStateKeys(data[0]);
    if (actionKeys.length === 0 || stateKeys.length === 0) return null;
    const maxLag = Math.min(Math.floor(data.length / 4), 30);
    if (maxLag < 2) return null;

    // Match action↔state by suffix, fall back to index matching
    const pairs: [string, string][] = [];
    for (const aKey of actionKeys) {
      const match = stateKeys.find(
        (sKey) => shortName(sKey) === shortName(aKey),
      );
      if (match) pairs.push([aKey, match]);
    }
    if (pairs.length === 0) {
      const count = Math.min(actionKeys.length, stateKeys.length);
      for (let i = 0; i < count; i++) pairs.push([actionKeys[i], stateKeys[i]]);
    }
    if (pairs.length === 0) return null;

    // Per-pair cross-correlation (Δaction vs Δstate)
    const pairCorrs: number[][] = [];
    for (const [aKey, sKey] of pairs) {
      const aDeltas = data
        .slice(1)
        .map((row, i) => (row[aKey] ?? 0) - (data[i][aKey] ?? 0));
      const sDeltas = data
        .slice(1)
        .map((row, i) => (row[sKey] ?? 0) - (data[i][sKey] ?? 0));
      const n = Math.min(aDeltas.length, sDeltas.length);
      if (n < 4) {
        pairCorrs.push(Array(2 * maxLag + 1).fill(0));
        continue;
      }
      const aM = aDeltas.slice(0, n).reduce((a, b) => a + b, 0) / n;
      const sM = sDeltas.slice(0, n).reduce((a, b) => a + b, 0) / n;

      const corrs: number[] = [];
      for (let lag = -maxLag; lag <= maxLag; lag++) {
        let sum = 0,
          aV = 0,
          sV = 0;
        for (let t = 0; t < n; t++) {
          const sIdx = t + lag;
          if (sIdx < 0 || sIdx >= n) continue;
          const a = aDeltas[t] - aM,
            s = sDeltas[sIdx] - sM;
          sum += a * s;
          aV += a * a;
          sV += s * s;
        }
        const d = Math.sqrt(aV * sV);
        corrs.push(d > 0 ? sum / d : 0);
      }
      pairCorrs.push(corrs);
    }

    // Aggregate min/mean/max per lag
    const ccData = Array.from({ length: 2 * maxLag + 1 }, (_, li) => {
      const lag = -maxLag + li;
      const vals = pairCorrs.map((pc) => pc[li]);
      return {
        lag,
        time: lag / fps,
        max: Math.max(...vals),
        mean: vals.reduce((a, b) => a + b, 0) / vals.length,
        min: Math.min(...vals),
      };
    });

    // Peaks of the envelope curves
    let meanPeakLag = 0,
      meanPeakCorr = -Infinity;
    let maxPeakLag = 0,
      maxPeakCorr = -Infinity;
    let minPeakLag = 0,
      minPeakCorr = -Infinity;
    for (const row of ccData) {
      if (row.max > maxPeakCorr) {
        maxPeakCorr = row.max;
        maxPeakLag = row.lag;
      }
      if (row.mean > meanPeakCorr) {
        meanPeakCorr = row.mean;
        meanPeakLag = row.lag;
      }
      if (row.min > minPeakCorr) {
        minPeakCorr = row.min;
        minPeakLag = row.lag;
      }
    }

    // Per-pair individual peak lags (for showing the true range across dimensions)
    const perPairPeakLags = pairCorrs.map((pc) => {
      let best = -Infinity,
        bestLag = 0;
      for (let li = 0; li < pc.length; li++) {
        if (pc[li] > best) {
          best = pc[li];
          bestLag = -maxLag + li;
        }
      }
      return bestLag;
    });
    const lagRangeMin = Math.min(...perPairPeakLags);
    const lagRangeMax = Math.max(...perPairPeakLags);

    return {
      ccData,
      meanPeakLag,
      meanPeakCorr,
      maxPeakLag,
      maxPeakCorr,
      minPeakLag,
      minPeakCorr,
      lagRangeMin,
      lagRangeMax,
      numPairs: pairs.length,
      fromAgg: false,
    };
  }, [data, fps, agg]);

  if (!result) return null;
  const {
    ccData,
    meanPeakLag,
    meanPeakCorr,
    maxPeakLag,
    maxPeakCorr,
    minPeakLag,
    minPeakCorr,
    lagRangeMin,
    lagRangeMax,
    numPairs,
    fromAgg,
  } = result;
  const scopeLabel = fromAgg
    ? `${numEpisodes} episodes sampled`
    : "current episode";
  const alignment = getStateActionAlignmentInterpretation({
    meanPeakLag,
    fps,
    lagRangeMin,
    lagRangeMax,
  });

  return (
    <div className="bg-slate-800/60 rounded-lg p-5 border border-slate-700 space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-200">
            State–Action Temporal Alignment
            <span className="text-xs text-slate-500 ml-2 font-normal">
              ({scopeLabel}, {numPairs} matched pair{numPairs !== 1 ? "s" : ""})
            </span>
          </h3>
          <InfoToggle>
            <p className="text-xs text-slate-400">
              Δaction<sub>d</sub>(t) 与 Δstate<sub>d</sub>(t+lag)
              的逐维度互相关， 聚合为所有匹配动作-状态对的
              <span className="text-orange-400"> 最大</span>、
              <span className="text-slate-200">均值</span> 和
              <span className="text-blue-400"> 最小</span>。{" "}
              <span className="text-orange-400">峰值滞后</span>{" "}
              揭示了动作变化与状态变化之间的原始偏移。在 LeRobot 数据集中，滞后
              1 通常是预期的，因为 state[t] 在 action[t] 之前被观测，而
              action[t] 目标是 state[t+1]。
              <br />
              <span className="text-slate-500">
                核心相关研究：ACT (
                <a
                  href="https://arxiv.org/abs/2304.13705"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-slate-300"
                >
                  Zhao et al., 2023
                </a>{" "}
                — 动作分块补偿延迟)、Real-Time Chunking (RTC,{" "}
                <a
                  href="https://arxiv.org/abs/2506.07339"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-slate-300"
                >
                  Black et al., 2025
                </a>
                ) 和 Training-Time RTC (
                <a
                  href="https://arxiv.org/abs/2512.05964"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-slate-300"
                >
                  Black et al., 2025
                </a>
                ) — 均解决指令动作与观测状态变化之间的时间不匹配问题。
              </span>
            </p>
          </InfoToggle>
        </div>
      </div>

      <div
        className={`flex items-center gap-3 rounded-md px-4 py-2.5 ${
          alignment.tone === "ok"
            ? "bg-emerald-500/10 border border-emerald-500/30"
            : "bg-orange-500/10 border border-orange-500/30"
        }`}
      >
        <span
          className={`font-bold text-lg tabular-nums ${
            alignment.tone === "ok" ? "text-emerald-400" : "text-orange-400"
          }`}
        >
          {alignment.extraLag}
        </span>
        <div>
          <p
            className={`text-sm font-medium ${
              alignment.tone === "ok" ? "text-emerald-300" : "text-orange-300"
            }`}
          >
            {alignment.title}
          </p>
          <p className="text-xs text-slate-400">
            {alignment.detail} Raw mean peak lag: {meanPeakLag} step
            {Math.abs(meanPeakLag) !== 1 ? "s" : ""} (
            {(meanPeakLag / fps).toFixed(3)}s).
          </p>
        </div>
      </div>

      <div className={isFs ? "h-[500px]" : "h-56"}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={ccData}
            margin={{ top: 8, right: 16, left: 0, bottom: 16 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              dataKey="lag"
              stroke="#94a3b8"
              label={{
                value: "滞后 (步)",
                position: "insideBottom",
                offset: -8,
                fill: "#94a3b8",
                fontSize: 13,
              }}
            />
            <YAxis
              stroke="#94a3b8"
              domain={[-0.5, 1]}
              tickFormatter={(v) => Number(v.toFixed(2)).toString()}
            />
            <Tooltip
              contentStyle={{
                background: "#1e293b",
                border: "1px solid #475569",
                borderRadius: 6,
              }}
              labelFormatter={(v) =>
                `Lag ${v} (${(Number(v) / fps).toFixed(3)}s)`
              }
              formatter={(v: number) => v.toFixed(3)}
            />
            <Line
              dataKey="max"
              stroke="#f97316"
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
              name="最大"
            />
            <Line
              dataKey="mean"
              stroke="#94a3b8"
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
              name="均值"
            />
            <Line
              dataKey="min"
              stroke="#3b82f6"
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
              name="最小"
            />
            <Line
              dataKey={() => 0}
              stroke="#64748b"
              strokeDasharray="6 4"
              dot={false}
              name="零线"
              legendType="none"
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 px-1">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-[3px] rounded-full shrink-0 bg-orange-500" />
          <span className="text-xs text-slate-400">
            最大 (峰值: 滞后 {maxPeakLag}, r={maxPeakCorr.toFixed(3)})
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-[3px] rounded-full shrink-0 bg-slate-400" />
          <span className="text-xs text-slate-400">
            均值 (峰值: 滞后 {meanPeakLag}, r={meanPeakCorr.toFixed(3)})
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-[3px] rounded-full shrink-0 bg-blue-500" />
          <span className="text-xs text-slate-400">
            最小 (峰值: 滞后 {minPeakLag}, r={minPeakCorr.toFixed(3)})
          </span>
        </div>
      </div>

      {meanPeakLag === 0 && (
        <p className="text-xs text-green-400">
          均值峰值相关在滞后 0 处 (r={meanPeakCorr.toFixed(3)}) —
          此回合中动作与状态变化对齐良好。
        </p>
      )}
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────────────

interface ActionInsightsPanelProps {
  flatChartData: Record<string, number>[];
  fps: number;
  crossEpisodeData: CrossEpisodeVarianceData | null;
  crossEpisodeLoading: boolean;
}

function ActionInsightsPanel({
  flatChartData,
  fps,
  crossEpisodeData,
  crossEpisodeLoading,
}: ActionInsightsPanelProps) {
  const [mode, setMode] = useState<"episode" | "dataset">("dataset");
  const showAgg = mode === "dataset" && !!crossEpisodeData;

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100">动作洞察</h2>
          <p className="text-sm text-slate-400 mt-1">
            数据驱动的分析，用于指导动作分块、数据质量评估和训练配置。
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span
            className={`text-sm ${mode === "episode" ? "text-slate-100 font-medium" : "text-slate-500"}`}
          >
            当前回合
          </span>
          <button
            onClick={() =>
              setMode((m) => (m === "episode" ? "dataset" : "episode"))
            }
            className={`relative inline-flex items-center w-9 h-5 rounded-full transition-colors shrink-0 ${mode === "dataset" ? "bg-orange-500" : "bg-slate-600"}`}
            aria-label="切换回合/数据集范围"
          >
            <span
              className={`inline-block w-3.5 h-3.5 bg-white rounded-full transition-transform ${mode === "dataset" ? "translate-x-[18px]" : "translate-x-[3px]"}`}
            />
          </button>
          <span
            className={`text-sm ${mode === "dataset" ? "text-slate-100 font-medium" : "text-slate-500"}`}
          >
            全部回合
            {crossEpisodeData ? ` (${crossEpisodeData.numEpisodes})` : ""}
          </span>
        </div>
      </div>

      <FullscreenWrapper>
        <AutocorrelationSection
          data={flatChartData}
          fps={fps}
          agg={showAgg ? crossEpisodeData?.aggAutocorrelation : null}
          numEpisodes={crossEpisodeData?.numEpisodes}
        />
      </FullscreenWrapper>
      <FullscreenWrapper>
        <StateActionAlignmentSection
          data={flatChartData}
          fps={fps}
          agg={showAgg ? crossEpisodeData?.aggAlignment : null}
          numEpisodes={crossEpisodeData?.numEpisodes}
        />
      </FullscreenWrapper>

      {crossEpisodeData?.speedDistribution &&
        crossEpisodeData.speedDistribution.length > 2 && (
          <FullscreenWrapper>
            <SpeedVarianceSection
              distribution={crossEpisodeData.speedDistribution}
              numEpisodes={crossEpisodeData.numEpisodes}
            />
          </FullscreenWrapper>
        )}
      <FullscreenWrapper>
        <VarianceHeatmap
          data={crossEpisodeData}
          loading={crossEpisodeLoading}
        />
      </FullscreenWrapper>
    </div>
  );
}

export default ActionInsightsPanel;
export { ActionVelocitySection, FullscreenWrapper };
