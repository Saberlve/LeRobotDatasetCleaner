"use client";

import { useFrameShortcuts, useFrameStep } from "@/lib/playback-shortcuts";
import { useTime } from "@/context/time-context";

export function FramePlaybackShortcuts({
  timestamps,
  fps,
}: {
  timestamps?: number[];
  fps: number;
}) {
  const { step } = useFrameStep({ timestamps, fps });
  const { currentTime, duration, isPlaying, setIsPlaying, seek } = useTime();
  useFrameShortcuts(step, () => {
    if (!isPlaying && currentTime >= (timestamps?.at(-1) ?? duration)) seek(0);
    setIsPlaying(!isPlaying);
  });
  return null;
}
