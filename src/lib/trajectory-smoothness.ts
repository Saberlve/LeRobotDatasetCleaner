export const SMOOTHNESS_VERSION = "event-sparc-position-ted-v5";
export const MIN_SAL_WINDOWS = 5;
export type TrajectorySample = {
  timestamp: number;
  position: [number, number, number];
  gripper?: number;
  contact?: boolean;
};
export type TrajectoryMetricResult = { value: number | null; warning?: string };
export type SalWindow = {
  start: number;
  end: number;
  value: number;
  seconds: number;
};
export const SAL_SCALES = [2, 4, 8] as const;
export type SalScale = {
  seconds: number;
  value: number | null;
  p10: number | null;
  quality: number | null;
  windowCount: number;
};
export type WindowSalResult = TrajectoryMetricResult & {
  windows: SalWindow[];
  p10: number | null;
  skippedWindows: number;
};
export type PhaseTedResult = TrajectoryMetricResult & {
  phaseCount: number;
  phaseSource: "contact" | "gripper" | "none";
};
const EPSILON = 1e-5;
const isValid = (s: TrajectorySample) =>
  Number.isFinite(s.timestamp) && s.position.every(Number.isFinite);
const distance = (a: number[], b: number[]) =>
  Math.hypot(...a.map((v, i) => v - b[i]));
export function quantile(values: number[], q: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const i = (sorted.length - 1) * q,
    lo = Math.floor(i);
  return sorted[lo] + (sorted[Math.ceil(i)] - sorted[lo]) * (i - lo);
}
// Never sort or bridge invalid rows, duplicate/reversed timestamps, or gaps.
export function continuousSegments(
  samples: TrajectorySample[],
): TrajectorySample[][] {
  const deltas = samples
    .slice(1)
    .map((s, i) => s.timestamp - samples[i].timestamp)
    .filter((d) => Number.isFinite(d) && d > 0);
  const dt = quantile(deltas, 0.5) ?? 0;
  const segments: TrajectorySample[][] = [];
  let segment: TrajectorySample[] = [];
  for (const sample of samples) {
    if (!isValid(sample)) {
      if (segment.length) segments.push(segment);
      segment = [];
      continue;
    }
    const delta = segment.length
      ? sample.timestamp - segment[segment.length - 1].timestamp
      : dt;
    if (segment.length && (delta <= 0 || delta > 3 * dt)) {
      segments.push(segment);
      segment = [];
    }
    segment.push(sample);
  }
  if (segment.length) segments.push(segment);
  return segments;
}
function radix2(real: number[], imag: number[], inverse = false): void {
  const n = real.length;
  for (let j = 1, i = 0; j < n; j++) {
    let bit = n >> 1;
    for (; i & bit; bit >>= 1) i ^= bit;
    i ^= bit;
    if (j < i) {
      [real[j], real[i]] = [real[i], real[j]];
      [imag[j], imag[i]] = [imag[i], imag[j]];
    }
  }
  for (let length = 2; length <= n; length *= 2) {
    const angle = ((inverse ? 2 : -2) * Math.PI) / length;
    const wr = Math.cos(angle),
      wi = Math.sin(angle);
    for (let start = 0; start < n; start += length) {
      let r = 1,
        im = 0;
      for (let j = 0; j < length / 2; j++) {
        const a = start + j,
          b = a + length / 2;
        const br = real[b] * r - imag[b] * im,
          bi = real[b] * im + imag[b] * r;
        real[b] = real[a] - br;
        imag[b] = imag[a] - bi;
        real[a] += br;
        imag[a] += bi;
        const next = r * wr - im * wi;
        im = r * wi + im * wr;
        r = next;
      }
    }
  }
  if (inverse)
    for (let i = 0; i < n; i++) {
      real[i] /= n;
      imag[i] /= n;
    }
}
/** Exact N-point DFT via Bluestein. Internal convolution padding preserves
 * the original frequency grid and number of SAL summands. */
export function exactSpectrum(values: number[]): {
  real: number[];
  imag: number[];
} {
  const n = values.length;
  if (n === 0) return { real: [], imag: [] };
  if ((n & (n - 1)) === 0) {
    const real = [...values],
      imag = Array(n).fill(0);
    radix2(real, imag);
    return { real, imag };
  }
  let m = 1;
  while (m < 2 * n - 1) m *= 2;
  const ar = Array(m).fill(0),
    ai = Array(m).fill(0),
    br = Array(m).fill(0),
    bi = Array(m).fill(0);
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * ((i * i) % (2 * n))) / n,
      c = Math.cos(angle),
      s = Math.sin(angle);
    ar[i] = values[i] * c;
    ai[i] = -values[i] * s;
    br[i] = c;
    bi[i] = s;
    if (i) {
      br[m - i] = c;
      bi[m - i] = s;
    }
  }
  radix2(ar, ai);
  radix2(br, bi);
  for (let i = 0; i < m; i++) {
    const r = ar[i] * br[i] - ai[i] * bi[i];
    ai[i] = ar[i] * bi[i] + ai[i] * br[i];
    ar[i] = r;
  }
  radix2(ar, ai, true);
  const real: number[] = [],
    imag: number[] = [];
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * ((i * i) % (2 * n))) / n,
      c = Math.cos(angle),
      s = Math.sin(angle);
    real.push(ar[i] * c + ai[i] * s);
    imag.push(ai[i] * c - ar[i] * s);
  }
  return { real, imag };
}
function spectrumSal(
  speed: number[],
  dt: number,
  relativeFloor: boolean,
): number | null {
  if (speed.length < 8 || !(dt > 0)) return null;
  const { real, imag } = exactSpectrum(speed),
    dc = Math.abs(real[0]);
  if (!(dc > 0)) return null;
  // Relative numerical floor makes the window variant invariant to m/mm units.
  const scale = relativeFloor ? dc : 1;
  let last = Math.log(dc / scale + EPSILON),
    sal = 0;
  const df = 1 / (speed.length * dt);
  for (let k = 1; k <= Math.floor(speed.length / 2); k++) {
    const log = Math.log(Math.hypot(real[k], imag[k]) / scale + EPSILON);
    sal -= Math.hypot(df, log - last);
    last = log;
  }
  return Number.isFinite(sal) ? sal : null;
}
/** Project SAL variant: take the norm AFTER each velocity axis's FFT. This
 * retains direction changes, is invariant to a rigid rotation of coordinates,
 * and uses peak normalization because a returning movement can have zero DC.
 * This is not the paper's scalar-speed SAL, which remains in computeSal. */
export function directionalSpectrumSal(
  samples: TrajectorySample[],
): number | null {
  const n = samples.length - 1;
  if (n < 8) return null;
  const dt = (samples[n].timestamp - samples[0].timestamp) / n;
  if (!(dt > 0)) return null;
  const spectra = [0, 1, 2].map((axis) =>
    exactSpectrum(
      samples
        .slice(1)
        .map(
          (sample, i) =>
            (sample.position[axis] - samples[i].position[axis]) /
            (sample.timestamp - samples[i].timestamp),
        ),
    ),
  );
  const amplitudes = Array.from({ length: Math.floor(n / 2) + 1 }, (_, k) =>
    Math.sqrt(
      spectra.reduce(
        (sum, spectrum) => sum + spectrum.real[k] ** 2 + spectrum.imag[k] ** 2,
        0,
      ),
    ),
  );
  const peak = Math.max(...amplitudes);
  if (!(peak > 0) || !Number.isFinite(peak)) return null;
  let last = Math.log(amplitudes[0] / peak + EPSILON),
    sal = 0;
  for (let k = 1; k < amplitudes.length; k++) {
    const log = Math.log(amplitudes[k] / peak + EPSILON);
    sal -= Math.hypot(1 / (n * dt), log - last);
    last = log;
  }
  return Number.isFinite(sal) ? sal : null;
}

export function uniformPositions(
  segment: TrajectorySample[],
  start: number,
  end: number,
  intervals: number,
): TrajectorySample[] {
  let j = 0;
  return Array.from({ length: intervals + 1 }, (_, i) => {
    const timestamp = start + (i * (end - start)) / intervals;
    while (j + 1 < segment.length - 1 && segment[j + 1].timestamp < timestamp)
      j++;
    const a = segment[j],
      b = segment[Math.min(j + 1, segment.length - 1)];
    const u = Math.max(
      0,
      Math.min(1, (timestamp - a.timestamp) / (b.timestamp - a.timestamp || 1)),
    );
    return {
      timestamp,
      position: a.position.map((v, axis) => v + u * (b.position[axis] - v)) as [
        number,
        number,
        number,
      ],
    };
  });
}
export function speeds(samples: TrajectorySample[]): number[] {
  return samples
    .slice(1)
    .map(
      (s, i) =>
        distance(s.position, samples[i].position) /
        (s.timestamp - samples[i].timestamp),
    );
}
export function positionScale(samples: TrajectorySample[]): number {
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (const s of samples)
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], s.position[a]);
      max[a] = Math.max(max[a], s.position[a]);
    }
  return samples.length ? distance(min, max) : 0;
}
/** Whole-interval paper-style reference, using the actual DFT length. */
export function computeSal(
  samples: TrajectorySample[],
): TrajectoryMetricResult {
  const segments = continuousSegments(samples);
  if (segments.length !== 1 || segments[0].length < 9)
    return { value: null, warning: "整段 SAL 需要连续有效轨迹" };
  const s = segments[0],
    dt = quantile(
      s.slice(1).map((v, i) => v.timestamp - s[i].timestamp),
      0.5,
    )!;
  const uniform = uniformPositions(
    s,
    s[0].timestamp,
    s[s.length - 1].timestamp,
    Math.max(8, Math.round((s[s.length - 1].timestamp - s[0].timestamp) / dt)),
  );
  return {
    value: spectrumSal(
      speeds(uniform),
      uniform[1].timestamp - uniform[0].timestamp,
      false,
    ),
  };
}
/** Project variant: overlapping windows, with additional phase-aligned starts.
 * Short/gapped/static intervals are not promoted to good examples. */
export function computeWindowedSal(
  samples: TrajectorySample[],
  fps?: number,
  seconds = 4,
): WindowSalResult {
  const segments = continuousSegments(samples);
  const deltas = segments.flatMap((s) =>
    s.slice(1).map((v, i) => v.timestamp - s[i].timestamp),
  );
  const inferredRate = 1 / (quantile(deltas, 0.5) ?? NaN);
  const rate = fps && fps > 0 ? fps : Math.round(inferredRate * 100) / 100,
    intervals = Math.round(seconds * rate);
  const windows: SalWindow[] = [];
  let skippedWindows = 0;
  if (!Number.isFinite(rate) || intervals < 8 || intervals > 16000)
    return {
      value: null,
      p10: null,
      windows,
      skippedWindows,
      warning: "采样率不足或不受支持",
    };
  const scale = positionScale(samples.filter(isValid));
  // A transition is the first sample of the new phase, not both neighboring
  // samples. Segment ends already receive a regular tail window.
  const phaseEdges = partitionTrajectoryPhases(samples).phases.map(
    (phase) => phase[0].timestamp,
  );
  for (const segment of segments) {
    if (segment.length < 9) {
      skippedWindows++;
      continue;
    }
    const first = segment[0].timestamp,
      last = segment[segment.length - 1].timestamp;
    if (last - first < seconds - 1e-5) {
      skippedWindows++;
      continue;
    }
    const starts: number[] = [];
    for (
      let start = first;
      start + seconds <= last + 1e-5;
      start += seconds / 2
    )
      starts.push(start);
    if (last - seconds - starts[starts.length - 1] > 1 / rate)
      starts.push(last - seconds);
    // Keep regular coverage, and add windows beginning/ending at stable events.
    // No motion is removed merely because it straddles a gripper transition.
    for (const edge of phaseEdges)
      for (const start of [edge, edge - seconds]) {
        if (
          start >= first &&
          start + seconds <= last &&
          starts.every((s) => Math.abs(s - start) > 1 / rate + 1e-6)
        )
          starts.push(start);
      }
    starts.sort((a, b) => a - b);
    for (const start of starts) {
      const window = uniformPositions(
        segment,
        start,
        Math.min(last, start + seconds),
        intervals,
      );
      if (positionScale(window) <= Math.max(scale * 1e-4, Number.EPSILON)) {
        skippedWindows++;
        continue;
      }
      const value = directionalSpectrumSal(window);
      if (value !== null)
        windows.push({
          start,
          end: window[window.length - 1].timestamp,
          value,
          seconds,
        });
      else skippedWindows++;
    }
  }
  return {
    value: quantile(
      windows.map((w) => w.value),
      0.5,
    ),
    p10: quantile(
      windows.map((w) => w.value),
      0.1,
    ),
    windows,
    skippedWindows,
    ...(windows.length
      ? {}
      : {
          warning: `没有完整的 ${seconds} 秒有效运动窗口（短片段、静止或数据缺口）`,
        }),
  };
}
/** Unchanged all-band PSD reference via Parseval: sum(|FFT|²)/N = sum(x²).
 * Includes DC/coordinate offset; not physical power or a quality score. */
export function computePsd(
  samples: TrajectorySample[],
): TrajectoryMetricResult {
  const valid = samples.filter(isValid);
  if (valid.length < 8) return { value: null, warning: "有效位置不足" };
  const value = valid.reduce(
    (sum, s) => sum + s.position.reduce((v, x) => v + x * x, 0),
    0,
  );
  return { value: Number.isFinite(value) ? value : null };
}
/** Mean cost along the minimum-total-cost DTW path, divided by actual |P|. */
export function dtwPositionDistance(
  raw: TrajectorySample[],
  envelope: TrajectorySample[],
  scale = positionScale(raw),
): { sum: number; pathLength: number; value: number } | null {
  const n = raw.length,
    m = envelope.length;
  if (!n || !m || !(scale > 0)) return null;
  const band = Math.max(Math.abs(n - m), 8, Math.ceil(Math.max(n, m) * 0.1));
  let previous = new Float64Array(m + 1).fill(Infinity),
    current = new Float64Array(m + 1);
  let prevLen = new Uint32Array(m + 1),
    currLen = new Uint32Array(m + 1);
  previous[0] = 0;
  for (let i = 1; i <= n; i++) {
    current.fill(Infinity);
    currLen.fill(0);
    for (let j = Math.max(1, i - band); j <= Math.min(m, i + band); j++) {
      let cost = previous[j - 1],
        length = prevLen[j - 1];
      if (previous[j] < cost) {
        cost = previous[j];
        length = prevLen[j];
      }
      if (current[j - 1] < cost) {
        cost = current[j - 1];
        length = currLen[j - 1];
      }
      current[j] =
        cost + distance(raw[i - 1].position, envelope[j - 1].position) / scale;
      currLen[j] = length + 1;
    }
    [previous, current] = [current, previous];
    [prevLen, currLen] = [currLen, prevLen];
  }
  return Number.isFinite(previous[m]) && prevLen[m]
    ? {
        sum: previous[m],
        pathLength: prevLen[m],
        value: previous[m] / prevLen[m],
      }
    : null;
}
export function bezierFit(samples: TrajectorySample[]): TrajectorySample[] {
  const a = samples[0],
    b = samples[samples.length - 1],
    duration = b.timestamp - a.timestamp;
  const control = [a.position, [...a.position], [...b.position], b.position];
  let aa = 0,
    ab = 0,
    bb = 0;
  const ra = [0, 0, 0],
    rb = [0, 0, 0];
  for (const s of samples) {
    const u = (s.timestamp - a.timestamp) / duration,
      v = 1 - u,
      f = 3 * v * v * u,
      g = 3 * v * u * u;
    aa += f * f;
    ab += f * g;
    bb += g * g;
    for (let axis = 0; axis < 3; axis++) {
      const residual =
        s.position[axis] -
        v ** 3 * a.position[axis] -
        u ** 3 * b.position[axis];
      ra[axis] += f * residual;
      rb[axis] += g * residual;
    }
  }
  const det = aa * bb - ab * ab;
  for (let axis = 0; axis < 3; axis++) {
    control[1][axis] =
      det > 1e-12
        ? (ra[axis] * bb - rb[axis] * ab) / det
        : (2 * a.position[axis] + b.position[axis]) / 3;
    control[2][axis] =
      det > 1e-12
        ? (rb[axis] * aa - ra[axis] * ab) / det
        : (a.position[axis] + 2 * b.position[axis]) / 3;
  }
  return samples.map((s) => {
    const u = (s.timestamp - a.timestamp) / duration,
      v = 1 - u;
    return {
      timestamp: s.timestamp,
      position: [0, 1, 2].map(
        (axis) =>
          v ** 3 * control[0][axis] +
          3 * v * v * u * control[1][axis] +
          3 * v * u * u * control[2][axis] +
          u ** 3 * control[3][axis],
      ) as [number, number, number],
    };
  });
}
function fitRegions(
  samples: TrajectorySample[],
  scale: number,
  depth = 0,
): TrajectorySample[][] {
  const fitted = bezierFit(samples);
  let split = -1,
    error = 0.02 * scale;
  for (let i = 7; i < samples.length - 8; i++) {
    const residual = distance(samples[i].position, fitted[i].position);
    if (
      residual > error &&
      samples[i].timestamp - samples[0].timestamp >= 1 &&
      samples[samples.length - 1].timestamp - samples[i].timestamp >= 1
    ) {
      error = residual;
      split = i;
    }
  }
  if (split !== -1 && depth < 3)
    return [
      ...fitRegions(samples.slice(0, split + 1), scale, depth + 1),
      ...fitRegions(samples.slice(split), scale, depth + 1),
    ];
  return [samples];
}
export function partitionTrajectoryPhases(samples: TrajectorySample[]): {
  phases: TrajectorySample[][];
  source: PhaseTedResult["phaseSource"];
} {
  const segments = continuousSegments(samples),
    valid = segments.flat();
  let phaseSource: PhaseTedResult["phaseSource"] = "none";
  if (valid.length && valid.every((s) => typeof s.contact === "boolean"))
    phaseSource = "contact";
  else if (valid.length && valid.every((s) => Number.isFinite(s.gripper)))
    phaseSource = "gripper";
  const grippers = valid.map((s) => s.gripper ?? 0),
    lo = quantile(grippers, 0.05) ?? 0,
    hi = quantile(grippers, 0.95) ?? 0;
  const phases: TrajectorySample[][] = [];
  for (const segment of segments) {
    const boundaries = [0];
    let state =
        phaseSource === "contact"
          ? Number(segment[0].contact)
          : Number((segment[0].gripper ?? lo) > (lo + hi) / 2),
      pending = -1;
    for (let i = 1; i < segment.length; i++) {
      const value = (segment[i].gripper ?? lo) - lo;
      const next =
        phaseSource === "contact"
          ? Number(segment[i].contact)
          : phaseSource === "gripper" && hi > lo
            ? value > 0.6 * (hi - lo)
              ? 1
              : value < 0.4 * (hi - lo)
                ? 0
                : state
            : state;
      if (next === state) {
        pending = -1;
        continue;
      }
      if (pending === -1) pending = i;
      if (
        phaseSource === "contact" ||
        segment[i].timestamp - segment[pending].timestamp >= 0.2
      ) {
        boundaries.push(pending);
        state = next;
        pending = -1;
      }
    }
    boundaries.push(segment.length);
    for (let i = 1; i < boundaries.length; i++) {
      const phase = segment.slice(boundaries[i - 1], boundaries[i]);
      if (phase.length) phases.push(phase);
    }
  }
  return { phases, source: phaseSource };
}
export function computeTed(samples: TrajectorySample[]): PhaseTedResult {
  const { phases, source: phaseSource } = partitionTrajectoryPhases(samples);
  const valid = phases.flat(),
    scale = positionScale(valid);
  let sum = 0,
    pathLength = 0,
    phaseCount = 0,
    covered = 0;
  if (valid.length < 8 || !(scale > Number.EPSILON))
    return {
      value: null,
      phaseCount,
      phaseSource,
      warning: "有效位置不足或没有可识别位移",
    };
  for (const phase of phases) {
    if (phase.length < 8) continue;
    phaseCount++;
    covered += phase.length;
    // Dense outer 10% regions anchor task transitions; the interior uses
    // bounded cubic refinement. This is a position-only TED approximation.
    const edge = Math.floor(phase.length * 0.1);
    const regions =
      edge >= 8 && phase.length - 2 * edge >= 8
        ? [
            phase.slice(0, edge + 1),
            phase.slice(edge, phase.length - edge),
            phase.slice(phase.length - edge - 1),
          ]
        : [phase];
    for (const region of regions.flatMap((r) => fitRegions(r, scale))) {
      const result = dtwPositionDistance(region, bezierFit(region), scale);
      if (result) {
        sum += result.sum;
        pathLength += result.pathLength;
      }
    }
  }
  if (covered < valid.length * 0.8)
    return {
      value: null,
      phaseCount,
      phaseSource,
      warning: "有效阶段覆盖不足 80%，不生成 TED 分数",
    };
  return {
    value: pathLength ? sum / pathLength : null,
    phaseCount,
    phaseSource,
    warning:
      phaseSource === "contact"
        ? "仅位置 TED，尚未纳入姿态"
        : phaseSource === "gripper"
          ? "夹爪事件分段近似，仅位置；夹爪状态不等于接触真值"
          : "缺少接触/夹爪信息，仅位置包络近似",
  };
}
export function empiricalPercentile(
  values: (number | null)[],
  value: number | null,
): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const valid = values.filter(
    (item): item is number => item !== null && Number.isFinite(item),
  );
  if (valid.length < 2) return null;
  const less = valid.filter((item) => item < value).length,
    equal = valid.filter((item) => item === value).length;
  return (less + Math.max(0, equal - 1) / 2) / (valid.length - 1);
}
export function trajectoryFingerprint(samples: TrajectorySample[]): string {
  let hash = 2166136261;
  for (const s of samples)
    for (const char of [s.timestamp, ...s.position, s.gripper].join(",") + ";")
      hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `${samples.length}:${(hash >>> 0).toString(16)}`;
}
