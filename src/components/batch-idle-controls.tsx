"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  saveBatchResults,
  useBatchResults,
} from "@/lib/initial-idle/use-batch-results";
import { getDatasetVersionAndInfo } from "@/utils/versionUtils";
import { loadIdleProfile } from "@/lib/initial-idle/profile";
import { createXarmIdleProfile } from "@/lib/initial-idle/presets";
import {
  batchStorageKey,
  mergeBatchResults,
  selectBatchEpisodes,
  runIdleBatch,
  type BatchEntry,
  type BatchMode,
  type IdleEdge,
} from "@/lib/initial-idle/batch";
import type { InitialIdleProfile } from "@/lib/initial-idle/types";

const inputStyle =
  "rounded border border-white/15 bg-[var(--surface-0)] px-2 py-1.5";
export function BatchIdleControls({
  repoId,
  episodes,
  episodeId,
  profiles,
}: {
  repoId: string;
  episodes: number[];
  episodeId: number;
  profiles: Partial<Record<IdleEdge, InitialIdleProfile>>;
}) {
  const [start, setStart] = useState(episodeId);
  const [count, setCount] = useState(10);
  const [mode, setMode] = useState<BatchMode>("both");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const results = useBatchResults(repoId);
  const resultsRef = useRef(results);
  resultsRef.current = results;
  const abort = useRef<AbortController | null>(null);
  const startStorageKey = `lerobot-idle-batch-start:${repoId}`;
  const optionsStorageKey = `lerobot-idle-batch-options:${repoId}`;
  useEffect(() => {
    try {
      const saved = JSON.parse(
        sessionStorage.getItem(optionsStorageKey) ?? "null",
      );
      setCount(
        Number.isSafeInteger(saved?.count) && saved.count > 0
          ? saved.count
          : 10,
      );
      setMode(
        ["start", "end", "both"].includes(saved?.mode) ? saved.mode : "both",
      );
    } catch {
      setCount(10);
      setMode("both");
    }
  }, [optionsStorageKey]);
  function rememberOptions(nextCount: number, nextMode: BatchMode) {
    setCount(nextCount);
    setMode(nextMode);
    try {
      sessionStorage.setItem(
        optionsStorageKey,
        JSON.stringify({ count: nextCount, mode: nextMode }),
      );
    } catch {
      /* Current settings remain usable without storage. */
    }
  }
  useEffect(() => {
    try {
      const savedStart = sessionStorage.getItem(startStorageKey);
      if (savedStart !== null && episodes.includes(Number(savedStart))) {
        setStart(Number(savedStart));
        return;
      }
      // Older sessions have results but no saved batch start yet.
      const savedResults = JSON.parse(
        sessionStorage.getItem(batchStorageKey(repoId)) ?? "[]",
      );
      const ids = Array.isArray(savedResults)
        ? savedResults
            .filter((entry) => entry && episodes.includes(entry.episodeId))
            .map((entry) => entry.episodeId as number)
        : [];
      setStart(ids.length ? Math.min(...ids) : episodeId);
    } catch {
      setStart(episodeId);
    }
  }, [repoId, startStorageKey, episodes, episodeId]);
  function rememberStart(value: number) {
    setStart(value);
    try {
      sessionStorage.setItem(startStorageKey, String(value));
    } catch {
      /* The current page remains usable without browser storage. */
    }
  }
  useEffect(() => () => abort.current?.abort(), [repoId]);
  let selected: number[] = [];
  try {
    selected = selectBatchEpisodes(episodes, start, count);
  } catch {
    /* Show invalid count below. */
  }
  async function run() {
    if (busy || !selected.length) return;
    rememberStart(start);
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
          const merged = mergeBatchResults(resultsRef.current, [entry]);
          resultsRef.current = merged;
          if (!saveBatchResults(repoId, merged)) {
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
  return (
    <section
      aria-label="批量等待检测"
      className="rounded-md border border-cyan-400/20 p-3 mb-3 text-sm space-y-3"
    >
      <h3 className="font-medium text-slate-100">批量等待检测</h3>
      <p className="text-xs text-slate-400">
        使用开头、结尾各自的当前参数（未设置时用试用预设）；本批次开始后参数固定。只生成待复核结果，不自动加入裁剪列表。结尾含各路视频核对，耗时较长。
      </p>
      <fieldset disabled={busy} className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1">
          起始 episode
          <select
            aria-label="批量起始 episode"
            className={inputStyle}
            value={start}
            onChange={(e) => rememberStart(Number(e.target.value))}
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
            onChange={(e) => rememberOptions(e.target.valueAsNumber, mode)}
          />
        </label>
        <label className="grid gap-1">
          检测范围
          <select
            aria-label="批量检测范围"
            className={inputStyle}
            value={mode}
            onChange={(e) =>
              rememberOptions(count, e.target.value as BatchMode)
            }
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
            累计检测结果 {results.length} 项：候选 {candidates}，需复核{" "}
            {reviews}
            ，失败 {failed}，无候选{" "}
            {results.length - candidates - reviews - failed}
          </summary>
          <p className="text-xs text-slate-400 mt-2">
            打开对应 episode，预览并逐条确认后加入裁剪草稿。
          </p>
        </details>
      )}
    </section>
  );
}
