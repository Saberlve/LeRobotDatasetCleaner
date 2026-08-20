"use client";
import { useState } from "react";
import { useTime } from "@/context/time-context";
import { useClipDrafts } from "@/context/clip-drafts-context";

export function ClipControls({
  episodeId,
  fps,
  enabled,
}: {
  episodeId: number;
  fps: number;
  enabled: boolean;
}) {
  const { currentTime, duration } = useTime();
  const { drafts, setInterval, removeInterval } = useClipDrafts();
  const [start, setStart] = useState<number | null>(null);
  if (!enabled)
    return (
      <p className="text-xs text-slate-500">
        剪辑仅支持本地 LeRobot v3.0 数据集。
      </p>
    );
  const frame = Math.min(
    Math.max(0, Math.round(currentTime * fps)),
    Math.max(0, Math.round(duration * fps) - 1),
  );
  const intervals = drafts[episodeId] ?? [];
  return (
    <div className="mt-3 rounded-md border border-white/10 bg-[var(--surface-0)]/60 p-2 text-xs text-slate-300 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-slate-400">剪辑（帧 {frame}）</span>
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
              setInterval(episodeId, {
                start: Math.min(start, frame),
                end: Math.max(start, frame),
              });
              setStart(null);
            }
          }}
        >
          设为终点并删除
        </button>
      </div>
      {intervals.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {intervals.map((item, index) => (
            <button
              key={`${item.start}-${item.end}`}
              onClick={() => removeInterval(episodeId, index)}
              className="rounded border border-red-400/30 px-1.5 py-0.5 text-red-200"
            >
              删 {item.start}–{item.end} ×
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
