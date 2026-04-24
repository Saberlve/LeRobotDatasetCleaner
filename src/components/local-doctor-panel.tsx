"use client";

import React from "react";

import type {
  CrossEpisodeVarianceData,
  EpisodeLengthStats,
} from "@/app/[org]/[dataset]/[episode]/fetch-data";
import { useFlaggedEpisodes } from "@/context/flagged-episodes-context";

function FlagEpisodeButton({ episodeIndex }: { episodeIndex: number }) {
  const { has, toggle } = useFlaggedEpisodes();
  const flagged = has(episodeIndex);

  return (
    <button
      type="button"
      onClick={() => toggle(episodeIndex)}
      className={`rounded border px-2 py-1 text-xs transition-colors ${
        flagged
          ? "border-orange-500/40 bg-orange-500/10 text-orange-300"
          : "border-slate-700 text-slate-300 hover:border-orange-500/40 hover:text-orange-300"
      }`}
    >
      {flagged ? "已标记" : "标记"}
    </button>
  );
}

function DiagnosticTable({
  title,
  emptyText,
  rows,
}: {
  title: string;
  emptyText: string;
  rows: Array<{
    episodeIndex: number;
    value: string;
  }>;
}) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-slate-100">{title}</h3>
        <span className="text-xs text-slate-500">{rows.length} 项</span>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={`${title}:${row.episodeIndex}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-800/80 bg-slate-950/70 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm text-slate-100">ep {row.episodeIndex}</p>
                <p className="text-xs text-slate-400">{row.value}</p>
              </div>
              <FlagEpisodeButton episodeIndex={row.episodeIndex} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function LocalDoctorPanel({
  crossEpisodeData,
  crossEpisodeLoading,
  episodeLengthStats,
  statsLoading,
}: {
  crossEpisodeData: CrossEpisodeVarianceData | null;
  crossEpisodeLoading: boolean;
  episodeLengthStats: EpisodeLengthStats | null;
  statsLoading: boolean;
}) {
  if (crossEpisodeLoading || statsLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-slate-400">
        正在诊断本地数据集…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs text-slate-500">已分析回合</p>
          <p className="mt-1 text-2xl font-semibold text-slate-100">
            {crossEpisodeData?.numEpisodes ?? 0}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs text-slate-500">动作维度</p>
          <p className="mt-1 text-2xl font-semibold text-slate-100">
            {crossEpisodeData?.actionNames.length ?? 0}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs text-slate-500">长度均值</p>
          <p className="mt-1 text-2xl font-semibold text-slate-100">
            {episodeLengthStats
              ? `${episodeLengthStats.meanEpisodeLength.toFixed(2)}s`
              : "--"}
          </p>
        </div>
      </div>

      <DiagnosticTable
        title="低运动回合"
        emptyText="没有可用的低运动诊断结果。"
        rows={
          crossEpisodeData?.lowMovementEpisodes.map((item) => ({
            episodeIndex: item.episodeIndex,
            value: `平均运动量 ${item.totalMovement.toFixed(4)}`,
          })) ?? []
        }
      />

      <DiagnosticTable
        title="抖动较大回合"
        emptyText="没有可用的抖动诊断结果。"
        rows={
          crossEpisodeData?.jerkyEpisodes.slice(0, 10).map((item) => ({
            episodeIndex: item.episodeIndex,
            value: `mean |Δa| ${item.meanAbsDelta.toFixed(4)}`,
          })) ?? []
        }
      />

      <DiagnosticTable
        title="最短回合"
        emptyText="没有可用的回合长度统计。"
        rows={
          episodeLengthStats?.shortestEpisodes.map((item) => ({
            episodeIndex: item.episodeIndex,
            value: `${item.lengthSeconds.toFixed(2)}s · ${item.frames} frames`,
          })) ?? []
        }
      />

      <DiagnosticTable
        title="最长回合"
        emptyText="没有可用的回合长度统计。"
        rows={
          episodeLengthStats?.longestEpisodes.map((item) => ({
            episodeIndex: item.episodeIndex,
            value: `${item.lengthSeconds.toFixed(2)}s · ${item.frames} frames`,
          })) ?? []
        }
      />
    </div>
  );
}
