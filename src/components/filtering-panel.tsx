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
        <h3 className="text-sm font-semibold text-slate-200">
          Lowest-Movement Episodes
        </h3>
        <FlagAllBtn ids={episodes.map((e) => e.episodeIndex)} />
      </div>
      <p className="text-xs text-slate-400">
        Episodes with the lowest average action change per frame. Very low
        values may indicate the robot was standing still or the episode was
        recorded incorrectly.
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
      <h3 className="text-sm font-semibold text-slate-200">
        Episode Length Filter
      </h3>

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
            {outsideIds.length} episode{outsideIds.length !== 1 ? "s" : ""}{" "}
            outside range
          </span>
          {outsideIds.length > 0 && (
            <button
              onClick={() => addMany(outsideIds)}
              className="text-xs bg-orange-500/20 text-orange-400 border border-orange-500/40 rounded px-2 py-1 hover:bg-orange-500/30 transition-colors"
            >
              Flag {outsideIds.length} outside range
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
  outputPath: string;
  submitting: boolean;
}): FilteringExportState {
  const isLocalRepo = input.repoId.startsWith("local/");
  const disableForMode =
    input.mode === "flagged"
      ? input.flaggedCount === 0
      : input.totalEpisodes != null && input.flaggedCount >= input.totalEpisodes;

  let reason: string | null = null;
  if (!isLocalRepo) {
    reason = "Only local datasets can be exported.";
  } else if (input.mode === "flagged" && input.flaggedCount === 0) {
    reason = "Flag at least one episode before exporting flagged data.";
  } else if (
    input.mode === "unflagged" &&
    input.totalEpisodes != null &&
    input.flaggedCount >= input.totalEpisodes
  ) {
    reason = "All episodes are flagged, so there is no unflagged subset to export.";
  } else if (!input.outputPath.trim()) {
    reason = "Choose an output directory before exporting.";
  }

  return {
    isLocalRepo,
    disableForMode,
    disabled: !isLocalRepo || disableForMode || !input.outputPath.trim() || input.submitting,
    reason,
  };
}

function defaultExportAlias(repoId: string, mode: ExportMode): string {
  return `${repoId.replace(/^local\//, "")}_${mode}`;
}

function FlaggedExportCard({
  repoId,
  totalEpisodes,
}: {
  repoId: string;
  totalEpisodes: number | null;
}) {
  const { flagged, count } = useFlaggedEpisodes();
  const flaggedIds = useMemo(() => [...flagged].sort((a, b) => a - b), [flagged]);
  const [mode, setMode] = useState<ExportMode>("flagged");
  const [outputPath, setOutputPath] = useState("");
  const [alias, setAlias] = useState("");
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
    outputPath,
    submitting,
  });

  const aliasPlaceholder = defaultExportAlias(repoId, mode);

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
          outputPath,
          alias: alias.trim(),
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
        caughtError instanceof Error ? caughtError.message : "Dataset export failed.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [alias, exportState.disabled, flaggedIds, mode, outputPath, repoId]);

  return (
    <div className="bg-slate-800/60 rounded-lg p-4 border border-slate-700/60 space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-slate-200">Export Dataset</h3>
        <p className="text-xs text-slate-400">
          Export the flagged or unflagged episode subset into a new local
          dataset directory while preserving the source dataset.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs text-slate-400">Export mode</span>
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
          <span className="text-xs text-slate-400">Alias</span>
          <input
            aria-label="导出别名"
            value={alias}
            onChange={(event) => setAlias(event.target.value)}
            placeholder={aliasPlaceholder}
            className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500"
          />
        </label>
      </div>

      <label className="space-y-1.5 block">
        <span className="text-xs text-slate-400">Output directory</span>
        <input
          aria-label="输出目录"
          value={outputPath}
          onChange={(event) => setOutputPath(event.target.value)}
          placeholder="/tmp/demo_unflagged"
          className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500"
        />
      </label>

      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-slate-400">
          {exportState.reason ?? `Ready to export ${mode} episodes.`}
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={exportState.disabled}
          className="rounded-md bg-orange-500 px-3 py-2 text-sm font-medium text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          {submitting ? "Exporting..." : "导出数据集"}
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
            Exported <span className="font-semibold">{result.repoId}</span> with{" "}
            {result.totalEpisodes} episode
            {result.totalEpisodes === 1 ? "" : "s"}.
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
          Flagged Episodes
          <span className="text-xs text-slate-500 ml-2 font-normal">
            ({count})
          </span>
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="text-xs text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1"
            title="Copy IDs"
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
            Copy
          </button>
          <button
            onClick={clear}
            className="text-xs text-slate-500 hover:text-red-400 transition-colors"
          >
            Clear
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
          View flagged episodes
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
          — delete flagged episodes:
        </p>
        <pre className="text-xs text-slate-300 bg-slate-950/50 rounded px-2 py-1.5 overflow-x-auto select-all">{`# Delete episodes (modifies original dataset)\nlerobot-edit-dataset \\\n    --repo_id ${repoId} \\\n    --operation.type delete_episodes \\\n    --operation.episode_indices "[${ids.join(", ")}]"`}</pre>
        <pre className="text-xs text-slate-300 bg-slate-950/50 rounded px-2 py-1.5 overflow-x-auto select-all">{`# Delete episodes and save to a new dataset (preserves original)\nlerobot-edit-dataset \\\n    --repo_id ${repoId} \\\n    --new_repo_id ${repoId}_filtered \\\n    --operation.type delete_episodes \\\n    --operation.episode_indices "[${ids.join(", ")}]"`}</pre>
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
        <h2 className="text-xl font-bold text-slate-100">Filtering</h2>
        <p className="text-sm text-slate-400 mt-1">
          Identify and flag problematic episodes for removal. Flagged episodes
          appear in the sidebar and can be exported as a CLI command.
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
            Loading cross-episode data…
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
