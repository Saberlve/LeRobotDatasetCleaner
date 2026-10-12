import { useEffect, useRef } from "react";
import { useTime } from "@/context/time-context";
import type { FrameInterval } from "@/server/dataset-export/clips";

export function isPlaybackTextEntry(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      !!target.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
      ))
  );
}

export function adjacentEpisode(
  episodes: readonly number[],
  episodeId: number,
  direction: -1 | 1,
): number | undefined {
  const index = episodes.indexOf(episodeId);
  return index < 0 ? undefined : episodes[index + direction];
}

export function nearestTimestampIndex(
  timestamps: readonly number[],
  time: number,
) {
  let low = 0;
  let high = timestamps.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (timestamps[mid] < time) low = mid + 1;
    else high = mid;
  }
  return low > 0 && time - timestamps[low - 1] < timestamps[low] - time
    ? low - 1
    : low;
}

/** Read synchronous time reports so rapid key repeats never reuse an old frame. */
export function useFrameStep({
  timestamps,
  fps = 30,
  cuts = [],
  beforeStep,
}: {
  timestamps?: readonly number[];
  fps?: number;
  cuts?: readonly FrameInterval[];
  beforeStep?: () => void;
}) {
  const { currentTime, getCurrentTime, duration, seek, setIsPlaying } =
    useTime();
  const rate = Number.isFinite(fps) && fps > 0 ? fps : 30;
  const count = timestamps?.length || Math.max(1, Math.ceil(duration * rate));
  const indexAt = (t: number) =>
    timestamps?.length
      ? nearestTimestampIndex(timestamps, t)
      : Math.max(0, Math.min(count - 1, Math.round(t * rate)));

  return {
    frameIndex: indexAt(currentTime),
    frameCount: count,
    step(direction: -1 | 1) {
      beforeStep?.();
      setIsPlaying(false);
      let index = Math.max(
        0,
        Math.min(count - 1, indexAt(getCurrentTime()) + direction),
      );
      while (
        index >= 0 &&
        index < count &&
        cuts.some((cut) => index >= cut.start && index <= cut.end)
      ) {
        index += direction;
      }
      if (index >= 0 && index < count) {
        seek(timestamps?.length ? timestamps[index] : index / rate);
      }
    },
  };
}

export function useFrameShortcuts(
  step: (direction: -1 | 1) => void,
  togglePlay?: () => void,
) {
  usePlayShortcut(togglePlay);
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        isPlaybackTextEntry(event.target)
      )
        return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      // Browser key repeat provides continuous stepping until the key is released.
      stepRef.current(event.key === "ArrowLeft" ? -1 : 1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

/** Only the active player's owner supplies a callback. */
export function usePlayShortcut(togglePlay?: () => void) {
  const togglePlayRef = useRef(togglePlay);
  togglePlayRef.current = togglePlay;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== " " ||
        !togglePlayRef.current ||
        event.defaultPrevented ||
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        isPlaybackTextEntry(event.target) ||
        (event.target instanceof HTMLElement &&
          event.target.closest("button, a[href]"))
      )
        return;
      event.preventDefault();
      if (!event.repeat) togglePlayRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

export function useEpisodeShortcuts(state: {
  episodes: readonly number[];
  episodeId: number;
  onSelect: (episodeId: number) => void;
}) {
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        isPlaybackTextEntry(event.target)
      )
        return;
      if (!["ArrowUp", "ArrowDown", "PageUp", "PageDown"].includes(event.key))
        return;
      event.preventDefault();
      if (event.repeat) return;
      const { episodes, episodeId, onSelect } = stateRef.current;
      const next = adjacentEpisode(
        episodes,
        episodeId,
        event.key === "ArrowDown" || event.key === "PageDown" ? 1 : -1,
      );
      if (next !== undefined) onSelect(next);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
