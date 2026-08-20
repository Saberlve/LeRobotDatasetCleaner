export type FrameInterval = { start: number; end: number };
export type EpisodeClipMap = Record<number, FrameInterval[]>;

/** Convert user supplied inclusive frame intervals into a safe canonical form. */
export function normalizeFrameIntervals(
  intervals: FrameInterval[] | undefined,
  frameCount: number,
): FrameInterval[] {
  if (!Number.isInteger(frameCount) || frameCount <= 0) {
    throw new Error("Episode must contain at least one frame");
  }
  const sorted = (intervals ?? [])
    .map(({ start, end }) => {
      if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 0 ||
        end < start ||
        end >= frameCount
      ) {
        throw new Error(
          `Invalid clip interval [${start}, ${end}] for ${frameCount} frames`,
        );
      }
      return { start, end };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: FrameInterval[] = [];
  for (const interval of sorted) {
    const previous = merged.at(-1);
    if (previous && interval.start <= previous.end + 1)
      previous.end = Math.max(previous.end, interval.end);
    else merged.push({ ...interval });
  }
  const removed = merged.reduce(
    (sum, interval) => sum + interval.end - interval.start + 1,
    0,
  );
  if (removed >= frameCount)
    throw new Error("A clip cannot remove every frame in an episode");
  return merged;
}

export function retainedFrameIndexes(
  frameCount: number,
  removed: FrameInterval[],
): number[] {
  const indexes: number[] = [];
  let interval = 0;
  for (let frame = 0; frame < frameCount; frame += 1) {
    while (interval < removed.length && removed[interval].end < frame)
      interval += 1;
    if (
      !removed[interval] ||
      frame < removed[interval].start ||
      frame > removed[interval].end
    )
      indexes.push(frame);
  }
  return indexes;
}
