import type { SignalFrame, IdleChannel } from "./types";
import type { FrameInterval } from "@/server/dataset-export/clips";

export function nearestFrame(
  frames: readonly SignalFrame[],
  time: number,
): number {
  if (!frames.length) return 0;
  let low = 0,
    high = frames.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (frames[mid].timestamp < time) low = mid + 1;
    else high = mid;
  }
  return low > 0 &&
    time - frames[low - 1].timestamp < frames[low].timestamp - time
    ? low - 1
    : low;
}

/** End-exclusive cut times; retained boundary itself must not be skipped. */
export function skipRemoved(
  frames: readonly SignalFrame[],
  cuts: FrameInterval[],
  time: number,
): number | null {
  for (const cut of cuts) {
    const start = frames[cut.start]?.timestamp;
    const after = frames[cut.end + 1]?.timestamp;
    if (
      start !== undefined &&
      time >= start &&
      (after === undefined || time < after)
    )
      return after ?? null;
  }
  return time;
}

export function channelActivity(
  frames: readonly SignalFrame[],
  channel: IdleChannel,
) {
  const delta = (a: number, b: number) => {
    const d = a - b,
      p = channel.period;
    return p === undefined ? d : ((((d + p / 2) % p) + p) % p) - p / 2;
  };
  return frames.map((frame, i) => {
    const previous = frames[Math.max(0, i - 1)];
    const dt = frame.timestamp - previous.timestamp;
    return {
      time: frame.timestamp,
      measured:
        dt > 0
          ? Math.abs(
              delta(
                frame.state[channel.stateIndex],
                previous.state[channel.stateIndex],
              ),
            ) / dt
          : 0,
      command:
        channel.actionMode === "absolute"
          ? dt > 0
            ? Math.abs(
                delta(
                  frame.action[channel.actionIndex],
                  previous.action[channel.actionIndex],
                ),
              ) / dt
            : 0
          : Math.abs(frame.action[channel.actionIndex]),
    };
  });
}

export type ReviewDecision = {
  status: "retained" | "queued";
  note: string;
  updatedAt: string;
  interval?: FrameInterval;
};
export const reviewStorageKey = (repoId: string, episodeId: number) =>
  `lerobot-idle-review:1:${repoId}:${episodeId}`;
export function readDecision(
  storage: Pick<Storage, "getItem">,
  key: string,
): ReviewDecision | null {
  try {
    const v = JSON.parse(storage.getItem(key) ?? "null");
    if (
      !v ||
      !["retained", "queued"].includes(v.status) ||
      typeof v.note !== "string" ||
      typeof v.updatedAt !== "string"
    )
      return null;
    if (
      v.status === "queued" &&
      (!Number.isInteger(v.interval?.start) ||
        !Number.isInteger(v.interval?.end) ||
        v.interval.start < 0 ||
        v.interval.end < v.interval.start)
    )
      return null;
    return v;
  } catch {
    return null;
  }
}
