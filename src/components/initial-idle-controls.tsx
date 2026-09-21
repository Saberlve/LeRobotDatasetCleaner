"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BatchIdleControls } from "./batch-idle-controls";
import {
  batchSelectionKey,
  batchStorageKey,
  type BatchEntry,
  type IdleEdge,
} from "@/lib/initial-idle/batch";
import type { VideoInfo } from "@/types";
import {
  detectTrailingIdle,
  DEFAULT_TAIL_VISUAL,
} from "@/lib/initial-idle/trailing";
import { createTailVideoSampler } from "@/lib/initial-idle/tail-video";
import { IdleReviewPlayer, type IdlePlayerHandle } from "./idle-review-player";
import {
  readDecision,
  reviewStorageKey,
  type ReviewDecision,
} from "@/lib/initial-idle/review";
import { useTime } from "@/context/time-context";
import { useClipDrafts } from "@/context/clip-drafts-context";
import { getDatasetVersionAndInfo } from "@/utils/versionUtils";
import { detectInitialIdle } from "@/lib/initial-idle/detect";
import { loadEpisodeSignalFrames } from "@/lib/initial-idle/load";
import {
  inspectIdleSignals,
  loadIdleProfile,
  saveIdleProfile,
} from "@/lib/initial-idle/profile";
import {
  createXarmIdleProfile,
  idleReasonLabels,
} from "@/lib/initial-idle/presets";
import type {
  InitialIdleProfile,
  InitialIdleResult,
  SignalFrame,
  SignalSchema,
} from "@/lib/initial-idle/types";
import {
  normalizeFrameIntervals,
  type FrameInterval,
} from "@/server/dataset-export/clips";

const button =
  "rounded border border-white/15 px-2.5 py-1.5 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed";
const numberInput =
  "w-24 rounded border border-white/15 bg-[var(--surface-0)] px-2 py-1 text-slate-200";

/** Mounted with a dataset/episode key: async results can never cross episodes. */
export function InitialIdleControls({
  repoId,
  episodeId,
  enabled,
  media,
  manualControls,
  edge = "start",
  videos = [],
  batchReview,
  onProfileChange,
}: {
  repoId: string;
  episodeId: number;
  enabled: boolean;
  media?: React.ReactNode;
  manualControls?: React.ReactNode;
  edge?: "start" | "end";
  videos?: VideoInfo[];
  batchReview?: BatchEntry;
  onProfileChange?: (edge: IdleEdge, profile: InitialIdleProfile) => void;
}) {
  const tail = edge === "end";
  const title = tail ? "结尾等待检测" : "开头等待检测";
  const profileRepo = tail ? `${repoId}:trailing` : repoId;
  const abort = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState("");
  const { setIsPlaying } = useTime();
  const { drafts, replaceEpisode } = useClipDrafts();
  const [open, setOpen] = useState(true);
  const openKey = `lerobot-idle-panel-open:${profileRepo}`;
  const [schema, setSchema] = useState<SignalSchema | null>(null);
  const [profile, setProfile] = useState<InitialIdleProfile | null>(null);
  const [detectBusy, setBusy] = useState(false);
  const [draftFramesBusy, setDraftFramesBusy] = useState(false);
  const busy = detectBusy || draftFramesBusy;
  const [result, setResult] = useState<InitialIdleResult | null>(null);
  const [frames, setFrames] = useState<SignalFrame[]>([]);
  const [endFrame, setEndFrame] = useState(0);
  const [reviewed, setReviewed] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [previousBoundary, setPreviousBoundary] = useState<number | null>(null);
  const [selected, setSelected] = useState(0);
  const [viewed, setViewed] = useState(false);
  const [note, setNote] = useState("");
  const [decision, setDecision] = useState<ReviewDecision | null>(null);
  const [group, setGroup] = useState("gripper");
  const player = useRef<IdlePlayerHandle>(null);
  const reviewLayout = useRef<HTMLDivElement>(null);
  const decisionKey = reviewStorageKey(profileRepo, episodeId);
  const [undo, setUndo] = useState<{
    before: FrameInterval[];
    after: FrameInterval[];
  } | null>(null);
  const request = useRef(0);
  const hasDrafts = (drafts[episodeId]?.length ?? 0) > 0;
  useEffect(() => {
    if (!hasDrafts || frames.length || !profile || batchReview) return;
    let cancelled = false;
    setDraftFramesBusy(true);
    loadEpisodeSignalFrames(repoId, episodeId, profile)
      .then((rows) => {
        if (!cancelled) setFrames(rows);
      })
      .catch((e) => {
        if (!cancelled)
          setError(
            `无法恢复裁剪时间轴：${e instanceof Error ? e.message : "读取失败"}。请重试检测。`,
          );
      })
      .finally(() => {
        if (!cancelled) setDraftFramesBusy(false);
      });
    return () => {
      cancelled = true;
      setDraftFramesBusy(false);
    };
  }, [hasDrafts, frames.length, profile, batchReview, repoId, episodeId]);

  useEffect(
    () => () => {
      request.current++;
      abort.current?.abort();
      setIsPlaying(false);
    },
    [setIsPlaying],
  );
  useEffect(() => {
    try {
      const saved = readDecision(localStorage, decisionKey);
      setDecision(saved);
      setNote(saved?.note ?? "");
    } catch {
      /* Private browser mode. */
    }
  }, [decisionKey]);
  function recordDecision(
    status: ReviewDecision["status"],
    interval?: FrameInterval,
  ) {
    const next = {
      status,
      note,
      interval,
      updatedAt: new Date().toISOString(),
    };
    setDecision(next);
    try {
      localStorage.setItem(decisionKey, JSON.stringify(next));
    } catch {
      setError("本次决定仅保留在当前页面：浏览器无法保存复核记录。");
    }
  }
  function changeBoundary(value: number) {
    player.current?.stop();
    setEndFrame(value);
    setReviewed(false);
    setViewed(false);
  }

  const initialize = useCallback(async () => {
    const id = ++request.current;
    setBusy(true);
    setError("");
    try {
      const { info } = await getDatasetVersionAndInfo(repoId);
      if (id !== request.current) return;
      let saved: InitialIdleProfile | null = null;
      try {
        saved = loadIdleProfile(localStorage, profileRepo, info);
      } catch {
        /* Storage may be disabled. */
      }
      const reviewedProfile =
        batchReview && inspectIdleSignals(info, batchReview.profile).ready
          ? batchReview.profile
          : null;
      const next = reviewedProfile ?? saved ?? createXarmIdleProfile(info);
      setSchema(info);
      setProfile(next);
      setSelected(
        Math.max(0, next?.channels.findIndex((c) => c.role === "gripper") ?? 0),
      );
      if (!next)
        setError("此数据的通道布局暂未配置。请先核对关节、夹爪和动作字段。");
      if (batchReview && reviewedProfile) {
        setResult(null);
        setReviewed(false);
        setViewed(false);
        setDirty(false);
        setOpen(true);
        if (batchReview.error) setError(batchReview.error);
        else if (batchReview.result) {
          const rows = await loadEpisodeSignalFrames(
            repoId,
            episodeId,
            reviewedProfile,
          );
          if (id !== request.current) return;
          const c = batchReview.result.candidate;
          if (
            c &&
            (!rows[c.removedFrames.end] ||
              rows[c.activityFrame]?.timestamp !== c.activityTimestamp)
          )
            throw new Error("轨迹与批量结果不一致，请重新检测当前 episode。");
          setFrames(rows);
          setResult(batchReview.result);
          if (c)
            setEndFrame(tail ? c.removedFrames.start : c.removedFrames.end);
          setMessage(
            "已载入批量检测结果及该批次参数；请预览后逐条确认。尚未加入裁剪列表。",
          );
        }
      }
    } catch (e) {
      if (id === request.current)
        setError(e instanceof Error ? e.message : "无法读取数据结构。");
    } finally {
      if (id === request.current) setBusy(false);
    }
  }, [repoId, profileRepo, batchReview, episodeId, tail]);

  useEffect(() => {
    try {
      setOpen(localStorage.getItem(openKey) !== "false");
    } catch {
      setOpen(true);
    }
    void initialize();
  }, [initialize, openKey]);
  useEffect(() => {
    if (profile) onProfileChange?.(edge, profile);
  }, [edge, profile, onProfileChange]);
  useEffect(() => {
    if (batchReview && result && !busy)
      reviewLayout.current?.scrollIntoView?.({
        behavior: "smooth",
        block: "start",
      });
  }, [batchReview, result, busy]);

  function updateProfile(next: InitialIdleProfile) {
    request.current++;
    abort.current?.abort();
    setBusy(false);
    player.current?.stop();
    setProfile(next);
    if (schema && inspectIdleSignals(schema, next).ready) {
      try {
        saveIdleProfile(localStorage, profileRepo, schema, next);
      } catch {
        /* In-memory parameters remain usable for this batch. */
      }
    }
    setDirty(true);
    setReviewed(false);
    setViewed(false);
    setError("");
    setMessage("");
  }

  async function analyze() {
    if (!profile || !schema) return;
    const inspection = inspectIdleSignals(schema, profile);
    if (!inspection.ready) {
      setError("请检查参数：阈值必须大于零，各通道必须完整对应。");
      return;
    }
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const id = ++request.current;
    setProgress("");
    setBusy(true);
    setError("");
    setMessage("");
    setPreviousBoundary(
      result?.candidate
        ? tail
          ? result.candidate.removedTime.start
          : result.candidate.removedTime.endExclusive
        : null,
    );
    setReviewed(false);
    player.current?.stop();
    setViewed(false);
    setIsPlaying(false);
    try {
      const rows = frames.length
        ? frames
        : await loadEpisodeSignalFrames(repoId, episodeId, profile);
      if (id !== request.current) return;
      let analysis: InitialIdleResult;
      if (tail) {
        const decoder = createTailVideoSampler(
          videos,
          schema.fps,
          controller.signal,
        );
        try {
          analysis = await detectTrailingIdle(
            rows,
            profile,
            schema.fps,
            decoder.sample,
            (done, total) => {
              if (id === request.current)
                setProgress(`正在核对各路视频：${done}/${total} 帧`);
            },
            controller.signal,
          );
        } finally {
          decoder.dispose();
        }
      } else analysis = detectInitialIdle(rows, profile);
      if (id !== request.current) return;
      setFrames(rows);
      setResult(analysis);
      player.current?.locate(
        tail
          ? Math.max(
              0,
              (analysis.candidate?.activityTimestamp ??
                rows.at(-1)?.timestamp ??
                0) - 1,
            )
          : (rows[0]?.timestamp ?? 0),
      );
      setDirty(false);
      if (analysis.candidate)
        setEndFrame(
          tail
            ? analysis.candidate.removedFrames.start
            : analysis.candidate.removedFrames.end,
        );
      try {
        saveIdleProfile(localStorage, profileRepo, schema, profile);
      } catch {
        setMessage("检测完成；浏览器未能保存参数，下次打开需要重新设置。");
      }
    } catch (e) {
      if (id === request.current)
        setError(
          `未能读取完整轨迹：${e instanceof Error ? e.message : "未知错误"}`,
        );
    } finally {
      if (id === request.current) setBusy(false);
    }
  }

  const candidate = result?.candidate;
  const validEnd =
    !!candidate &&
    Number.isInteger(endFrame) &&
    (tail
      ? endFrame >= candidate.removedFrames.start && endFrame < frames.length
      : endFrame >= 0 &&
        endFrame <= candidate.removedFrames.end &&
        endFrame + 1 < frames.length);
  const boundary = validEnd
    ? frames[tail ? endFrame : endFrame + 1].timestamp
    : 0;
  const interval = {
    start: tail ? endFrame : 0,
    end: tail ? frames.length - 1 : endFrame,
  };
  const contextLength =
    validEnd && candidate
      ? tail
        ? boundary - candidate.activityTimestamp
        : candidate.activityTimestamp - boundary
      : 0;
  function preview(start: number, end: number) {
    player.current?.preview(
      start,
      end,
      (
        tail
          ? start === boundary
          : start === frames[0]?.timestamp && end === boundary
      )
        ? "等待片段"
        : "裁剪交界",
    );
  }
  function accept() {
    if (!reviewed || !validEnd || !candidate || dirty || busy) return;
    try {
      const before = (drafts[episodeId] ?? []).map((item) => ({ ...item }));
      const after = normalizeFrameIntervals(
        [...before, interval],
        frames.length,
      );
      replaceEpisode(episodeId, after);
      setUndo({ before, after });
      recordDecision("queued", interval);
      setResult(null);
      setReviewed(false);
      player.current?.stop();
      setIsPlaying(false);
      setMessage(
        `已加入裁剪列表：第 ${interval.start}–${interval.end} 帧。到“Filtering（过滤）”导出新数据集后生效，原数据保留。`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "裁剪区间无效。");
    }
  }

  return (
    <div ref={reviewLayout} className="idle-review-layout scroll-mt-20">
      <IdleReviewPlayer
        ref={player}
        edge={edge}
        media={media}
        frames={frames}
        profile={profile}
        candidate={candidate ?? null}
        endFrame={endFrame}
        dirty={dirty || busy}
        onBoundary={changeBoundary}
        selected={selected}
        onSelected={setSelected}
        cuts={drafts[episodeId] ?? EMPTY_CUTS}
        onBoundaryViewed={() => setViewed(true)}
      />
      <section
        className="idle-review-panel rounded-md border border-cyan-400/20 bg-[var(--surface-0)]/60 p-3 text-sm text-slate-300"
        aria-label={title}
      >
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-medium text-slate-100">{title}</h3>
          <span className="text-slate-400">Episode {episodeId}</span>
          <button
            type="button"
            className={`${button} ml-auto`}
            aria-expanded={open}
            onClick={() => {
              setOpen(!open);
              try {
                localStorage.setItem(openKey, String(!open));
              } catch {
                /* Keep local UI state. */
              }
              if (!open && !schema) void initialize();
            }}
          >
            {open ? "收起" : "展开检测"}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          {decision?.status === "retained"
            ? "复核记录：已保留"
            : decision?.status === "queued"
              ? (drafts[episodeId] ?? []).some(
                  (c) =>
                    c.start <= decision.interval!.start &&
                    c.end >= decision.interval!.end,
                )
                ? "已标记裁剪 · 待导出"
                : "曾标记裁剪 · 当前草稿已变化或会话已结束"
              : "待复核"}
          。原始数据保留，导出后生成新数据集。
        </p>
        {!open && decision?.note && (
          <p className="text-xs">上次备注：{decision.note}</p>
        )}
        {open && (
          <div className="mt-3 space-y-3">
            {!enabled && (
              <p>可检测并预览；加入裁剪列表仅支持本地 LeRobot v3.0 数据集。</p>
            )}
            {profile && (
              <>
                <details className="text-xs text-slate-400">
                  <summary className="cursor-pointer">
                    参数含义与适用范围（试用预设）
                  </summary>
                  <p>
                    xArm 试用预设按关节 rad、末端位置
                    mm、夹爪归一化值及绝对位置指令配置；保存的设置以表格为准。请核对采集设置，这些阈值尚未经人工标注校准。
                  </p>
                  <p>
                    {tail
                      ? "从末尾反向检查相邻变化与累计变化，保留最后活动后的确认过程；低变化不自动证明任务已完成。"
                      : "最短等待越大，候选越少；上下文越长，保留越多；确认时长越长，对短暂活动越谨慎。"}
                  </p>
                </details>
                <fieldset
                  disabled={busy}
                  className="flex flex-wrap gap-4 disabled:opacity-50"
                >
                  {(
                    [
                      ["minIdleSeconds", "最短可裁剪等待（秒）"],
                      [
                        "contextSeconds",
                        tail
                          ? "保留完成确认过程（秒）"
                          : "保留动作前上下文（秒）",
                      ],
                      ["activityConfirmSeconds", "动作确认时长（秒）"],
                    ] as const
                  )
                    .filter(
                      ([key]) => !tail || key !== "activityConfirmSeconds",
                    )
                    .map(([key, label]) => (
                      <label key={key} className="flex flex-col gap-1">
                        {label}
                        <input
                          type="number"
                          min={key === "contextSeconds" ? 0 : 0.01}
                          step="0.1"
                          className={numberInput}
                          value={
                            Number.isFinite(profile[key]) ? profile[key] : ""
                          }
                          onChange={(e) =>
                            updateProfile({
                              ...profile,
                              [key]: e.target.valueAsNumber,
                            })
                          }
                        />
                      </label>
                    ))}
                </fieldset>
                <details>
                  <summary className="cursor-pointer text-cyan-300">
                    查看与调整通道阈值
                  </summary>
                  <div className="flex flex-wrap gap-1 my-2">
                    {[
                      ["gripper", "夹爪"],
                      ["joint", "关节"],
                      ["translation", "末端平移"],
                      ["rotation", "末端旋转"],
                    ].map(([value, label]) => (
                      <button
                        type="button"
                        className={button}
                        aria-pressed={group === value}
                        key={value}
                        onClick={() => setGroup(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="my-2 text-slate-400">
                    实际变化速度过滤微小抖动；累计位移保护缓慢动作。夹爪指令使用更小的阈值。单位与采集方式不符时，请先修改配置。
                  </p>
                  <div className="max-h-72 overflow-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr>
                          {[
                            "通道（单位）",
                            "实际变化/秒",
                            "累计位移",
                            "指令变化/秒",
                            "指令累计变化",
                          ].map((h) => (
                            <th
                              key={h}
                              className="p-1 font-normal text-slate-400"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {profile.channels
                          .map((channel, index) => ({ channel, index }))
                          .filter(({ channel }) =>
                            group === "gripper"
                              ? channel.role === "gripper"
                              : group === "translation"
                                ? /^pose\.[xyz]$/.test(channel.name)
                                : group === "rotation"
                                  ? channel.name.startsWith("pose.r")
                                  : channel.role !== "gripper" &&
                                    !channel.name.startsWith("pose."),
                          )
                          .map(({ channel, index }) => (
                            <tr key={channel.name}>
                              <th className="p-1 font-normal whitespace-nowrap">
                                <button
                                  type="button"
                                  className="text-cyan-200 underline"
                                  onClick={() => setSelected(index)}
                                >
                                  {channel.name} ({channel.stateUnit})
                                </button>
                              </th>
                              {(
                                [
                                  "stateSpeed",
                                  "stateExcursion",
                                  "actionActivity",
                                  "actionExcursion",
                                ] as const
                              ).map((key) => (
                                <td key={key} className="p-1">
                                  <input
                                    aria-label={`${channel.name} ${key}`}
                                    disabled={busy}
                                    type="number"
                                    min="0.000001"
                                    step="any"
                                    className={numberInput}
                                    value={
                                      Number.isFinite(channel[key])
                                        ? channel[key]
                                        : ""
                                    }
                                    onChange={(e) =>
                                      updateProfile({
                                        ...profile,
                                        channels: profile.channels.map(
                                          (c, i) =>
                                            i === index
                                              ? {
                                                  ...c,
                                                  [key]: e.target.valueAsNumber,
                                                }
                                              : c,
                                        ),
                                      })
                                    }
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </details>
                {schema &&
                  Object.keys(schema.features).some((key) =>
                    key.includes("mesh_motion"),
                  ) && (
                    <p className="text-cyan-200">
                      {tail
                        ? "该数据包含触觉信号。结尾检测联合关节、位姿、夹爪及视频；尚未自动判断接触力、任务成功或冻结画面，接触保持和物体稳定仍需人工确认。"
                        : "该数据包含触觉信号。当前检测依据关节、位姿和夹爪，接触、保持和物体变化仍需结合视频与曲线确认。"}
                    </p>
                  )}
                {tail && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-cyan-300">
                      视频相似度参数（试用阈值）
                    </summary>
                    <p>
                      逐帧检查全部视频，对比相邻帧及末帧；画面缩小至
                      160×120。较小阈值会更谨慎，细小物体、接触及恒定保持仍需人工检查。
                    </p>
                    {(
                      [
                        ["mean", "画面平均差异上限"],
                        ["fraction", "变化像素占比上限"],
                        ["pixel", "单像素差异阈值"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} className="block my-2">
                        {label}
                        <input
                          aria-label={label}
                          className={numberInput}
                          type="number"
                          min="0.001"
                          max="1"
                          step="0.001"
                          value={
                            (profile.tailVisual ?? DEFAULT_TAIL_VISUAL)[key]
                          }
                          disabled={busy}
                          onChange={(e) =>
                            updateProfile({
                              ...profile,
                              tailVisual: {
                                ...(profile.tailVisual ?? DEFAULT_TAIL_VISUAL),
                                [key]: e.target.valueAsNumber,
                              },
                            })
                          }
                        />
                      </label>
                    ))}
                    <p>数值均为 0–1 的比例；视频缺失或无法读取时不生成候选。</p>
                  </details>
                )}
                <button
                  type="button"
                  className={`${button} border-cyan-400/40 text-cyan-200`}
                  disabled={busy}
                  onClick={() => void analyze()}
                >
                  {busy ? "正在读取与检测…" : "检测当前 episode"}
                </button>
              </>
            )}
            {busy && !profile && <p role="status">正在读取通道信息…</p>}
            {busy && tail && (
              <div role="status">
                {progress || "正在检查完整轨迹与视频…"}
                <button
                  className={button}
                  onClick={() => {
                    request.current++;
                    abort.current?.abort();
                    setBusy(false);
                    setDirty(true);
                    setMessage("检测已取消，原结果仅供参考。");
                  }}
                >
                  取消检测
                </button>
              </div>
            )}
            {error && (
              <p role="alert" className="text-red-300">
                {error}
              </p>
            )}
            {message && <p role="status">{message}</p>}
            {dirty && (
              <p role="status" className="text-amber-200">
                参数已修改，旧结果仅供对比。请重新检测后再确认。
              </p>
            )}
            {previousBoundary !== null && candidate && !dirty && (
              <p className="text-xs">
                重新检测：建议截止 {previousBoundary.toFixed(2)} 秒 →{" "}
                {(tail
                  ? candidate.removedTime.start
                  : candidate.removedTime.endExclusive
                ).toFixed(2)}{" "}
                秒。
              </p>
            )}
            {tail && result?.warnings.length ? (
              <p className="text-xs text-slate-400">
                {result.warnings.join("；")}
              </p>
            ) : null}
            {result && !candidate && (
              <p role="status">
                {result.status === "needs_review"
                  ? "需要人工复核："
                  : "未建议裁剪："}
                {idleReasonLabels[result.reason] ?? result.reason}
              </p>
            )}
            {!tail && result?.diagnostics && (
              <details
                className="rounded border border-white/15 p-2 text-xs space-y-2"
                aria-label="开头活动触发明细"
              >
                <summary className="cursor-pointer text-cyan-200">
                  触发明细
                  {result.diagnostics.triggers[0]
                    ? `：${result.diagnostics.triggers[0].channel} · 第 ${result.diagnostics.triggers[0].frame} 帧（点击展开）`
                    : "：暂无明确活动（点击展开）"}
                </summary>
                <p>
                  未单独触发动作的小幅跳变：
                  {result.diagnostics.ignoredSmallChanges}{" "}
                  次（按通道计数，不是帧数）。小幅不等于无任务价值，仍需看视频。
                </p>
                <p>
                  同一通道分别检查实测与指令；持续窗口及净变化幅度共同确认。明显短脉冲仍保留，必要时将裁剪边界前移。
                </p>
                {result.diagnostics.triggers.map((t, index) => (
                  <button
                    key={`${t.channel}:${t.signal}:${t.frame}:${index}`}
                    type="button"
                    className={`${button} block w-full text-left`}
                    onClick={() => {
                      const selectedIndex =
                        profile?.channels.findIndex(
                          (c) => c.name === t.channel,
                        ) ?? -1;
                      if (selectedIndex >= 0) setSelected(selectedIndex);
                      player.current?.locate(t.timestamp);
                    }}
                  >
                    <span className="block text-cyan-200">
                      {t.channel} ·{" "}
                      {t.signal === "state"
                        ? "实测"
                        : t.signal === "action"
                          ? "指令"
                          : "事件"}{" "}
                      · 第 {t.frame} 帧 / {t.timestamp.toFixed(3)} 秒
                    </span>
                    <span className="block">
                      {
                        {
                          confirmed_motion: "持续运动已确认",
                          gripper: "夹爪变化：立即保护",
                          slow_drift: "累计漂移：需复核",
                          significant_pulse: "明显短暂变化：保护此处之前的边界",
                          active_command: "有效控制指令",
                          tracking_error: "目标跟踪偏差",
                          start_event: "控制开始事件",
                        }[t.reason]
                      }
                      ；保护起点第 {t.onsetFrame} 帧。
                    </span>
                    {t.signal !== "event" && (
                      <span className="block text-slate-400">
                        窗口 {t.windowSeconds.toFixed(3)} 秒；
                        {t.reason === "slow_drift" ||
                        t.reason === "significant_pulse"
                          ? "累计变化范围"
                          : "变化幅度"}{" "}
                        {t.displacement.toFixed(5)} / 门槛{" "}
                        {t.displacementThreshold} {t.unit}；
                        {t.reason === "active_command"
                          ? "指令值"
                          : "当前变化率"}{" "}
                        {t.speed.toFixed(5)} / 门槛 {t.speedThreshold}
                        。点击定位。
                      </span>
                    )}
                  </button>
                ))}
              </details>
            )}
            {candidate && (
              <div className="space-y-3 rounded border border-cyan-400/25 p-3">
                <p className="font-medium text-cyan-200">
                  {tail ? "发现结尾等待候选：最多" : "发现开头等待候选：最多"}{" "}
                  {candidate.removedTime.duration.toFixed(2)} 秒（第{" "}
                  {candidate.removedFrames.start}–{candidate.removedFrames.end}{" "}
                  帧）
                </p>
                <p>
                  {tail ? "最后活动后的边界约" : "受保护的活动边界约"}{" "}
                  {candidate.activityTimestamp.toFixed(2)} 秒；当前保留{" "}
                  {validEnd ? contextLength.toFixed(2) : "—"} 秒
                  {tail ? "完成确认过程" : "上下文"}。
                </p>
                <div className="text-xs text-slate-400">
                  判定依据（点击看曲线）：
                  <div className="flex flex-wrap gap-1 mt-1">
                    {candidate.evidence.map((e) => (
                      <button
                        type="button"
                        key={e}
                        className={button}
                        onClick={() => {
                          const index =
                            profile?.channels.findIndex((c) =>
                              e.startsWith(`${c.name}:`),
                            ) ?? -1;
                          if (index >= 0) setSelected(index);
                          player.current?.locate(
                            frames[
                              Math.min(
                                frames.length - 1,
                                candidate.activityFrame + (tail ? 0 : 1),
                              )
                            ].timestamp,
                          );
                        }}
                      >
                        {e
                          .replace("command activity", "指令变化")
                          .replace("measured motion", "实际运动")}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="flex flex-wrap items-center gap-2">
                  {tail ? "从第" : "移除到第"}{" "}
                  <input
                    aria-label={tail ? "候选开始帧" : "候选结束帧"}
                    className={numberInput}
                    type="number"
                    min={tail ? candidate.removedFrames.start : 0}
                    max={tail ? frames.length - 1 : candidate.removedFrames.end}
                    value={Number.isFinite(endFrame) ? endFrame : ""}
                    disabled={dirty || busy}
                    onChange={(e) => changeBoundary(e.target.valueAsNumber)}
                  />{" "}
                  {tail
                    ? "帧起移除到结尾（可后移，保留更多确认过程）"
                    : "帧（可缩短，保留更多上下文）"}
                </label>
                {!validEnd && (
                  <p role="alert" className="text-red-300">
                    {tail
                      ? `开始帧必须是 ${candidate.removedFrames.start}–${frames.length - 1} 的整数，不能侵入保护的确认过程。`
                      : `结束帧必须是 0–${candidate.removedFrames.end} 的整数，不能侵入保护的上下文。`}
                  </p>
                )}
                <button
                  type="button"
                  disabled={dirty || busy}
                  className={button}
                  onClick={() =>
                    changeBoundary(
                      tail
                        ? candidate.removedFrames.start
                        : candidate.removedFrames.end,
                    )
                  }
                >
                  恢复建议边界
                </button>
                {validEnd && (
                  <p>
                    所选区间{" "}
                    {(tail ? boundary : frames[0].timestamp).toFixed(2)}–
                    {(tail
                      ? candidate.removedTime.endExclusive
                      : boundary
                    ).toFixed(2)}{" "}
                    秒，共 {interval.end - interval.start + 1} 帧。
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={button}
                    disabled={!validEnd || dirty || busy}
                    onClick={() =>
                      preview(
                        tail ? boundary : frames[0].timestamp,
                        tail ? frames.at(-1)!.timestamp : boundary,
                      )
                    }
                  >
                    播放等待片段
                  </button>
                  <button
                    type="button"
                    className={button}
                    disabled={!validEnd || dirty || busy}
                    onClick={() =>
                      preview(
                        Math.max(
                          frames[0].timestamp,
                          (tail ? candidate.activityTimestamp : boundary) - 1,
                        ),
                        Math.min(
                          frames.at(-1)!.timestamp,
                          (tail ? boundary : candidate.activityTimestamp) + 1,
                        ),
                      )
                    }
                  >
                    预览裁剪交界
                  </button>
                </div>
                <p className="text-xs text-slate-400">
                  {viewed
                    ? "已播放裁剪交界；请仍根据任务内容判断。"
                    : "裁剪交界尚未完整预览，建议先播放检查。"}
                </p>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={reviewed}
                    onChange={(e) => setReviewed(e.target.checked)}
                  />
                  {tail
                    ? "已确认任务结束，并检查物体稳定、夹爪与接触保持过程；所选尾部没有需要保留的任务内容。"
                    : "已检查视频与曲线，确认所选片段仅为等待，没有需要保留的夹爪、接触或任务过程。"}
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={`${button} border-red-400/40 text-red-200`}
                    disabled={
                      !enabled || !reviewed || !validEnd || dirty || busy
                    }
                    onClick={accept}
                  >
                    确认加入裁剪列表
                  </button>
                  <button
                    type="button"
                    className={button}
                    onClick={() => {
                      setResult(null);
                      setReviewed(false);
                      player.current?.stop();
                      recordDecision("retained");
                      setIsPlaying(false);
                      setMessage("已保留此段，没有新增裁剪。");
                    }}
                  >
                    保留此段
                  </button>
                </div>
              </div>
            )}
            <label className="block text-xs">
              复核备注（可选）
              <input
                aria-label="复核备注"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={300}
                placeholder="例如：夹爪保持、等待物体稳定"
                className="mt-1 w-full rounded border border-white/15 bg-slate-900 p-2"
              />
            </label>
            {decision && note !== decision.note && (
              <button
                type="button"
                className={button}
                onClick={() => {
                  recordDecision(decision.status, decision.interval);
                  setMessage("已保存复核备注。");
                }}
              >
                保存备注
              </button>
            )}
            {!candidate && (
              <button
                type="button"
                className={button}
                disabled={!result || busy || dirty}
                onClick={() => {
                  recordDecision("retained");
                  setMessage("已记录为保留。已有裁剪区间请在下方单独撤销。");
                }}
              >
                记录为已保留
              </button>
            )}
            {undo && (
              <button
                type="button"
                className={button}
                onClick={() => {
                  if (
                    JSON.stringify(drafts[episodeId] ?? []) !==
                    JSON.stringify(undo.after)
                  ) {
                    setError(
                      "裁剪列表已有后续修改，请通过下方区间按钮调整，避免覆盖新修改。",
                    );
                    return;
                  }
                  replaceEpisode(episodeId, undo.before);
                  setUndo(null);
                  setDecision(null);
                  try {
                    localStorage.removeItem(decisionKey);
                  } catch {
                    /* Session remains usable. */
                  }
                  setMessage("已撤销本次自动候选裁剪，恢复此前的裁剪列表。");
                }}
              >
                撤销本次加入
              </button>
            )}
          </div>
        )}
        {manualControls}
      </section>
    </div>
  );
}
const EMPTY_CUTS: FrameInterval[] = [];

export function IdleBoundaryControls(
  props: Omit<
    React.ComponentProps<typeof InitialIdleControls>,
    "edge" | "batchReview" | "onProfileChange"
  > & { episodes?: number[] },
) {
  const router = useRouter();
  const [initialSelection] = useState(() => {
    try {
      const value = JSON.parse(
        sessionStorage.getItem(batchSelectionKey(props.repoId)) ?? "null",
      );
      return value && ["start", "end"].includes(value.edge)
        ? (value as { episodeId: number; edge: IdleEdge })
        : null;
    } catch {
      return null;
    }
  });
  const [edge, setEdge] = useState<IdleEdge>(initialSelection?.edge ?? "start");
  const [batchReview, setBatchReview] = useState<BatchEntry | undefined>(() => {
    if (initialSelection?.episodeId !== props.episodeId) return undefined;
    try {
      const entries = JSON.parse(
        sessionStorage.getItem(batchStorageKey(props.repoId)) ?? "[]",
      ) as BatchEntry[];
      return entries.find(
        (r) =>
          r.episodeId === props.episodeId && r.edge === initialSelection?.edge,
      );
    } catch {
      return undefined;
    }
  });
  const [profiles, setProfiles] = useState<
    Partial<Record<IdleEdge, InitialIdleProfile>>
  >({});
  const onProfileChange = useCallback(
    (which: IdleEdge, profile: InitialIdleProfile) => {
      setProfiles((previous) => ({ ...previous, [which]: profile }));
    },
    [],
  );
  function review(entry: BatchEntry) {
    try {
      sessionStorage.setItem(
        batchSelectionKey(props.repoId),
        JSON.stringify({ episodeId: entry.episodeId, edge: entry.edge }),
      );
    } catch {
      /* Current episode still works. */
    }
    if (entry.episodeId !== props.episodeId)
      router.push(`/${props.repoId}/episode_${entry.episodeId}`);
    else {
      setEdge(entry.edge);
      setBatchReview(entry);
    }
  }
  return (
    <>
      {props.episodes && (
        <BatchIdleControls
          enabled={props.enabled}
          repoId={props.repoId}
          episodes={props.episodes}
          episodeId={props.episodeId}
          profiles={profiles}
          onReview={review}
        />
      )}
      <div className="flex gap-2 mb-3" role="group" aria-label="等待检测位置">
        {(
          [
            ["start", "开头等待"],
            ["end", "结尾等待"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            className={`${button} ${edge === value ? "text-cyan-300 border-cyan-400" : ""}`}
            aria-pressed={edge === value}
            onClick={() => {
              setEdge(value);
              setBatchReview(undefined);
              try {
                sessionStorage.setItem(
                  batchSelectionKey(props.repoId),
                  JSON.stringify({ episodeId: -1, edge: value }),
                );
              } catch {
                /* Local selection remains. */
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <InitialIdleControls
        key={`${props.repoId}:${props.episodeId}:${edge}`}
        {...props}
        edge={edge}
        batchReview={batchReview?.edge === edge ? batchReview : undefined}
        onProfileChange={onProfileChange}
      />
    </>
  );
}
