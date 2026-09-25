"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { TrajectorySmoothnessEpisode } from "@/lib/trajectory-phase-sparc";
import { EpisodeVideoDialog } from "./episode-video-dialog";
import {
  reviewStorageKey,
  seedReviews,
  hydrateReviews,
  REVIEW_FEEDBACK_REVISION,
  legacyReviewStorageKey,
  validReviews,
  type ReviewDecision,
  type TrajectoryReviews,
} from "@/lib/trajectory-review";

const percent = (v: number | null) =>
  v === null ? "—" : `${Math.round(v * 100)}%`;
const raw = (v: number | null) => (v === null ? "—" : v.toFixed(4));
const decisions: { value: ReviewDecision; label: string }[] = [
  { value: "unreviewed", label: "未确认" },
  { value: "normal", label: "5分" },
  { value: "borderline", label: "3分" },
  { value: "abnormal", label: "1分" },
];

export function TrajectorySmoothnessSection({
  episodes,
  repoId,
}: {
  episodes: TrajectorySmoothnessEpisode[];
  repoId: string;
}) {
  const storageKey = reviewStorageKey(repoId);
  const [stored, setStored] = useState<{
    key: string;
    reviews: TrajectoryReviews;
  } | null>(null);
  const [storageError, setStorageError] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [preview, setPreview] = useState<{
    episodeIndex: number;
    time: number;
  } | null>(null);
  const loaded = stored?.key === storageKey;
  const reviews = useMemo(
    () =>
      loaded
        ? validReviews(stored.reviews, episodes)
        : seedReviews(repoId, episodes),
    [loaded, stored, repoId, episodes],
  );
  useEffect(() => {
    let local: TrajectoryReviews = {};
    try {
      const serialized =
        localStorage.getItem(storageKey) ??
        localStorage.getItem(legacyReviewStorageKey(repoId));
      if (serialized) local = validReviews(JSON.parse(serialized), episodes);
      setStorageError("");
    } catch {
      setStorageError("本机复核记录读取失败；本次仍可记录，请留意保存提示。");
    }
    setStored({
      key: storageKey,
      reviews: hydrateReviews(repoId, episodes, local),
    });
  }, [storageKey, repoId, episodes]);
  function changeReview(
    episode: TrajectorySmoothnessEpisode,
    decision: ReviewDecision,
  ) {
    if (!loaded) return;
    const updated = {
      ...reviews,
      [episode.episodeIndex]: {
        decision,
        fingerprint: episode.fingerprint,
        source: "本机视频复核",
        feedbackRevision: REVIEW_FEEDBACK_REVISION,
      },
    };
    setStored({ key: storageKey, reviews: updated });
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
      setStorageError("");
    } catch {
      setStorageError(
        "复核结论只保留在当前页面：浏览器存储不可用，刷新后可能丢失。",
      );
    }
  }
  function reviewControl(episode: TrajectorySmoothnessEpisode) {
    const record = reviews[episode.episodeIndex];
    return (
      <select
        aria-label={`ep ${episode.episodeIndex} 人工结论`}
        title={record?.source}
        disabled={!loaded}
        value={record?.decision ?? "unreviewed"}
        onChange={(event) =>
          changeReview(episode, event.target.value as ReviewDecision)
        }
        className={`rounded border border-white/10 bg-[var(--surface-0)] px-2 py-1 text-xs ${record?.decision === "normal" ? "text-green-300" : record?.decision === "abnormal" ? "text-red-300" : "text-slate-400"}`}
      >
        {decisions.map((d) => (
          <option key={d.value} value={d.value}>
            {d.label}
          </option>
        ))}
      </select>
    );
  }
  function seek(episode: TrajectorySmoothnessEpisode, start: number) {
    setPreview({
      episodeIndex: episode.episodeIndex,
      time: Math.max(0, start - episode.startTime),
    });
  }
  if (!episodes.length)
    return (
      <div className="rounded-lg border border-white/10 p-5 text-sm text-slate-500">
        没有可用的轨迹平滑度数据。
      </div>
    );
  const selected =
    preview && episodes.find((e) => e.episodeIndex === preview.episodeIndex);
  const scored = episodes.filter((e) => e.score !== null).length;
  return (
    <section
      data-testid="trajectory-smoothness"
      className="space-y-4 rounded-lg border border-white/10 bg-[var(--surface-1)]/60 p-5"
    >
      <div>
        <h3 className="text-sm font-semibold text-slate-200">
          Trajectory Smoothness — 轨迹平滑度{" "}
          <span className="ml-2 text-xs font-normal text-slate-500">
            {episodes.length} episodes · 阶段 SPARC + TED · V5
          </span>
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs lg:grid-cols-4">
        {[
          { label: "可评分", value: `${scored} / ${episodes.length}` },
          {
            label: "已评分运动阶段",
            value: episodes.reduce(
              (n, e) =>
                n + e.phases.filter((p) => p.status === "scored").length,
              0,
            ),
          },
          {
            label: "低运动信号阶段",
            value: episodes.reduce(
              (n, e) =>
                n + e.phases.filter((p) => p.status === "low_signal").length,
              0,
            ),
          },
          { label: "合格筛选阈值", value: "待独立标定" },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-md bg-[var(--surface-0)]/60 px-3 py-2"
          >
            <span className="text-slate-500">{item.label}</span>
            <strong className="block text-lg tabular-nums text-slate-200">
              {item.value}
            </strong>
          </div>
        ))}
      </div>
      <div
        data-testid="smoothness-method-note"
        className="rounded-md border border-cyan-400/15 bg-cyan-400/5 px-3 py-2 text-xs leading-relaxed text-slate-400"
      >
        <p>
          人工结论仅作独立记录，不参与评分、调参、阈值选择或算法验证。当前不自动判定合格/不合格，也不展示人工一致率或误判率。
        </p>
        <p className="mt-1">
          低运动信号阶段不计低分或满分；短阶段证据不足时不评分。局部和跨边界窗口仅帮助定位，不进入总分。点击
          episode 或时间段可打开视频小窗；空格播放/暂停，Esc 返回。
        </p>
        {storageError && (
          <p role="alert" className="mt-1 text-yellow-300">
            {storageError}
          </p>
        )}
      </div>
      <div className="max-h-[32rem] overflow-auto rounded-md border border-white/10">
        <table className="w-full min-w-[1100px] text-xs">
          <thead className="sticky top-0 z-10 bg-[var(--surface-0)] text-slate-500">
            <tr>
              {[
                "Episode · 视频",
                "相对分",
                "相对排名",
                "人工结论",
                "SPARC 均值",
                "SPARC 百分位",
                "TED",
                "TED 百分位",
                "PSD 参考",
                "运动覆盖",
                "阶段详情",
              ].map((title) => (
                <th
                  key={title}
                  className="whitespace-nowrap px-2 py-2 text-left font-medium"
                >
                  {title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {episodes.map((episode) => (
              <Fragment key={episode.episodeIndex}>
                <tr className="border-t border-white/5 text-slate-300 hover:bg-white/[0.025]">
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      aria-label={`查看 ep ${episode.episodeIndex} 视频`}
                      onClick={() => seek(episode, episode.startTime)}
                      className="whitespace-nowrap rounded px-1 py-1 text-cyan-300 underline decoration-cyan-400/30 underline-offset-4 hover:bg-cyan-400/10"
                    >
                      ep {episode.episodeIndex} ▷
                    </button>
                  </td>
                  <td className="px-2 py-2 font-medium tabular-nums">
                    {episode.score === null ? "—" : episode.score.toFixed(1)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-slate-400">
                    {episode.label}
                  </td>
                  <td className="px-2 py-2">{reviewControl(episode)}</td>
                  <td className="px-2 py-2 tabular-nums">
                    {raw(episode.sparc)}
                  </td>
                  <td className="px-2 py-2 tabular-nums">
                    {percent(episode.sparcQuality)}
                  </td>
                  <td className="px-2 py-2 tabular-nums">{raw(episode.ted)}</td>
                  <td className="px-2 py-2 tabular-nums">
                    {percent(episode.tedQuality)}
                  </td>
                  <td className="px-2 py-2 tabular-nums text-slate-500">
                    {raw(episode.psd)}
                  </td>
                  <td
                    className="px-2 py-2 tabular-nums"
                    title="可评分运动时长 / 候选运动时长；不含静止与数据缺口"
                  >
                    {percent(episode.coverage)}
                  </td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      aria-label={`ep ${episode.episodeIndex} 阶段详情`}
                      aria-expanded={expanded === episode.episodeIndex}
                      className="whitespace-nowrap text-cyan-300 hover:underline"
                      onClick={() =>
                        setExpanded(
                          expanded === episode.episodeIndex
                            ? null
                            : episode.episodeIndex,
                        )
                      }
                    >
                      详情 {expanded === episode.episodeIndex ? "−" : "+"}
                    </button>
                  </td>
                </tr>
                {expanded === episode.episodeIndex && (
                  <tr className="border-t border-white/5 bg-[var(--surface-0)]/60">
                    <td
                      colSpan={11}
                      className="space-y-3 px-4 py-3 text-slate-400"
                    >
                      <p>
                        有效样本 {percent(episode.validFraction)}
                        ；运动阶段已评分 {episode.scoredSeconds.toFixed(
                          2,
                        )} / {episode.motionSeconds.toFixed(2)} 秒。噪声估计{" "}
                        {raw(episode.noiseEstimate)}；运动位移下限{" "}
                        {raw(episode.motionFloor)}
                        （均为原始坐标单位，噪声估计不是传感器标定）。
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {episode.groups.map((g) => (
                          <div
                            key={g.key}
                            className="rounded border border-white/10 p-2"
                          >
                            <p className="text-slate-200">
                              {g.name} · {g.phaseCount} 个运动阶段
                            </p>
                            <p>
                              SPARC {raw(g.sparc)} · {percent(g.sparcQuality)}
                              ；TED {raw(g.ted)} · {percent(g.tedQuality)}
                            </p>
                            <p className="text-slate-500">
                              同状态参考 {g.referenceCount} 条 episode
                            </p>
                          </div>
                        ))}
                      </div>
                      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                        {episode.phases.map((phase) => (
                          <div
                            key={phase.id}
                            className="rounded border border-white/10 p-2"
                          >
                            <p className="font-medium text-slate-200">
                              阶段 {phase.id + 1} · {phase.name}
                            </p>
                            <button
                              type="button"
                              aria-label={`定位阶段 ${phase.id + 1}，${phase.start.toFixed(2)} 秒`}
                              onClick={() => seek(episode, phase.start)}
                              className="my-1 text-cyan-300 hover:underline"
                            >
                              {phase.start.toFixed(2)}–{phase.end.toFixed(2)} 秒
                            </button>
                            {phase.status === "scored" ? (
                              <p>
                                SPARC {raw(phase.sparc)} · TED {raw(phase.ted)}
                                <br />
                                频谱截止 {phase.cutoffHz?.toFixed(2)} Hz
                              </p>
                            ) : (
                              <p className="text-slate-500">
                                {phase.status === "low_signal"
                                  ? "低运动信号 · 不计分"
                                  : "时长或采样不足 · 不计分"}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                      <details>
                        <summary className="cursor-pointer text-cyan-300">
                          局部较低窗口与跨边界检查（仅定位，不代表异常结论）
                        </summary>
                        <div className="mt-2 grid gap-3 md:grid-cols-2">
                          {(["local", "boundary"] as const).map((kind) => (
                            <div key={kind}>
                              <p>
                                {kind === "local"
                                  ? "阶段附近的局部窗口"
                                  : "跨阶段边界窗口"}
                              </p>
                              {episode.windows
                                .filter((w) => w.kind === kind)
                                .sort((a, b) => a.value - b.value)
                                .slice(0, 4)
                                .map((w) => (
                                  <button
                                    type="button"
                                    key={w.start}
                                    onClick={() => seek(episode, w.start)}
                                    className="mr-3 mt-1 text-cyan-300 hover:underline"
                                  >
                                    {w.start.toFixed(2)}–{w.end.toFixed(2)} 秒 ·{" "}
                                    {raw(w.value)}
                                  </button>
                                ))}
                            </div>
                          ))}
                        </div>
                      </details>
                      {episode.warnings.map((warning) => (
                        <p key={warning} className="text-slate-500">
                          {warning}
                        </p>
                      ))}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs leading-relaxed text-slate-500">
        SPARC 越接近 0 表示速度谱更平滑；TED
        越小表示偏离阶段包络越少。夹爪高/低位只是数值状态，不等于抓取语义。SPARC
        使用速度模长，可能漏掉纯方向变化；当前位置 TED
        尚不评价姿态抖动。相对分档 ≥70 / 30–70 / &lt;30
        仅供浏览，不是论文合格阈值。
      </p>
      {preview && selected && (
        <EpisodeVideoDialog
          key={`${repoId}:${preview.episodeIndex}:${preview.time}`}
          repoId={repoId}
          episodeIndex={preview.episodeIndex}
          initialTime={preview.time}
          onClose={() => setPreview(null)}
        >
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
            <span>独立人工记录：</span>
            {reviewControl(selected)}
            <span>
              相对分 {selected.score === null ? "—" : selected.score.toFixed(1)}{" "}
              · 低排名不代表不合格
            </span>
          </div>
          {storageError && (
            <p role="alert" className="text-xs text-yellow-300">
              {storageError}
            </p>
          )}
        </EpisodeVideoDialog>
      )}
    </section>
  );
}
