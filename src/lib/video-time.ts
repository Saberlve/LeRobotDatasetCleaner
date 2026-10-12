import type { VideoInfo } from "@/types";

function interval(values: number[], time: number): number {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (values[mid] <= time) lo = mid + 1;
    else hi = mid;
  }
  return Math.max(0, Math.min(values.length - 2, lo - 1));
}

export function interpolateTime(
  from: number[],
  to: number[],
  time: number,
  clamp = true,
): number {
  if (from.length === 1) return to[0];
  if (clamp && time <= from[0]) return to[0];
  if (clamp && time >= from.at(-1)!) return to.at(-1)!;
  const i = interval(from, time);
  const span = from[i + 1] - from[i];
  if (span <= 0) return to[i];
  return to[i] + ((time - from[i]) / span) * (to[i + 1] - to[i]);
}

export function episodeToVideoTime(info: VideoInfo, time: number): number {
  if (info.timeMapping) {
    return interpolateTime(
      info.timeMapping.episodeTimestamps,
      info.timeMapping.videoTimestamps,
      time,
    );
  }
  return (info.isSegmented ? (info.segmentStart ?? 0) : 0) + time;
}

export function videoToEpisodeTime(info: VideoInfo, time: number): number {
  if (info.timeMapping) {
    return interpolateTime(
      info.timeMapping.videoTimestamps,
      info.timeMapping.episodeTimestamps,
      time,
    );
  }
  return time - (info.isSegmented ? (info.segmentStart ?? 0) : 0);
}

/** Average slope over a short window: preserve native motion without jittering
 * playbackRate at every irregular sensor sample. Drift is corrected separately. */
export function videoRateAt(info: VideoInfo, time: number): number {
  const map = info.timeMapping;
  if (!map || map.episodeTimestamps.length < 2) return 1;
  const start = Math.max(map.episodeTimestamps[0], time - 0.25);
  const end = Math.min(map.episodeTimestamps.at(-1)!, time + 0.25);
  if (end <= start) return 1;
  return (
    (episodeToVideoTime(info, end) - episodeToVideoTime(info, start)) /
    (end - start)
  );
}

/** Convert sensor samples using action anchors, including a possible pre-start
 * sample. Bigint nanosecond clocks are differenced before conversion to seconds. */
export function captureTimeMapping(
  clocks: Record<string, unknown>[],
  samples: Record<string, unknown>[],
  frameTimestamps: number[],
): VideoInfo["timeMapping"] {
  if (
    !clocks.length ||
    clocks.length !== frameTimestamps.length ||
    !samples.length
  )
    return undefined;
  const origin = clocks[0].action_send_start_ns;
  const relativeSeconds = (value: unknown) =>
    typeof value === "bigint" && typeof origin === "bigint"
      ? Number(value - origin) / 1e9
      : (Number(value) - Number(origin)) / 1e9;
  const anchors = clocks.map((r) => relativeSeconds(r.action_send_start_ns));
  if (
    !Number.isFinite(Number(origin)) ||
    anchors.some(
      (t, i) => !Number.isFinite(t) || (i > 0 && t <= anchors[i - 1]),
    ) ||
    frameTimestamps.some(
      (t, i) => !Number.isFinite(t) || (i > 0 && t <= frameTimestamps[i - 1]),
    )
  )
    return undefined;
  const episodeTimestamps: number[] = [];
  const videoTimestamps: number[] = [];
  for (const sample of samples) {
    const capture = relativeSeconds(sample.capture_monotonic_ns);
    const video = Number(sample.video_timestamp_s);
    if (!Number.isFinite(capture) || !Number.isFinite(video)) return undefined;
    const episode = interpolateTime(anchors, frameTimestamps, capture, false);
    if (
      episodeTimestamps.length &&
      (episode <= episodeTimestamps.at(-1)! || video <= videoTimestamps.at(-1)!)
    )
      return undefined;
    episodeTimestamps.push(episode);
    videoTimestamps.push(video);
  }
  return { episodeTimestamps, videoTimestamps };
}
