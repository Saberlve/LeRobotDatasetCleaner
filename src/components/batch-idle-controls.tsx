"use client";

import React, { useEffect, useRef, useState } from "react";
import { getDatasetVersionAndInfo } from "@/utils/versionUtils";
import { loadIdleProfile } from "@/lib/initial-idle/profile";
import {
  createXarmIdleProfile,
  idleReasonLabels,
} from "@/lib/initial-idle/presets";
import {
  batchStorageKey,
  selectBatchEpisodes,
  runIdleBatch,
  type BatchEntry,
  type BatchMode,
  type IdleEdge,
} from "@/lib/initial-idle/batch";
import type { InitialIdleProfile } from "@/lib/initial-idle/types";
import { useClipDrafts } from "@/context/clip-drafts-context";
import { loadEpisodeSignalFrames } from "@/lib/initial-idle/load";
import {
  normalizeFrameIntervals,
  type EpisodeClipMap,
} from "@/server/dataset-export/clips";

const inputStyle =
  "rounded border border-white/15 bg-[var(--surface-0)] px-2 py-1.5";
function resultPriority(entry: BatchEntry): number {
  if (entry.error) return 2;
  if (entry.result?.candidate) return 0;
  if (entry.result?.status === "needs_review") return 1;
  return 3;
}
export function BatchIdleControls({
  repoId,
  episodes,
  episodeId,
  profiles,
  onReview,
  enabled = false,
}: {
  repoId: string;
  episodes: number[];
  episodeId: number;
  profiles: Partial<Record<IdleEdge, InitialIdleProfile>>;
  onReview: (entry: BatchEntry) => void;
  enabled?: boolean;
}) {
  const { drafts, replaceEpisode } = useClipDrafts();
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const [adding, setAdding] = useState(false);
  const [clipMessage, setClipMessage] = useState("");
  const [undo, setUndo] = useState<{
    before: EpisodeClipMap;
    after: EpisodeClipMap;
  } | null>(null);
  const [start, setStart] = useState(episodeId);
  const [count, setCount] = useState(10);
  const [mode, setMode] = useState<BatchMode>("both");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [results, setResults] = useState<BatchEntry[]>([]);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    try {
      const saved = JSON.parse(
        sessionStorage.getItem(batchStorageKey(repoId)) ?? "[]",
      );
      if (Array.isArray(saved))
        setResults(
          saved.filter(
            (r) =>
              episodes.includes(r.episodeId) &&
              ["start", "end"].includes(r.edge) &&
              r.profile,
          ),
        );
    } catch {
      /* This session can still run without browser storage. */
    }
    return () => abort.current?.abort();
    // This component is keyed by dataset/episode; restore the last completed results.
  }, [repoId, episodes]);
  let selected: number[] = [];
  try {
    selected = selectBatchEpisodes(episodes, start, count);
  } catch {
    /* Show invalid count below. */
  }
  async function run() {
    if (busy || adding || !selected.length) return;
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError("");
    setProgress("正在读取检测参数…");
    const completed: BatchEntry[] = [];
    try {
      const { info } = await getDatasetVersionAndInfo(repoId);
      controller.signal.throwIfAborted();
      const resolve = (edge: IdleEdge) => {
        if (profiles[edge]) return profiles[edge]!;
        try {
          return (
            loadIdleProfile(
              localStorage,
              edge === "end" ? `${repoId}:trailing` : repoId,
              info,
            ) ?? createXarmIdleProfile(info)
          );
        } catch {
          return createXarmIdleProfile(info);
        }
      };
      const settings = { start: resolve("start"), end: resolve("end") };
      setResults([]);
      try {
        sessionStorage.removeItem(batchStorageKey(repoId));
      } catch {
        /* Nonpersistent mode. */
      }
      await runIdleBatch({
        repoId,
        episodes: selected,
        mode,
        profiles: settings,
        schema: info,
        signal: controller.signal,
        onProgress: setProgress,
        onResult(entry) {
          completed.push(entry);
          setResults([...completed]);
          try {
            sessionStorage.setItem(
              batchStorageKey(repoId),
              JSON.stringify(completed),
            );
          } catch {
            setError("浏览器无法保存批量结果；离开页面后需重新检测。");
          }
        },
      });
      setProgress(
        `检测完成：${selected.length} 个 episode，${completed.length} 项结果。`,
      );
    } catch (e) {
      if (controller.signal.aborted)
        setProgress(`已停止，保留 ${completed.length} 项已完成结果。`);
      else setError(e instanceof Error ? e.message : "批量检测失败");
    } finally {
      setBusy(false);
    }
  }
  const candidates = results.filter((r) => r.result?.candidate).length;
  const reviews = results.filter(
    (r) => r.result?.status === "needs_review",
  ).length;
  const failed = results.filter((r) => r.error).length;
  const candidateEntries = results.filter(
    (r) => !r.error && r.result?.status === "candidate" && r.result.candidate,
  );
  const covered = (r: BatchEntry) => {
    const interval = r.result?.candidate?.removedFrames;
    return (
      !!interval &&
      (drafts[r.episodeId] ?? []).some(
        (d) => d.start <= interval.start && d.end >= interval.end,
      )
    );
  };
  const pending = candidateEntries.filter((r) => !covered(r));
  async function addCandidates() {
    if (!enabled || busy || adding || !pending.length) return;
    const controller = new AbortController();
    abort.current = controller;
    setAdding(true);
    setError("");
    setClipMessage("正在核对候选区间…");
    try {
      const counts = new Map<number, number>();
      for (const entry of pending) {
        const rows = await loadEpisodeSignalFrames(
          repoId,
          entry.episodeId,
          entry.profile,
        );
        controller.signal.throwIfAborted();
        const candidate = entry.result!.candidate!;
        const interval = candidate.removedFrames;
        normalizeFrameIntervals([interval], rows.length);
        if (
          rows[candidate.activityFrame]?.timestamp !==
            candidate.activityTimestamp ||
          (entry.edge === "start"
            ? interval.start !== 0
            : interval.end !== rows.length - 1)
        )
          throw new Error(
            `Episode ${entry.episodeId} 的候选与当前轨迹不一致，请重新检测。`,
          );
        counts.set(entry.episodeId, rows.length);
      }
      // Merge against the latest drafts after async reads. Validate every episode
      // before writing any, so conflicts cannot cause a partially applied batch.
      const before: EpisodeClipMap = {},
        after: EpisodeClipMap = {};
      for (const entry of pending) {
        const id = entry.episodeId;
        before[id] ??= (draftsRef.current[id] ?? []).map((r) => ({ ...r }));
        after[id] = normalizeFrameIntervals(
          [
            ...(after[id] ?? before[id]),
            entry.result!.candidate!.removedFrames,
          ],
          counts.get(id)!,
        );
      }
      for (const [id, intervals] of Object.entries(after))
        replaceEpisode(Number(id), intervals);
      setUndo({ before, after });
      setClipMessage(
        `已将 ${pending.length} 项候选加入 ${Object.keys(after).length} 个 episode 的裁剪草稿。到 Filtering 导出后生效，源数据保留。`,
      );
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(e instanceof Error ? e.message : "加入失败");
        setClipMessage("本次未加入任何候选。");
      }
    } finally {
      if (!controller.signal.aborted) setAdding(false);
    }
  }
  function undoCandidates() {
    if (!undo || busy || adding) return;
    if (
      Object.entries(undo.after).some(
        ([id, intervals]) =>
          JSON.stringify(draftsRef.current[Number(id)] ?? []) !==
          JSON.stringify(intervals),
      )
    ) {
      setError(
        "这些 episode 的裁剪草稿已有后续修改，请逐条调整，避免覆盖新修改。",
      );
      return;
    }
    for (const [id, intervals] of Object.entries(undo.before))
      replaceEpisode(Number(id), intervals);
    setUndo(null);
    setError("");
    setClipMessage("已撤销本次批量加入，恢复此前的裁剪草稿。");
  }
  return (
    <section
      aria-label="批量等待检测"
      className="rounded-md border border-cyan-400/20 p-3 mb-3 text-sm space-y-3"
    >
      <h3 className="font-medium text-slate-100">批量等待检测</h3>
      <p className="text-xs text-slate-400">
        使用开头、结尾各自的当前参数（未设置时用试用预设）；本批次开始后参数固定。只生成待复核结果，不自动加入裁剪列表。结尾含各路视频核对，耗时较长。
      </p>
      <fieldset
        disabled={busy || adding}
        className="flex flex-wrap items-end gap-3"
      >
        <label className="grid gap-1">
          起始 episode
          <select
            aria-label="批量起始 episode"
            className={inputStyle}
            value={start}
            onChange={(e) => setStart(Number(e.target.value))}
          >
            {episodes.map((id) => (
              <option key={id} value={id}>
                Episode {id}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          检测数量
          <input
            aria-label="批量检测数量"
            className={`${inputStyle} w-24`}
            type="number"
            min={1}
            step={1}
            value={Number.isNaN(count) ? "" : count}
            onChange={(e) => setCount(e.target.valueAsNumber)}
          />
        </label>
        <label className="grid gap-1">
          检测范围
          <select
            aria-label="批量检测范围"
            className={inputStyle}
            value={mode}
            onChange={(e) => setMode(e.target.value as BatchMode)}
          >
            <option value="both">开头和结尾</option>
            <option value="start">只有开头</option>
            <option value="end">只有结尾</option>
          </select>
        </label>
        <button
          className={inputStyle}
          disabled={!selected.length}
          onClick={() => void run()}
        >
          开始批量检测
        </button>
      </fieldset>
      <p className="text-xs text-slate-400">
        {selected.length
          ? `本次检测 ${selected.length} 个 episode：${selected[0]}–${selected.at(-1)}${selected.length < count ? "（已到数据集末尾）" : ""}。`
          : "检测数量必须为正整数。"}{" "}
        检测期间请停留在当前页面；离开会停止任务，已完成结果在当前浏览器会话内保留。
      </p>
      {busy && (
        <button
          className={inputStyle}
          onClick={() => {
            abort.current?.abort();
            setProgress("正在停止，等待当前读取结束…");
          }}
        >
          停止批量检测
        </button>
      )}
      {progress && (
        <p role="status" aria-live="polite">
          {progress}
        </p>
      )}
      {error && (
        <p role="alert" className="text-amber-300">
          {error}
        </p>
      )}
      {!!results.length && (
        <details open>
          <summary className="cursor-pointer">
            批量结果 {results.length} 项：候选 {candidates}，需复核 {reviews}
            ，失败 {failed}，无候选{" "}
            {results.length - candidates - reviews - failed}
          </summary>
          <div className="flex flex-wrap items-center gap-2 my-3">
            <button
              className={`${inputStyle} text-cyan-300 disabled:opacity-40`}
              disabled={!enabled || busy || adding || !pending.length}
              onClick={() => void addCandidates()}
            >
              {adding
                ? "正在加入候选…"
                : `一键加入全部候选（${pending.length}）`}
            </button>
            {undo && (
              <button
                className={inputStyle}
                disabled={busy || adding}
                onClick={undoCandidates}
              >
                撤销本次批量加入
              </button>
            )}
          </div>
          <p className="text-xs text-slate-400">
            点击即采用当前批量结果的建议边界；仅加入候选，合并已有草稿并去重。
            {!enabled && "此功能仅支持本地 LeRobot v3.0 数据集。"}
          </p>
          {clipMessage && (
            <p role="status" className="text-cyan-300 my-2">
              {clipMessage}
            </p>
          )}
          <div className="max-h-64 overflow-auto mt-2 space-y-1">
            {[...results]
              .sort(
                (a, b) =>
                  resultPriority(a) - resultPriority(b) ||
                  a.episodeId - b.episodeId ||
                  Number(a.edge === "end") - Number(b.edge === "end"),
              )
              .map((r) => (
                <div
                  key={`${r.episodeId}:${r.edge}`}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 py-2"
                >
                  <span>
                    Episode {r.episodeId} ·{" "}
                    {r.edge === "start" ? "开头" : "结尾"}：
                    {r.error
                      ? `失败：${r.error}`
                      : r.result?.candidate
                        ? `候选 ${r.result.candidate.removedTime.duration.toFixed(2)} 秒，第 ${r.result.candidate.removedFrames.start}–${r.result.candidate.removedFrames.end} 帧`
                        : (idleReasonLabels[r.result?.reason ?? ""] ??
                          r.result?.reason)}
                    {r.result?.candidate && covered(r) && (
                      <span className="ml-2 text-cyan-300">已在裁剪列表</span>
                    )}
                  </span>
                  <button
                    disabled={busy || adding}
                    className={`${inputStyle} disabled:opacity-40`}
                    onClick={() => onReview(r)}
                  >
                    查看复核
                  </button>
                </div>
              ))}
          </div>
        </details>
      )}
    </section>
  );
}
