import { getEpisodeVideosInfo } from "@/app/[org]/[dataset]/[episode]/fetch-data";
import { detectInitialIdle } from "./detect";
import { loadEpisodeSignalFrames } from "./load";
import { inspectIdleSignals } from "./profile";
import { createTailVideoSampler } from "./tail-video";
import { detectTrailingIdle } from "./trailing";
import type {
  InitialIdleProfile,
  InitialIdleResult,
  SignalSchema,
} from "./types";

export type IdleEdge = "start" | "end";
export type BatchMode = IdleEdge | "both";
export type BatchEntry = {
  episodeId: number;
  edge: IdleEdge;
  profile: InitialIdleProfile;
  result?: InitialIdleResult;
  error?: string;
  reviewed?: boolean;
  retained?: boolean;
  acceptedFrames?: { start: number; end: number };
};
export function candidateInterval(entry: BatchEntry) {
  const suggested = entry.result?.candidate?.removedFrames;
  const accepted = entry.acceptedFrames;
  if (!suggested) return undefined;
  if (
    accepted &&
    Number.isSafeInteger(accepted.start) &&
    Number.isSafeInteger(accepted.end) &&
    accepted.start >= suggested.start &&
    accepted.end <= suggested.end &&
    accepted.start <= accepted.end
  )
    return accepted;
  return suggested;
}
export const batchStorageKey = (repoId: string) =>
  `lerobot-idle-batch:1:${repoId}`;
export const batchSelectionKey = (repoId: string) =>
  `lerobot-idle-selection:${repoId}`;

export function mergeBatchResults(
  previous: BatchEntry[],
  incoming: BatchEntry[],
) {
  const entries = new Map(
    previous.map((entry) => [`${entry.episodeId}:${entry.edge}`, entry]),
  );
  for (const entry of incoming) {
    const key = `${entry.episodeId}:${entry.edge}`;
    const old = entries.get(key);
    const signature = (value: BatchEntry) =>
      JSON.stringify([value.profile, value.result, value.error]);
    entries.set(
      key,
      old && signature(old) === signature(entry)
        ? old
        : { ...entry, reviewed: false },
    );
  }
  return [...entries.values()];
}

export function selectBatchEpisodes(
  episodes: number[],
  start: number,
  count: number,
) {
  const ordered = [...new Set(episodes)].sort((a, b) => a - b);
  const offset = ordered.indexOf(start);
  if (offset < 0 || !Number.isSafeInteger(count) || count < 1)
    throw new Error("请选择有效的起始 episode，检测数量必须为正整数。");
  return ordered.slice(offset, offset + count);
}

/** Sequential, bounded decoder use. Each edge fails independently; never writes clips. */
export async function runIdleBatch(input: {
  repoId: string;
  episodes: number[];
  mode: BatchMode;
  profiles: Record<IdleEdge, InitialIdleProfile | null>;
  schema: SignalSchema;
  signal: AbortSignal;
  onProgress: (message: string) => void;
  onResult: (entry: BatchEntry) => void;
}) {
  const edges: IdleEdge[] =
    input.mode === "both" ? ["start", "end"] : [input.mode];
  // Freeze settings at start, so edits cannot change a running batch midway.
  const profiles = JSON.parse(
    JSON.stringify(input.profiles),
  ) as typeof input.profiles;
  for (const edge of edges) {
    if (
      !profiles[edge] ||
      !inspectIdleSignals(input.schema, profiles[edge]!).ready
    )
      throw new Error(
        `${edge === "start" ? "开头" : "结尾"}检测参数无效，请先配置。`,
      );
  }
  for (const [offset, episodeId] of input.episodes.entries()) {
    for (const edge of edges) {
      input.signal.throwIfAborted();
      const profile = profiles[edge]!;
      const label = `Episode ${episodeId} · ${edge === "start" ? "开头" : "结尾"}（${offset + 1}/${input.episodes.length}）`;
      input.onProgress(`正在检测 ${label}`);
      try {
        const frames = await loadEpisodeSignalFrames(
          input.repoId,
          episodeId,
          profile,
        );
        input.signal.throwIfAborted();
        let result: InitialIdleResult;
        if (edge === "start") result = detectInitialIdle(frames, profile);
        else {
          const videos = await getEpisodeVideosInfo(input.repoId, episodeId);
          input.signal.throwIfAborted();
          const decoder = createTailVideoSampler(
            videos,
            input.schema.fps,
            input.signal,
          );
          try {
            result = await detectTrailingIdle(
              frames,
              profile,
              input.schema.fps,
              decoder.sample,
              (done, total) =>
                input.onProgress(`${label} · 视频核对 ${done}/${total} 帧`),
              input.signal,
            );
          } finally {
            decoder.dispose();
          }
        }
        input.signal.throwIfAborted();
        input.onResult({ episodeId, edge, profile, result });
      } catch (error) {
        input.signal.throwIfAborted();
        input.onResult({
          episodeId,
          edge,
          profile,
          error: error instanceof Error ? error.message : "检测失败",
        });
      }
      // Yield to the UI between episodes, including cache-hit leading-only runs.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
}
