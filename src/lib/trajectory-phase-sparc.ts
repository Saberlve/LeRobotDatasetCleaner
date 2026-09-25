import {
  bezierFit,
  computePsd,
  continuousSegments,
  dtwPositionDistance,
  exactSpectrum,
  partitionTrajectoryPhases,
  positionScale,
  quantile,
  speeds,
  trajectoryFingerprint,
  uniformPositions,
  type PhaseTedResult,
  type TrajectorySample,
} from "./trajectory-smoothness";

/** Fixed signal-processing choices, not fitted to episode IDs or human labels.
 * SPARC follows Balasubramanian 2015 / siva82kb/smoothness. The segmentation,
 * position-only TED and relative display score are project choices. */
export const PHASE_SPARC_CONFIG = {
  padLevel: 4,
  amplitudeThreshold: 0.05,
  maximumFrequency: 10,
  minimumPhaseSeconds: 1,
  minimumIntervals: 15,
  activityContextSeconds: 0.6,
  minimumQuietSeconds: 0.8,
  noiseMultiplier: 8,
  minimumCoverage: 0.8,
  diagnosticWindowSeconds: 2,
  tedPenaltyWeight: 0.2,
} as const;

export type SparcResult = { value: number | null; cutoffHz: number | null };

/** Nonnegative scalar speed, normalized by DC (also the spectrum maximum).
 * Padding samples the spectrum more densely; it never raises the Nyquist limit.
 * No logarithm, taper or data smoothing is applied to the scored speed signal. */
export function computeSparcSpeed(
  speed: number[],
  sampleRate: number,
): SparcResult {
  const empty = { value: null, cutoffHz: null };
  if (
    speed.length < 8 ||
    !Number.isFinite(sampleRate) ||
    sampleRate <= 0 ||
    speed.some((v) => !Number.isFinite(v) || v < 0)
  )
    return empty;
  const dc = speed.reduce((a, b) => a + b, 0);
  if (!(dc > 0)) return empty;
  const n =
    2 ** (Math.ceil(Math.log2(speed.length)) + PHASE_SPARC_CONFIG.padLevel);
  if (n > 1048576) return empty;
  const { real, imag } = exactSpectrum([
    ...speed,
    ...Array(n - speed.length).fill(0),
  ]);
  const maximumBin = Math.min(
    n / 2,
    Math.floor((PHASE_SPARC_CONFIG.maximumFrequency * n) / sampleRate),
  );
  const amplitude = Array.from(
    { length: maximumBin + 1 },
    (_, k) => Math.hypot(real[k], imag[k]) / dc,
  );
  let last = maximumBin;
  while (last > 0 && amplitude[last] < PHASE_SPARC_CONFIG.amplitudeThreshold)
    last--;
  if (!last) return empty;
  let value = 0;
  for (let k = 1; k <= last; k++)
    value -= Math.hypot(1 / last, amplitude[k] - amplitude[k - 1]);
  return { value, cutoffHz: (last * sampleRate) / n };
}

export type MotionPhase = {
  id: number;
  start: number;
  end: number;
  group: string;
  name: string;
  status: "scored" | "low_signal" | "short";
  sparc: number | null;
  cutoffHz: number | null;
  ted: number | null;
  extent: number;
};
export type SparcWindow = {
  start: number;
  end: number;
  value: number;
  kind: "local" | "boundary";
};
export type PhaseGroup = {
  key: string;
  name: string;
  sparc: number;
  ted: number;
  seconds: number;
  phaseCount: number;
  referenceCount: number;
  sparcQuality: number | null;
  tedQuality: number | null;
};
export type PhaseSmoothnessRaw = {
  episodeIndex: number;
  fingerprint: string;
  startTime: number;
  sparc: number | null;
  ted: number | null;
  psd: number | null;
  phases: MotionPhase[];
  groups: PhaseGroup[];
  windows: SparcWindow[];
  phaseSource: PhaseTedResult["phaseSource"];
  noiseEstimate: number | null;
  motionFloor: number;
  motionSeconds: number;
  scoredSeconds: number;
  coverage: number;
  validFraction: number;
  warnings: string[];
};
export type TrajectorySmoothnessEpisode = PhaseSmoothnessRaw & {
  sparcQuality: number | null;
  tedQuality: number | null;
  score: number | null;
  label: "排名较高" | "排名居中" | "排名偏低" | "不可评分";
};

const norm = (a: number[], b: number[]) =>
  Math.hypot(...a.map((v, i) => v - b[i]));

/** Estimate positional noise only from one-second low-drift blocks whose
 * speed is <10% of the episode's P90 speed. This is an estimate, not sensor
 * calibration; without a distinct quiet regime we report no estimate. */
function estimateNoise(segments: TrajectorySample[][]): number | null {
  const fast = quantile(segments.flatMap(speeds), 0.9) ?? 0;
  if (!(fast > 0)) return null;
  const estimates: number[] = [];
  for (const s of segments) {
    if (s.length < 8) continue;
    const dt = quantile(
      s.slice(1).map((v, i) => v.timestamp - s[i].timestamp),
      0.5,
    )!;
    const count = Math.max(8, Math.round(1 / dt));
    for (
      let i = 0;
      i + count < s.length;
      i += Math.max(1, Math.round(count / 2))
    ) {
      const block = s.slice(i, i + count + 1);
      if ((quantile(speeds(block), 0.5) ?? Infinity) > fast * 0.1) continue;
      // Reject steadily moving blocks even when slow.
      const extent = positionScale(block);
      if (
        norm(block[0].position, block[block.length - 1].position) >
        extent * 0.5
      )
        continue;
      const sigma = [0, 1, 2].map((axis) => {
        const residual = block
          .slice(2)
          .map(
            (p, j) =>
              p.position[axis] -
              2 * block[j + 1].position[axis] +
              block[j].position[axis],
          );
        const center = quantile(residual, 0.5) ?? 0;
        return (
          (quantile(
            residual.map((v) => Math.abs(v - center)),
            0.5,
          ) ?? 0) /
          (0.67448975 * Math.sqrt(6))
        );
      });
      estimates.push(Math.hypot(...sigma));
    }
  }
  return estimates.length >= 2 ? quantile(estimates, 0.5) : null;
}

/** Context extent retains direction reversals; speed magnitude alone could
 * miss them. Only sustained quiet splits motion. No spectral dip creates a
 * phase boundary, so shaking is not broken into individual oscillations. */
function activityMask(s: TrajectorySample[], floor: number): boolean[] {
  const half = PHASE_SPARC_CONFIG.activityContextSeconds / 2;
  let left = 0,
    right = 0;
  const active = s.map((sample, i) => {
    while (left < i && s[left].timestamp < sample.timestamp - half) left++;
    while (
      right + 1 < s.length &&
      s[right + 1].timestamp <= sample.timestamp + half
    )
      right++;
    return positionScale(s.slice(left, right + 1)) > floor;
  });
  for (let i = 0; i < active.length; ) {
    if (active[i]) {
      i++;
      continue;
    }
    let j = i + 1;
    while (j < active.length && !active[j]) j++;
    if (
      i > 0 &&
      j < active.length &&
      s[j].timestamp - s[i].timestamp < PHASE_SPARC_CONFIG.minimumQuietSeconds
    )
      active.fill(true, i, j);
    i = j;
  }
  return active;
}

function average(phases: MotionPhase[], field: "sparc" | "ted"): number | null {
  const valid = phases.filter(
    (p) => p.status === "scored" && p[field] !== null,
  );
  const duration = valid.reduce((sum, p) => sum + p.end - p.start, 0);
  return duration > 0
    ? valid.reduce((sum, p) => sum + p[field]! * (p.end - p.start), 0) /
        duration
    : null;
}

export function computePhaseSmoothness(
  episodeIndex: number,
  samples: TrajectorySample[],
): PhaseSmoothnessRaw {
  const segments = continuousSegments(samples);
  const valid = segments.flat();
  const noiseEstimate = estimateNoise(segments);
  const extent = positionScale(valid);
  // Unit-invariant numerical fallback; a measured quiet-noise floor is preferred.
  const motionFloor = Math.max(
    PHASE_SPARC_CONFIG.noiseMultiplier * (noiseEstimate ?? 0),
    extent * 1e-4,
    Number.EPSILON * 32,
  );
  const events = partitionTrajectoryPhases(samples);
  const eventTimes = new Set(events.phases.map((p) => p[0].timestamp));
  const grippers = valid.map((s) => s.gripper ?? 0);
  const gripMid =
    ((quantile(grippers, 0.05) ?? 0) + (quantile(grippers, 0.95) ?? 0)) / 2;
  const phases: MotionPhase[] = [];
  const windows: SparcWindow[] = [];
  for (const segment of segments) {
    if (segment.length < 2) continue;
    const dt = quantile(
      segment.slice(1).map((s, i) => s.timestamp - segment[i].timestamp),
      0.5,
    )!;
    const active = activityMask(segment, motionFloor);
    const boundaries = [0];
    for (let i = 1; i < segment.length - 1; i++)
      if (active[i] !== active[i - 1] || eventTimes.has(segment[i].timestamp))
        boundaries.push(i);
    boundaries.push(segment.length - 1);
    const segmentPhases: MotionPhase[] = [];
    for (let b = 1; b < boundaries.length; b++) {
      const a = boundaries[b - 1],
        z = boundaries[b];
      const raw = segment.slice(a, z + 1);
      const start = raw[0].timestamp,
        end = raw[raw.length - 1].timestamp;
      const group =
        events.source === "contact"
          ? `contact:${Number(raw[0].contact)}`
          : events.source === "gripper"
            ? `gripper:${Number((raw[0].gripper ?? 0) > gripMid)}`
            : "motion";
      const name =
        events.source === "contact"
          ? raw[0].contact
            ? "接触状态"
            : "非接触状态"
          : events.source === "gripper"
            ? (raw[0].gripper ?? 0) > gripMid
              ? "夹爪高位"
              : "夹爪低位"
            : "运动阶段";
      const intervals = Math.round((end - start) / dt);
      let status: MotionPhase["status"] = !active[a]
        ? "low_signal"
        : end - start < PHASE_SPARC_CONFIG.minimumPhaseSeconds ||
            intervals < PHASE_SPARC_CONFIG.minimumIntervals ||
            intervals > 32768
          ? "short"
          : "scored";
      const uniform =
        status === "scored" ? uniformPositions(raw, start, end, intervals) : [];
      const sparc = uniform.length
        ? computeSparcSpeed(speeds(uniform), intervals / (end - start))
        : { value: null, cutoffHz: null };
      // One endpoint-constrained cubic per event phase. No residual-driven
      // refinement: anomalous corrections cannot buy more fitting parameters.
      const ted = uniform.length
        ? (dtwPositionDistance(
            uniform,
            bezierFit(uniform),
            Math.max(positionScale(uniform), motionFloor),
          )?.value ?? null)
        : null;
      if (status === "scored" && (sparc.value === null || ted === null))
        status = "short";
      const phase: MotionPhase = {
        id: phases.length,
        start,
        end,
        group,
        name,
        status,
        sparc: sparc.value,
        cutoffHz: sparc.cutoffHz,
        ted,
        extent: positionScale(raw),
      };
      phases.push(phase);
      segmentPhases.push(phase);
    }
    // Local and boundary-crossing windows are diagnostic only. They never
    // enter the primary score or masquerade as independent validation samples.
    const seconds = PHASE_SPARC_CONFIG.diagnosticWindowSeconds;
    const first = segment[0].timestamp,
      last = segment[segment.length - 1].timestamp;
    const starts = new Map<number, SparcWindow["kind"]>();
    const add = (start: number, kind: SparcWindow["kind"]) => {
      if (start < first || start + seconds > last) return;
      const key = Math.round((start - first) / dt);
      if (kind === "boundary" || !starts.has(key)) starts.set(key, kind);
    };
    for (let start = first; start + seconds <= last; start += seconds / 2)
      add(start, "local");
    add(last - seconds, "local");
    for (const p of segmentPhases.slice(1))
      add(p.start - seconds / 2, "boundary");
    const count = Math.round(seconds / dt);
    if (count >= 8 && count <= 32768)
      for (const [offset, kind] of starts) {
        const start = first + offset * dt,
          end = Math.min(start + seconds, last);
        const window = uniformPositions(segment, start, end, count);
        if (positionScale(window) <= motionFloor) continue;
        const result = computeSparcSpeed(speeds(window), count / (end - start));
        if (result.value !== null)
          windows.push({ start, end, value: result.value, kind });
      }
  }
  const groups: PhaseGroup[] = [];
  for (const key of new Set(
    phases.filter((p) => p.status === "scored").map((p) => p.group),
  )) {
    const ps = phases.filter((p) => p.group === key && p.status === "scored");
    groups.push({
      key,
      name: ps[0].name,
      sparc: average(ps, "sparc")!,
      ted: average(ps, "ted")!,
      seconds: ps.reduce((s, p) => s + p.end - p.start, 0),
      phaseCount: ps.length,
      referenceCount: 0,
      sparcQuality: null,
      tedQuality: null,
    });
  }
  const motionSeconds = phases
    .filter((p) => p.status !== "low_signal")
    .reduce((s, p) => s + p.end - p.start, 0);
  const scoredSeconds = phases
    .filter((p) => p.status === "scored")
    .reduce((s, p) => s + p.end - p.start, 0);
  const coverage = motionSeconds > 0 ? scoredSeconds / motionSeconds : 0;
  const validFraction = samples.length ? valid.length / samples.length : 0;
  const warnings: string[] = [];
  if (noiseEstimate === null)
    warnings.push(
      "未找到足够的低速稳定片段估计噪声；静止识别采用相对位移下限。",
    );
  if (coverage < PHASE_SPARC_CONFIG.minimumCoverage)
    warnings.push("可评分阶段覆盖不足 80% 的候选运动时长，不生成总分。");
  if (validFraction < 0.8) warnings.push("有效位置样本不足 80%，不生成总分。");
  if (segments.length > 1)
    warnings.push("存在数据缺口或时间戳异常，已断开计算；缺口内运动无法评估。");
  warnings.push(
    events.source === "contact"
      ? "TED 仅评价 XYZ，尚未纳入姿态。"
      : "阶段由夹爪/运动事件近似确定，不是语义或接触真值；TED 仅评价 XYZ。",
  );
  return {
    episodeIndex,
    fingerprint: trajectoryFingerprint(samples),
    startTime: valid[0]?.timestamp ?? 0,
    sparc: average(phases, "sparc"),
    ted: average(phases, "ted"),
    psd: computePsd(samples).value,
    phases,
    groups,
    windows: windows.sort((a, b) => a.start - b.start),
    phaseSource: events.source,
    noiseEstimate,
    motionFloor,
    motionSeconds,
    scoredSeconds,
    coverage,
    validFraction,
    warnings,
  };
}

/** Midrank percentile avoids turning the worst of a small cohort into a
 * physical zero. At least three episodes of the same event state are needed. */
function midrank(values: number[], value: number): number | null {
  if (values.length < 3) return null;
  return (
    (values.filter((v) => v < value).length +
      0.5 * values.filter((v) => v === value).length) /
    values.length
  );
}

/** Shared by the UI loader and offline audit. No review labels are accepted.
 * Each episode contributes one duration-weighted value per event state, then
 * states receive equal weight so a long hold cannot dominate the final rank. */
export function rankPhaseSmoothness(
  raw: PhaseSmoothnessRaw[],
): TrajectorySmoothnessEpisode[] {
  const eligible = (e: PhaseSmoothnessRaw) =>
    e.coverage >= PHASE_SPARC_CONFIG.minimumCoverage && e.validFraction >= 0.8;
  return raw
    .map((e): TrajectorySmoothnessEpisode => {
      const groups = e.groups.map((g) => {
        const peers = raw
          .filter(eligible)
          .flatMap((r) => r.groups.filter((p) => p.key === g.key));
        const sparcQuality = midrank(
          peers.map((p) => p.sparc),
          g.sparc,
        );
        const tedRank = midrank(
          peers.map((p) => p.ted),
          g.ted,
        );
        return {
          ...g,
          referenceCount: peers.length,
          sparcQuality,
          tedQuality: tedRank === null ? null : 1 - tedRank,
        };
      });
      const canScore =
        eligible(e) &&
        groups.length > 0 &&
        groups.every((g) => g.sparcQuality !== null && g.tedQuality !== null);
      const sparcQuality = canScore
        ? groups.reduce((sum, g) => sum + g.sparcQuality!, 0) / groups.length
        : null;
      const tedQuality = canScore
        ? groups.reduce((sum, g) => sum + g.tedQuality!, 0) / groups.length
        : null;
      // TED can discount the primary score by at most 20%; good geometry cannot
      // compensate for a low SPARC rank. These weights are not paper thresholds.
      const score =
        sparcQuality !== null && tedQuality !== null
          ? 100 *
            sparcQuality *
            (1 - PHASE_SPARC_CONFIG.tedPenaltyWeight * (1 - tedQuality))
          : null;
      return {
        ...e,
        groups,
        sparcQuality,
        tedQuality,
        score,
        label:
          score === null
            ? "不可评分"
            : score >= 70
              ? "排名较高"
              : score >= 30
                ? "排名居中"
                : "排名偏低",
        warnings: [
          ...e.warnings,
          ...(groups.some((g) => g.referenceCount < 3)
            ? ["相同事件状态的可评分 episode 不足 3 条，只展示原始指标。"]
            : []),
        ],
      };
    })
    .sort((a, b) =>
      a.score === null
        ? b.score === null
          ? a.episodeIndex - b.episodeIndex
          : 1
        : b.score === null
          ? -1
          : b.score - a.score || a.episodeIndex - b.episodeIndex,
    );
}
