"use client";

import React, { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useFlaggedEpisodes } from "@/context/flagged-episodes-context";
import type {
  CrossEpisodeVarianceData,
  LowMovementEpisode,
  EpisodeLengthStats,
  EpisodeLengthInfo,
} from "@/app/[org]/[dataset]/[episode]/fetch-data";
import {
  ActionVelocitySection,
  FullscreenWrapper,
} from "@/components/action-insights-panel";

// ─── Shared small components ─────────────────────────────────────

function FlagBtn({ id }: { id: number }) {
  const { has, toggle } = useFlaggedEpisodes();
  const flagged = has(id);
  return (
    <button
      onClick={() => toggle(id)}
      title={flagged ? "Unflag episode" : "Flag for review"}
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
      {label ?? "Flag all"}
    </button>
  );
}

// ─── Lowest-Movement Episodes ────────────────────────────────────

function LowMovementSection({ episodes }: { episodes: LowMovementEpisode[] }) {
  if (episodes.length === 0) return null;
  const maxMovement = Math.max(...episodes.map((e) => e.totalMovement), 1e-10);

  return (
    <div className="bg-slate-800/60 rounded-lg p-5 border border-slate-700 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">最低运动回合</h3>
        <FlagAllBtn ids={episodes.map((e) => e.episodeIndex)} />
      </div>
      <p className="text-xs text-slate-400">
        每帧平均动作变化最小的回合。数值极低可能表示机器人静止不动或该回合录制有误。
      </p>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
      >
        {episodes.map((ep) => (
          <div
            key={ep.episodeIndex}
            className="bg-slate-900/50 rounded-md px-3 py-2 flex items-center gap-3"
          >
            <FlagBtn id={ep.episodeIndex} />
            <span className="text-xs text-slate-300 font-medium shrink-0">
              ep {ep.episodeIndex}
            </span>
            <div className="flex-1 min-w-0">
              <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(2, (ep.totalMovement / maxMovement) * 100)}%`,
                    background:
                      ep.totalMovement / maxMovement < 0.15
                        ? "#ef4444"
                        : ep.totalMovement / maxMovement < 0.4
                          ? "#eab308"
                          : "#22c55e",
                  }}
                />
              </div>
            </div>
            <span className="text-xs text-slate-500 tabular-nums shrink-0">
              {ep.totalMovement.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Episode Length Filter ────────────────────────────────────────

function EpisodeLengthFilter({ episodes }: { episodes: EpisodeLengthInfo[] }) {
  const { addMany } = useFlaggedEpisodes();
  const globalMin = useMemo(
    () => Math.min(...episodes.map((e) => e.lengthSeconds)),
    [episodes],
  );
  const globalMax = useMemo(
    () => Math.max(...episodes.map((e) => e.lengthSeconds)),
    [episodes],
  );

  const [rangeMin, setRangeMin] = useState(globalMin);
  const [rangeMax, setRangeMax] = useState(globalMax);

  const outsideIds = useMemo(
    () =>
      episodes
        .filter((e) => e.lengthSeconds < rangeMin || e.lengthSeconds > rangeMax)
        .map((e) => e.episodeIndex)
        .sort((a, b) => a - b),
    [episodes, rangeMin, rangeMax],
  );

  const rangeChanged = rangeMin > globalMin || rangeMax < globalMax;
  const step =
    Math.max(0.01, Math.round((globalMax - globalMin) * 0.001 * 100) / 100) ||
    0.01;

  return (
    <div className="bg-slate-800/60 rounded-lg p-5 border border-slate-700 space-y-4">
      <h3 className="text-sm font-semibold text-slate-200">回合长度筛选</h3>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="tabular-nums">{rangeMin.toFixed(1)}s</span>
          <span className="tabular-nums">{rangeMax.toFixed(1)}s</span>
        </div>
        <div className="relative h-5">
          <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-1 rounded bg-slate-700" />
          <div
            className="absolute top-1/2 -translate-y-1/2 h-1 rounded bg-orange-500"
            style={{
              left: `${((rangeMin - globalMin) / (globalMax - globalMin || 1)) * 100}%`,
              right: `${100 - ((rangeMax - globalMin) / (globalMax - globalMin || 1)) * 100}%`,
            }}
          />
          <input
            type="range"
            min={globalMin}
            max={globalMax}
            step={step}
            value={rangeMin}
            onChange={(e) =>
              setRangeMin(Math.min(Number(e.target.value), rangeMax))
            }
            className="absolute inset-0 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-orange-500 [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-orange-500 [&::-moz-range-thumb]:cursor-pointer"
          />
          <input
            type="range"
            min={globalMin}
            max={globalMax}
            step={step}
            value={rangeMax}
            onChange={(e) =>
              setRangeMax(Math.max(Number(e.target.value), rangeMin))
            }
            className="absolute inset-0 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-orange-500 [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-orange-500 [&::-moz-range-thumb]:cursor-pointer"
          />
        </div>
      </div>

      {rangeChanged && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">
            {outsideIds.length} 个回合在范围外
          </span>
          {outsideIds.length > 0 && (
            <button
              onClick={() => addMany(outsideIds)}
              className="text-xs bg-orange-500/20 text-orange-400 border border-orange-500/40 rounded px-2 py-1 hover:bg-orange-500/30 transition-colors"
            >
              标记 {outsideIds.length} 个范围外回合
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Filtering Panel ────────────────────────────────────────

interface FilteringPanelProps {
  repoId: string;
  crossEpisodeData: CrossEpisodeVarianceData | null;
  crossEpisodeLoading: boolean;
  episodeLengthStats: EpisodeLengthStats | null;
  flatChartData: Record<string, number>[];
  onViewFlaggedEpisodes?: () => void;
}

type ExportMode = "flagged" | "unflagged";

type FilteringExportState = {
  isLocalRepo: boolean;
  disableForMode: boolean;
  disabled: boolean;
  reason: string | null;
};

export function getFilteringExportState(input: {
  repoId: string;
  mode: ExportMode;
  flaggedCount: number;
  totalEpisodes: number | null;
  outputParentDirectory: string;
  datasetName: string;
  submitting: boolean;
}): FilteringExportState {
  const isLocalRepo = input.repoId.startsWith("local/");
  const disableForMode =
    input.mode === "flagged"
      ? input.flaggedCount === 0
      : input.totalEpisodes != null &&
        input.flaggedCount >= input.totalEpisodes;

  let reason: string | null = null;
  if (!isLocalRepo) {
    reason = "仅本地数据集可导出。";
  } else if (input.mode === "flagged" && input.flaggedCount === 0) {
    reason = "导出已标记数据前，至少标记一个回合。";
  } else if (
    input.mode === "unflagged" &&
    input.totalEpisodes != null &&
    input.flaggedCount >= input.totalEpisodes
  ) {
    reason = "所有回合均已标记，没有未标记子集可导出。";
  } else if (!input.outputParentDirectory.trim()) {
    reason = "导出前请选择输出父目录。";
  } else if (!input.datasetName.trim()) {
    reason = "导出前请输入数据集名称。";
  } else if (/[\\/]/.test(input.datasetName)) {
    reason = "数据集名称不能包含路径分隔符。";
  }

  return {
    isLocalRepo,
    disableForMode,
    disabled:
      !isLocalRepo ||
      disableForMode ||
      !input.outputParentDirectory.trim() ||
      !input.datasetName.trim() ||
      /[\\/]/.test(input.datasetName) ||
      input.submitting,
    reason,
  };
}

function defaultExportAlias(repoId: string, mode: ExportMode): string {
  return `${repoId.replace(/^local\//, "")}_${mode}`;
}

function joinExportPath(parentDirectory: string, datasetName: string): string {
  const parent = parentDirectory.trim().replace(/[\\/]+$/, "");
  return `${parent}/${datasetName.trim()}`;
}

function FlaggedExportCard({
  repoId,
  totalEpisodes,
}: {
  repoId: string;
  totalEpisodes: number | null;
}) {
  const { flagged, count } = useFlaggedEpisodes();
  const flaggedIds = useMemo(
    () => [...flagged].sort((a, b) => a - b),
    [flagged],
  );
  const [mode, setMode] = useState<ExportMode>("flagged");
  const [outputParentDirectory, setOutputParentDirectory] = useState("");
  const [datasetName, setDatasetName] = useState("");
  const [pickingDirectory, setPickingDirectory] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<null | {
    entryRoute: string;
    repoId: string;
    totalEpisodes: number;
    path: string;
  }>(null);

  const exportState = getFilteringExportState({
    repoId,
    mode,
    flaggedCount: count,
    totalEpisodes,
    outputParentDirectory,
    datasetName,
    submitting,
  });

  const aliasPlaceholder = defaultExportAlias(repoId, mode);
  const effectiveDatasetName = datasetName.trim() || aliasPlaceholder;
  const resolvedOutputPath =
    outputParentDirectory.trim() && datasetName.trim()
      ? joinExportPath(outputParentDirectory, datasetName)
      : "";

  const handlePickOutputParent = useCallback(async () => {
    setPickingDirectory(true);
    setError(null);

    try {
      const response = await fetch("/api/local-datasets/pick-directory", {
        method: "POST",
      });
      const payload = (await response.json()) as {
        path?: string | null;
        error?: string;
      };

      if (!response.ok || !payload.path) {
        throw new Error(payload.error ?? "无法选择输出目录");
      }

      setOutputParentDirectory(payload.path);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "无法选择输出目录",
      );
    } finally {
      setPickingDirectory(false);
    }
  }, []);

  const handleExport = useCallback(async () => {
    if (exportState.disabled) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/local-datasets/export", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          repoId,
          flaggedEpisodeIds: flaggedIds,
          mode,
          outputPath: joinExportPath(outputParentDirectory, datasetName),
          alias: datasetName.trim(),
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        entryRoute?: string;
        repoId?: string;
        totalEpisodes?: number;
        path?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Dataset export failed.");
      }

      setResult({
        entryRoute: payload.entryRoute ?? "",
        repoId: payload.repoId ?? "",
        totalEpisodes: payload.totalEpisodes ?? 0,
        path: payload.path ?? "",
      });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Dataset export failed.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    datasetName,
    exportState.disabled,
    flaggedIds,
    mode,
    outputParentDirectory,
    repoId,
  ]);

  return (
    <div className="bg-slate-800/60 rounded-lg p-4 border border-slate-700/60 space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-slate-200">导出数据集</h3>
        <p className="text-xs text-slate-400">
          将已标记或未标记的回合子集导出到新的本地数据集目录，同时保留源数据集。
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs text-slate-400">导出模式</span>
          <select
            aria-label="导出模式"
            value={mode}
            onChange={(event) => setMode(event.target.value as ExportMode)}
            className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-200"
          >
            <option value="flagged">flagged</option>
            <option value="unflagged">unflagged</option>
          </select>
        </label>

        <label className="space-y-1.5">
          <span className="text-xs text-slate-400">数据集名称</span>
          <input
            aria-label="数据集名称"
            value={datasetName}
            onChange={(event) => setDatasetName(event.target.value)}
            placeholder={aliasPlaceholder}
            className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500"
          />
        </label>
      </div>

      <label className="space-y-1.5 block">
        <span className="text-xs text-slate-400">输出父目录</span>
        <div className="flex gap-2">
          <input
            aria-label="输出父目录"
            value={outputParentDirectory}
            readOnly
            placeholder="/tmp"
            className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500"
          />
          <button
            type="button"
            onClick={handlePickOutputParent}
            disabled={pickingDirectory || submitting}
            className="shrink-0 rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:text-slate-500"
          >
            {pickingDirectory ? "选择中..." : "选择目录"}
          </button>
        </div>
      </label>

      {resolvedOutputPath && (
        <div className="rounded-md bg-slate-900/60 px-3 py-2 text-xs text-slate-400">
          将导出到{" "}
          <span className="font-mono text-slate-200">{resolvedOutputPath}</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-slate-400">
          {exportState.reason ??
            `准备导出 ${mode === "flagged" ? "已标记" : "未标记"} 回合为 ${effectiveDatasetName}。`}
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={exportState.disabled}
          className="rounded-md bg-orange-500 px-3 py-2 text-sm font-medium text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          {submitting ? "正在导出..." : "导出数据集"}
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 text-xs text-emerald-200 space-y-2">
          <div>
            已导出 <span className="font-semibold">{result.repoId}</span>，共{" "}
            {result.totalEpisodes} 个回合。
          </div>
          <div className="text-emerald-100/80">{result.path}</div>
          <Link
            href={result.entryRoute}
            className="inline-flex rounded-md bg-emerald-400/20 px-2.5 py-1.5 text-emerald-100 hover:bg-emerald-400/30"
          >
            打开导出结果
          </Link>
        </div>
      )}
    </div>
  );
}

function FlaggedIdsCopyBar({
  repoId,
  onViewEpisodes,
}: {
  repoId: string;
  onViewEpisodes?: () => void;
}) {
  const { flagged, count, clear } = useFlaggedEpisodes();
  const [copied, setCopied] = useState(false);

  const ids = useMemo(() => [...flagged].sort((a, b) => a - b), [flagged]);
  const idStr = ids.join(", ");

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(idStr);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [idStr]);

  if (count === 0) return null;

  return (
    <div className="bg-slate-800/60 rounded-lg p-4 border border-orange-500/30 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-orange-400">
          已标记回合
          <span className="text-xs text-slate-500 ml-2 font-normal">
            ({count})
          </span>
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="text-xs text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1"
            title="复制 ID"
          >
            {copied ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-green-400"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
            复制
          </button>
          <button
            onClick={clear}
            className="text-xs text-slate-500 hover:text-red-400 transition-colors"
          >
            清除
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-300 tabular-nums leading-relaxed max-h-20 overflow-y-auto">
        {idStr}
      </p>
      {onViewEpisodes && (
        <button
          onClick={onViewEpisodes}
          className="w-full text-xs py-1.5 rounded bg-slate-700/80 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors flex items-center justify-center gap-1.5"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
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
          查看已标记回合
        </button>
      )}
      <div className="bg-slate-900/60 rounded-md px-3 py-2 border border-slate-700/60 space-y-2.5">
        <p className="text-xs text-slate-400">
          <a
            href="https://github.com/huggingface/lerobot"
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange-400 underline"
          >
            LeRobot CLI
          </a>{" "}
          — 删除已标记回合：
        </p>
        <pre className="text-xs text-slate-300 bg-slate-950/50 rounded px-2 py-1.5 overflow-x-auto select-all">{`# 删除回合（修改原数据集）\nlerobot-edit-dataset \\\n    --repo_id ${repoId} \\\n    --operation.type delete_episodes \\\n    --operation.episode_indices "[${ids.join(", ")}]"`}</pre>
        <pre className="text-xs text-slate-300 bg-slate-950/50 rounded px-2 py-1.5 overflow-x-auto select-all">{`# 删除回合并保存为新数据集（保留原数据集）\nlerobot-edit-dataset \\\n    --repo_id ${repoId} \\\n    --new_repo_id ${repoId}_filtered \\\n    --operation.type delete_episodes \\\n    --operation.episode_indices "[${ids.join(", ")}]"`}</pre>
      </div>
    </div>
  );
}

function FilteringPanel({
  repoId,
  crossEpisodeData,
  crossEpisodeLoading,
  episodeLengthStats,
  flatChartData,
  onViewFlaggedEpisodes,
}: FilteringPanelProps) {
  const totalEpisodes =
    episodeLengthStats?.allEpisodeLengths?.length ??
    crossEpisodeData?.numEpisodes ??
    null;

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-8">
      <div>
        <h2 className="text-xl font-bold text-slate-100">筛选</h2>
        <p className="text-sm text-slate-400 mt-1">
          识别并标记有问题的回合以便删除。已标记的回合会显示在侧边栏，
          也可以导出为 CLI 命令。
        </p>
      </div>

      <FlaggedIdsCopyBar
        repoId={repoId}
        onViewEpisodes={onViewFlaggedEpisodes}
      />

      <FlaggedExportCard repoId={repoId} totalEpisodes={totalEpisodes} />

      {episodeLengthStats?.allEpisodeLengths && (
        <EpisodeLengthFilter episodes={episodeLengthStats.allEpisodeLengths} />
      )}

      {crossEpisodeLoading && (
        <div className="bg-slate-800/60 rounded-lg p-5 border border-slate-700">
          <div className="flex items-center gap-2 text-slate-400 text-sm py-4 justify-center">
            <svg
              className="animate-spin h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
            >
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
            正在加载跨回合数据…
          </div>
        </div>
      )}

      {crossEpisodeData?.lowMovementEpisodes && (
        <LowMovementSection episodes={crossEpisodeData.lowMovementEpisodes} />
      )}

      <FullscreenWrapper>
        <ActionVelocitySection
          data={flatChartData}
          agg={crossEpisodeData?.aggVelocity}
          numEpisodes={crossEpisodeData?.numEpisodes}
          jerkyEpisodes={crossEpisodeData?.jerkyEpisodes}
        />
      </FullscreenWrapper>
    </div>
  );
}

export default FilteringPanel;
