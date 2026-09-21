"use client";
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTime } from "@/context/time-context";
import {
  channelActivity,
  nearestFrame,
  skipRemoved,
} from "@/lib/initial-idle/review";
import type {
  InitialIdleProfile,
  InitialIdleResult,
  SignalFrame,
} from "@/lib/initial-idle/types";
import type { FrameInterval } from "@/server/dataset-export/clips";

export type IdlePlayerHandle = {
  preview: (start: number, end: number, label: string) => void;
  stop: () => void;
  locate: (time: number) => void;
};
type Props = {
  media?: React.ReactNode;
  edge?: "start" | "end";
  frames: SignalFrame[];
  profile: InitialIdleProfile | null;
  candidate: InitialIdleResult["candidate"];
  endFrame: number;
  dirty: boolean;
  onBoundary: (value: number) => void;
  selected: number;
  onSelected: (value: number) => void;
  cuts: FrameInterval[];
  onBoundaryViewed: () => void;
};
const btn =
  "rounded border border-white/15 px-2 py-1.5 text-xs hover:bg-white/10 disabled:opacity-40";

export const IdleReviewPlayer = forwardRef<IdlePlayerHandle, Props>(
  function IdleReviewPlayer(
    {
      media,
      edge = "start",
      frames,
      profile,
      candidate,
      endFrame,
      dirty,
      onBoundary,
      selected,
      onSelected,
      cuts,
      onBoundaryViewed,
    },
    ref,
  ) {
    const {
      currentTime = 0,
      duration = 0,
      seek,
      isPlaying = false,
      setIsPlaying,
      subscribe,
      playbackRate = 1,
      setPlaybackRate,
    } = useTime();
    const [mode, setMode] = useState<"original" | "trimmed">("original");
    const [loop, setLoop] = useState(false);
    const [zoom, setZoom] = useState(true);
    const [label, setLabel] = useState("原始播放");
    const segment = useRef<{
      start: number;
      end: number;
      boundary: boolean;
    } | null>(null);
    const tail = edge === "end";
    const lastFrame = frames.at(-1)?.timestamp ?? duration;
    const frameIndex = nearestFrame(frames, currentTime);
    const valid =
      !!candidate &&
      Number.isInteger(endFrame) &&
      (tail
        ? endFrame >= candidate.removedFrames.start && endFrame < frames.length
        : endFrame >= 0 &&
          endFrame <= candidate.removedFrames.end &&
          endFrame + 1 < frames.length);
    const boundary = valid
      ? frames[tail ? endFrame : endFrame + 1].timestamp
      : 0;
    const callbacks = useRef({ frames, cuts, loop, mode, onBoundaryViewed });
    callbacks.current = { frames, cuts, loop, mode, onBoundaryViewed };
    const internalSeek = useRef(false);

    function stop() {
      segment.current = null;
      setIsPlaying(false);
      setLabel(mode === "trimmed" ? "裁剪后预览（未导出）" : "原始播放");
    }
    function locate(time: number) {
      stop();
      seek(time);
    }
    useImperativeHandle(ref, () => ({
      stop,
      locate,
      preview(start, end, title) {
        segment.current = null;
        setMode("original");
        callbacks.current.mode = "original";
        seek(start);
        if (end <= start) {
          setIsPlaying(false);
          setLabel("已定位单帧片段，请检查当前画面");
          return;
        }
        segment.current = { start, end, boundary: title === "裁剪交界" };
        setLabel(`正在预览：${title} ${start.toFixed(2)}–${end.toFixed(2)} 秒`);
        setIsPlaying(true);
      },
    }));

    useEffect(
      () =>
        subscribe((time) => {
          if (internalSeek.current) return;
          const active = segment.current;
          const c = callbacks.current;
          if (
            active &&
            (time < active.start - 0.08 || time > active.end + 0.6)
          ) {
            segment.current = null;
            return;
          }
          if (active && time >= active.end) {
            if (active.boundary) c.onBoundaryViewed();
            if (c.loop) {
              internalSeek.current = true;
              seek(active.start);
              internalSeek.current = false;
            } else {
              segment.current = null;
              setIsPlaying(false);
              internalSeek.current = true;
              seek(active.end);
              internalSeek.current = false;
              setLabel("片段预览结束");
            }
            return;
          }
          if (c.mode === "trimmed") {
            const next = skipRemoved(c.frames, c.cuts, time);
            if (next === null) {
              setIsPlaying(false);
              internalSeek.current = true;
              seek(lastKeptTime(c.frames, c.cuts));
              internalSeek.current = false;
              setLabel("裁剪后预览结束");
            } else if (next !== time) {
              internalSeek.current = true;
              seek(next);
              internalSeek.current = false;
            }
          }
        }),
      [subscribe, seek, setIsPlaying],
    );
    useEffect(
      () => () => {
        segment.current = null;
        setIsPlaying(false);
      },
      [setIsPlaying],
    );
    useEffect(() => {
      segment.current = null;
      setIsPlaying(false);
      setMode("original");
      setLabel("原始播放");
      if (cuts.length) setZoom(false);
    }, [cuts, setIsPlaying]);

    // Video duration is available before detection has loaded the signal frames.
    // Keep the playback slider, colored bands and curves on the same time window.
    const extent = Math.max(0.001, lastFrame || duration || 1);
    const savedLeading = cuts.find((cut) => cut.start === 0);
    const savedTrailing = cuts.find((cut) => cut.end === frames.length - 1);
    const leadingBoundary = savedLeading
      ? frames[savedLeading.end + 1]?.timestamp
      : undefined;
    const trailingBoundary = savedTrailing
      ? frames[savedTrailing.start]?.timestamp
      : undefined;
    const focusStart = tail
      ? Math.max(
          0,
          (candidate?.activityTimestamp ??
            Math.min(extent - 3, trailingBoundary ?? extent)) - 2,
        )
      : 0;
    const focusEnd = tail
      ? extent
      : Math.min(
          extent,
          (candidate?.activityTimestamp ?? Math.max(3, leadingBoundary ?? 0)) +
            2,
        );
    const canZoom = focusStart > 0 || focusEnd < extent;
    const windowEnd = zoom ? focusEnd : extent;
    const windowStart = zoom ? focusStart : 0;
    function toggleZoom() {
      const next = !zoom;
      setZoom(next);
      if (next && (currentTime < focusStart || currentTime > focusEnd)) {
        // Seek within the visible window so the thumb does not stick at an edge.
        const target = frames.length
          ? (frames.find((frame) => frame.timestamp >= focusStart)?.timestamp ??
            focusStart)
          : focusStart;
        locate(target);
      }
    }
    const channel = profile?.channels[selected] ?? profile?.channels[0];
    const samples = useMemo(
      () => (channel ? channelActivity(frames, channel) : []),
      [frames, channel],
    );
    const visible = samples.filter(
      (s) => s.time >= windowStart && s.time <= windowEnd,
    );
    const yMax =
      Math.max(
        channel?.stateSpeed ?? 0,
        channel?.actionActivity ?? 0,
        ...visible.map((s) => Math.max(s.measured, s.command)),
        0.001,
      ) * 1.1;
    const x = (time: number) =>
      Math.max(
        0,
        Math.min(100, ((time - windowStart) / (windowEnd - windowStart)) * 100),
      );
    const path = (key: "measured" | "command") =>
      visible
        .map((s) => `${x(s.time) * 6},${100 - (s[key] / yMax) * 88}`)
        .join(" ");
    const sample = samples[frameIndex];
    const selectTime = (e: React.MouseEvent<SVGSVGElement>) => {
      const box = e.currentTarget.getBoundingClientRect();
      locate(
        frames[
          nearestFrame(
            frames,
            Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)) *
              (windowEnd - windowStart) +
              windowStart,
          )
        ]?.timestamp ?? 0,
      );
    };
    function play() {
      if (isPlaying) {
        setIsPlaying(false);
        return;
      }
      const next =
        mode === "trimmed"
          ? skipRemoved(
              frames,
              cuts,
              currentTime >= lastKeptTime(frames, cuts) ? 0 : currentTime,
            )
          : currentTime >= lastFrame
            ? 0
            : currentTime;
      if (next === null) return;
      if (next !== currentTime) seek(next);
      setIsPlaying(true);
    }
    function step(direction: number) {
      stop();
      let i = Math.max(0, Math.min(frames.length - 1, frameIndex + direction));
      while (
        mode === "trimmed" &&
        i >= 0 &&
        i < frames.length &&
        cuts.some((c) => i >= c.start && i <= c.end)
      )
        i += direction;
      if (i >= 0 && i < frames.length) seek(frames[i].timestamp);
    }

    return (
      <div className="idle-review-media">
        <div className="idle-review-cameras">{media}</div>
        <div className="idle-review-transport space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              className={btn}
              onClick={play}
              aria-label={isPlaying ? "暂停复核播放" : "开始复核播放"}
            >
              {isPlaying ? "暂停" : "播放"}
            </button>
            <button
              className={btn}
              disabled={!frames.length || frameIndex === 0}
              onClick={() => step(-1)}
            >
              前一帧
            </button>
            <button
              className={btn}
              disabled={!frames.length || frameIndex === frames.length - 1}
              onClick={() => step(1)}
            >
              后一帧
            </button>
            <label className="text-xs">
              速度{" "}
              <select
                aria-label="复核播放速度"
                className="bg-slate-800 rounded p-1"
                value={playbackRate}
                onChange={(e) => setPlaybackRate?.(Number(e.target.value))}
              >
                {[0.25, 0.5, 1].map((v) => (
                  <option key={v} value={v}>
                    {v}×
                  </option>
                ))}
              </select>
            </label>
            <button
              aria-pressed={loop}
              className={btn}
              onClick={() => setLoop(!loop)}
            >
              {loop ? "片段循环：开" : "片段循环：关"}
            </button>
            <span className="text-xs tabular-nums">
              {currentTime.toFixed(2)} 秒 · 原始第 {frameIndex} 帧
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              className={btn}
              aria-pressed={mode === "original"}
              onClick={() => {
                stop();
                setMode("original");
                setLabel("原始播放");
              }}
            >
              原始播放
            </button>
            <button
              className={btn}
              disabled={!cuts.length || !frames.length}
              aria-pressed={mode === "trimmed"}
              onClick={() => {
                stop();
                setMode("trimmed");
                setLabel("裁剪后预览（仅跳过已标记区间，未导出）");
                const next = skipRemoved(frames, cuts, currentTime);
                callbacks.current.mode = "trimmed";
                seek(next ?? lastKeptTime(frames, cuts));
              }}
            >
              裁剪后预览
            </button>
            <span role="status">{label}</span>
          </div>
          <div
            className="relative h-5 rounded bg-slate-700 overflow-hidden"
            aria-label="复核时间轴色带"
          >
            {cuts
              .filter((c) => frames[c.start] && frames[c.end])
              .map((c) => (
                <span
                  key={`${c.start}:${c.end}`}
                  title={`已标记 ${c.start}–${c.end} 帧，待导出`}
                  className="absolute h-full bg-red-500/70"
                  style={{
                    left: `${x(frames[c.start].timestamp)}%`,
                    width: `${x(frames[c.end + 1]?.timestamp ?? lastFrame) - x(frames[c.start].timestamp)}%`,
                  }}
                />
              ))}
            {valid && (
              <>
                <span
                  className="absolute h-full bg-red-300/60"
                  style={{
                    left: `${tail ? x(boundary) : 0}%`,
                    width: `${tail ? 100 - x(boundary) : x(boundary)}%`,
                  }}
                />
                <span
                  className="absolute h-full bg-cyan-500/50"
                  style={{
                    left: `${x(tail ? candidate!.activityTimestamp : boundary)}%`,
                    width: `${Math.abs(x(candidate!.activityTimestamp) - x(boundary))}%`,
                  }}
                />
                <span
                  className="absolute h-full border-l-2 border-emerald-300"
                  style={{ left: `${x(candidate!.activityTimestamp)}%` }}
                />
              </>
            )}
            <span
              className="absolute h-full border-l-2 border-white"
              style={{ left: `${x(currentTime)}%` }}
            />
          </div>
          {!!cuts.length && !frames.length && (
            <p className="text-xs text-slate-400">
              裁剪草稿已保存，正在等待轨迹时间信息；加载后显示准确的红色色带。
            </p>
          )}
          <input
            aria-label="复核播放位置"
            className="w-full accent-cyan-400"
            type="range"
            min={windowStart}
            max={windowEnd}
            step="any"
            value={Math.max(windowStart, Math.min(currentTime, windowEnd))}
            onChange={(e) => {
              const t = Number(e.target.value);
              locate(
                frames.length ? frames[nearestFrame(frames, t)].timestamp : t,
              );
            }}
          />
          <div className="flex justify-between text-[11px] text-slate-400">
            <span>{windowStart.toFixed(2)} 秒</span>
            <span>
              红：待裁剪　青：{tail ? "确认过程" : "上下文"}　绿线：
              {tail ? "最后活动" : "活动起点"}
            </span>
            <span>{windowEnd.toFixed(2)} 秒</span>
          </div>
          {valid && (
            <label className="flex items-center gap-2 text-xs">
              {tail ? "拖动裁剪起点" : "拖动裁剪终点"}
              <input
                aria-label={tail ? "拖动裁剪开始帧" : "拖动裁剪结束帧"}
                className="min-w-0 flex-1 accent-red-300"
                type="range"
                disabled={dirty}
                min={tail ? candidate!.removedFrames.start : 0}
                max={tail ? frames.length - 1 : candidate!.removedFrames.end}
                step={1}
                value={endFrame}
                onChange={(e) => {
                  stop();
                  onBoundary(Number(e.target.value));
                  seek(
                    frames[Number(e.target.value) + (tail ? 0 : 1)].timestamp,
                  );
                }}
              />
              <span>{endFrame} 帧</span>
            </label>
          )}
          <button
            className={btn}
            disabled={!canZoom}
            aria-pressed={zoom && canZoom}
            onClick={toggleZoom}
          >
            {!canZoom
              ? "当前区间已覆盖整个 episode"
              : zoom
                ? "显示整个 episode"
                : tail
                  ? "放大结尾区间"
                  : "放大开头区间"}
          </button>
          <span className="ml-2 text-xs text-slate-400" aria-live="polite">
            时间轴范围：{windowStart.toFixed(2)}–{windowEnd.toFixed(2)} 秒
            {zoom && canZoom ? "（局部放大）" : "（完整 episode）"}
          </span>
          {zoom && (currentTime < windowStart || currentTime > windowEnd) && (
            <p className="text-xs text-amber-200">
              播放位置已超出放大范围，可点击“显示整个 episode”查看完整进度。
            </p>
          )}
          {dirty && candidate && (
            <p className="text-xs text-amber-200">
              色带为上次检测结果，重新检测后可调整。
            </p>
          )}
        </div>
        {channel && frames.length > 0 && (
          <details open className="idle-review-evidence">
            <summary className="text-xs cursor-pointer">
              关键曲线与阈值（点击曲线定位）
            </summary>
            <select
              aria-label="关键曲线通道"
              value={selected}
              className="my-1 rounded bg-slate-800 text-xs p-1"
              onChange={(e) => onSelected(Number(e.target.value))}
            >
              {profile!.channels.map((c, i) => (
                <option key={c.name} value={i}>
                  {c.name}
                  {c.role === "gripper" ? " · 夹爪" : ""}
                </option>
              ))}
            </select>
            <svg
              viewBox="0 0 600 110"
              preserveAspectRatio="none"
              className="w-full h-24 cursor-crosshair"
              onClick={selectTime}
              role="img"
              aria-label={`${channel.name} 实际和指令变化曲线`}
            >
              <line
                x1="0"
                x2="600"
                y1={100 - (channel.stateSpeed / yMax) * 88}
                y2={100 - (channel.stateSpeed / yMax) * 88}
                stroke="#38bdf8"
                strokeDasharray="5 4"
              />
              <line
                x1="0"
                x2="600"
                y1={100 - (channel.actionActivity / yMax) * 88}
                y2={100 - (channel.actionActivity / yMax) * 88}
                stroke="#e879f9"
                strokeDasharray="2 3"
              />
              <polyline
                points={path("measured")}
                fill="none"
                stroke="#38bdf8"
                strokeWidth="1.5"
              />
              <polyline
                points={path("command")}
                fill="none"
                stroke="#e879f9"
                strokeWidth="1.5"
              />
              <line
                x1={x(currentTime) * 6}
                x2={x(currentTime) * 6}
                y1="0"
                y2="110"
                stroke="white"
              />
            </svg>
            <div className="text-xs flex flex-wrap gap-x-4">
              <span className="text-cyan-300">
                实际 {sample?.measured.toFixed(4)} / 阈值 {channel.stateSpeed}{" "}
                {channel.stateUnit}/秒
              </span>
              <span className="text-fuchsia-300">
                指令 {sample?.command.toFixed(4)} / 阈值{" "}
                {channel.actionActivity} {channel.actionUnit}
                {channel.actionMode === "absolute" ? "/秒" : ""}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              实线为变化量，虚线为当前阈值；完整轨迹曲线在下方展开。微小波动是否有任务价值仍需看视频。
            </p>
          </details>
        )}
      </div>
    );
  },
);

function lastKeptTime(frames: SignalFrame[], cuts: FrameInterval[]): number {
  let i = frames.length - 1;
  while (i >= 0) {
    const cut = cuts.find((c) => i >= c.start && i <= c.end);
    if (!cut) break;
    i = cut.start - 1;
  }
  return frames[Math.max(0, i)]?.timestamp ?? 0;
}
