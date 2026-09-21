import { idleResult } from "./detect";
import { profileIssues } from "./profile";
import type {
  InitialIdleProfile,
  InitialIdleResult,
  SignalFrame,
} from "./types";

export const DEFAULT_TAIL_VISUAL = { mean: 0.012, fraction: 0.01, pixel: 0.06 };
export type VisualSample = { camera: string; pixels: Uint8ClampedArray }[];
export type VisualSampler = (frame: SignalFrame) => Promise<VisualSample>;
const result = (
  status: InitialIdleResult["status"],
  reason: string,
): InitialIdleResult => ({
  ...idleResult(status, reason),
  detectorVersion: "trailing-idle/1",
});
const difference = (a: number, b: number, period?: number) => {
  const d = a - b;
  return period === undefined
    ? d
    : ((((d + period / 2) % period) + period) % period) - period / 2;
};

/** RGB mean difference and fraction of changed pixels; alpha is ignored. */
export function imageDifference(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  pixel: number,
) {
  if (!a.length || a.length !== b.length || a.length % 4)
    throw new Error("视频帧尺寸不一致");
  let total = 0,
    changed = 0;
  for (let i = 0; i < a.length; i += 4) {
    const d =
      (Math.abs(a[i] - b[i]) +
        Math.abs(a[i + 1] - b[i + 1]) +
        Math.abs(a[i + 2] - b[i + 2])) /
      (3 * 255);
    total += d;
    if (d > pixel) changed++;
  }
  return { mean: total / (a.length / 4), fraction: changed / (a.length / 4) };
}

/** Reverse scan on original frames; no writes and no inference of task success. */
export async function detectTrailingIdle(
  frames: readonly SignalFrame[],
  profile: InitialIdleProfile,
  fps: number,
  sample: VisualSampler,
  progress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<InitialIdleResult> {
  if (profileIssues(profile).length || !Number.isFinite(fps) || fps <= 0)
    return result("needs_review", "invalid_profile");
  if (frames.length < 3) return result("needs_review", "insufficient_frames");
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    if (f.frameIndex !== i || !Number.isFinite(f.timestamp) || f.timestamp < 0)
      return result("needs_review", "invalid_frame_identity_or_timestamp");
    if (
      ![f.state, f.action].every(
        (v) =>
          Array.isArray(v) &&
          v.length === profile.channels.length &&
          v.every(Number.isFinite),
      )
    )
      return result("needs_review", "missing_or_invalid_signal");
    if (
      i &&
      (f.timestamp <= frames[i - 1].timestamp ||
        f.timestamp - frames[i - 1].timestamp > profile.maxGapSeconds + 1e-6)
    )
      return result("needs_review", "timestamp_gap_or_disorder");
  }
  const last = frames.length - 1;
  const travels = profile.channels.map(() => ({
    s: 0,
    a: 0,
    sMin: 0,
    sMax: 0,
    aMin: 0,
    aMax: 0,
  }));
  let onset = 0;
  let evidence: string[] = [];
  let source: NonNullable<InitialIdleResult["candidate"]>["activitySource"] =
    "motion";
  for (let i = last; i >= 0; i--) {
    const current = frames[i];
    const previous = frames[Math.max(0, i - 1)];
    const dt = i ? current.timestamp - previous.timestamp : 1;
    const changes: string[] = [];
    let drift = false;
    for (const [k, c] of profile.channels.entries()) {
      const ds = i
        ? difference(
            current.state[c.stateIndex],
            previous.state[c.stateIndex],
            c.period,
          )
        : 0;
      const da =
        c.actionMode === "absolute"
          ? i
            ? difference(
                current.action[c.actionIndex],
                previous.action[c.actionIndex],
                c.period,
              )
            : 0
          : current.action[c.actionIndex];
      if (
        c.trackingError !== undefined &&
        Math.abs(
          difference(
            current.action[c.actionIndex],
            current.state[c.stateIndex],
            c.period,
          ),
        ) > c.trackingError
      )
        return result("needs_review", "target_tracking_error_during_wait");
      if (Math.abs(ds) / dt > c.stateSpeed)
        changes.push(`${c.name}: measured motion`);
      if (
        Math.abs(da) / (c.actionMode === "absolute" ? dt : 1) >
        c.actionActivity
      )
        changes.push(`${c.name}: command activity`);
      const t = travels[k];
      t.s += ds;
      t.a += c.actionMode === "absolute" ? da : 0;
      t.sMin = Math.min(t.sMin, t.s);
      t.sMax = Math.max(t.sMax, t.s);
      t.aMin = Math.min(t.aMin, t.a);
      t.aMax = Math.max(t.aMax, t.a);
      if (
        t.sMax - t.sMin > c.stateExcursion ||
        (c.actionMode === "absolute" && t.aMax - t.aMin > c.actionExcursion!)
      )
        drift = true;
    }
    if (changes.length) {
      onset = i;
      evidence = changes;
      break;
    }
    if (drift) return result("needs_review", "slow_accumulated_motion");
  }
  const end = frames[last].timestamp + 1 / fps;
  if (
    end - frames[onset].timestamp <
    profile.contextSeconds + profile.minIdleSeconds
  )
    return result("no_candidate", "insufficient_trailing_wait_after_context");
  const threshold = profile.tailVisual ?? DEFAULT_TAIL_VISUAL;
  try {
    signal?.throwIfAborted();
    const anchor = await sample(frames[last]);
    if (!anchor.length) throw new Error("没有可读取的视频");
    let next = anchor;
    for (let i = last - 1; i >= onset; i--) {
      signal?.throwIfAborted();
      const current = await sample(frames[i]);
      if (current.length !== anchor.length) throw new Error("视频通道缺失");
      const changes: string[] = [];
      current.forEach((camera, k) => {
        if (camera.camera !== anchor[k].camera)
          throw new Error("视频通道不一致");
        const adjacent = imageDifference(
          camera.pixels,
          next[k].pixels,
          threshold.pixel,
        );
        const cumulative = imageDifference(
          camera.pixels,
          anchor[k].pixels,
          threshold.pixel,
        );
        if (
          [adjacent, cumulative].some(
            (d) => d.mean > threshold.mean || d.fraction > threshold.fraction,
          )
        )
          changes.push(`视频 ${camera.camera}: 画面变化`);
      });
      progress?.(last - i, last - onset);
      if (changes.length) {
        onset = i + 1;
        evidence = changes;
        source = "visual";
        break;
      }
      next = current;
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    return {
      ...result("needs_review", "tail_video_unavailable"),
      warnings: [error instanceof Error ? error.message : "视频读取失败"],
    };
  }
  if (!evidence.length) return result("needs_review", "no_confirmed_end");
  // Retain the sample at/after the confirmation deadline as well as the boundary.
  let keepThrough = onset;
  while (
    keepThrough < last &&
    frames[keepThrough].timestamp + 1e-9 <
      frames[onset].timestamp + profile.contextSeconds
  )
    keepThrough++;
  const start = keepThrough + 1;
  if (
    start > last ||
    end - frames[start].timestamp + 1e-9 < profile.minIdleSeconds
  )
    return result("no_candidate", "insufficient_trailing_wait_after_context");
  return {
    ...result("candidate", "trailing_multimodal_low_activity"),
    warnings: [
      "低变化不代表任务完成；接触保持、物体稳定和任务成功必须人工确认。",
    ],
    candidate: {
      removedFrames: { start, end: last },
      removedTime: {
        start: frames[start].timestamp,
        endExclusive: end,
        duration: end - frames[start].timestamp,
      },
      activityFrame: onset,
      activityTimestamp: frames[onset].timestamp,
      activitySource: source,
      retainedContextSeconds: frames[start].timestamp - frames[onset].timestamp,
      evidence,
      reviewStatus: "pending",
    },
  };
}
