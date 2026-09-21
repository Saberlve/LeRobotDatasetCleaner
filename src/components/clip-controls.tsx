"use client";
import { useState } from "react";
import { useTime } from "@/context/time-context";
import { useClipDrafts } from "@/context/clip-drafts-context";
import { normalizeFrameIntervals } from "@/server/dataset-export/clips";

export function ClipControls({
  episodeId,
  fps,
  enabled,
  frameTimestamps,
}: {
  episodeId: number;
  fps: number;
  enabled: boolean;
  frameTimestamps?: number[];
}) {
  const { currentTime, duration } = useTime();
  const { drafts, setInterval, removeInterval } = useClipDrafts();
  const [start, setStart] = useState<number | null>(null);
  const [error, setError] = useState("");
  if (!enabled)
    return (
      <p className="text-xs text-slate-500">
        剪辑仅支持本地 LeRobot v3.0 数据集。
      </p>
    );
  const approximateFrame = Math.min(
    Math.max(0, Math.round(currentTime * fps)),
    Math.max(0, Math.round(duration * fps) - 1),
  );
  const frame = frameTimestamps?.length
    ? frameTimestamps.reduce(
        (best, time, i) =>
          Math.abs(time - currentTime) <
          Math.abs(frameTimestamps[best] - currentTime)
            ? i
            : best,
        0,
      )
    : approximateFrame;
  const intervals = drafts[episodeId] ?? [];
  return (
    <div className="mt-3 rounded-md border border-white/10 bg-[var(--surface-0)]/60 p-2 text-xs text-slate-300 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-slate-400">手工标记裁剪（原始帧 {frame}）</span>
        <button
          className="rounded bg-white/10 px-2 py-1 hover:bg-white/15"
          onClick={() => setStart(frame)}
        >
          {start == null ? "设为起点" : `起点 ${start}`}
        </button>
        <button
          disabled={start == null}
          className="rounded bg-cyan-500/80 px-2 py-1 text-slate-950 disabled:bg-slate-700"
          onClick={() => {
            if (start != null) {
              const interval = {
                start: Math.min(start, frame),
                end: Math.max(start, frame),
              };
              try {
                normalizeFrameIntervals(
                  [...intervals, interval],
                  frameTimestamps?.length ??
                    Math.max(1, Math.round(duration * fps)),
                );
                setInterval(episodeId, interval);
                setError("");
              } catch {
                setError("区间无效：不能标记整段删除，至少保留一帧。");
                return;
              }
              setStart(null);
            }
          }}
        >
          标记此段裁剪
        </button>
      </div>
      {error && (
        <p role="alert" className="text-red-300">
          {error}
        </p>
      )}
      <p className="text-slate-400">
        以下区间待导出；点击区间可撤销，原数据尚未删除。
      </p>
      {intervals.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {intervals.map((item, index) => (
            <button
              key={`${item.start}-${item.end}`}
              onClick={() => removeInterval(episodeId, index)}
              className="rounded border border-red-400/30 px-1.5 py-0.5 text-red-200"
            >
              撤销 {item.start}–{item.end} 帧 ×
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
