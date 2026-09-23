import { describe, expect, test } from "vitest";
import {
  computePsd,
  computeSal,
  computeTed,
  empiricalPercentile,
  exactSpectrum,
  computeWindowedSal,
  continuousSegments,
  dtwPositionDistance,
  partitionTrajectoryPhases,
  SAL_SCALES,
  directionalSpectrumSal,
  type TrajectorySample,
} from "../trajectory-smoothness";

function samplesFrom(values: number[]): TrajectorySample[] {
  return values.map((x, index) => ({
    timestamp: index / 15,
    position: [x, 0, 0],
  }));
}

describe("trajectory smoothness metrics", () => {
  test("returns finite SAL, TED, and PSD values for a valid trajectory", () => {
    const samples = samplesFrom(Array.from({ length: 64 }, (_, i) => i * 0.01));
    expect(computeSal(samples).value).toEqual(expect.any(Number));
    expect(computeTed(samples).value).toEqual(expect.any(Number));
    expect(computePsd(samples).value).toEqual(expect.any(Number));
  });

  test("TED increases when a trajectory contains a spatial oscillation", () => {
    const smooth = samplesFrom(Array.from({ length: 64 }, (_, i) => i * 0.01));
    const noisy = samplesFrom(
      Array.from(
        { length: 64 },
        (_, i) => i * 0.01 + (i % 2 === 0 ? 0.08 : -0.08),
      ),
    );
    expect(computeTed(noisy).value!).toBeGreaterThan(computeTed(smooth).value!);
  });

  test("percentiles keep SAL higher-is-better and TED lower-is-better directions explicit", () => {
    expect(empiricalPercentile([-3, -2, -1], -1)).toBe(1);
    expect(1 - empiricalPercentile([1, 2, 3], 1)!).toBe(1);
  });
});

function motion(seconds: number, fps = 15): TrajectorySample[] {
  return Array.from({ length: Math.round(seconds * fps) + 1 }, (_, i) => {
    const t = i / fps;
    return {
      timestamp: t,
      position: [
        t + 0.2 * Math.sin((Math.PI * t) / 2),
        0.1 * Math.cos((Math.PI * t) / 2),
        0,
      ],
    };
  });
}

describe("SAL length and window regressions", () => {
  test("directional SAL detects alternating motion hidden by a constant speed magnitude", () => {
    const forward = Array.from(
      { length: 61 },
      (_, i): TrajectorySample => ({
        timestamp: i / 15,
        position: [i / 15, 0, 0],
      }),
    );
    const oscillating = forward.map(
      (s, i): TrajectorySample => ({
        ...s,
        position: [(i % 4 <= 2 ? i % 4 : 4 - (i % 4)) / 15, 0, 0],
      }),
    );
    expect(computeSal(oscillating).value).toBeCloseTo(
      computeSal(forward).value!,
      6,
    );
    expect(directionalSpectrumSal(oscillating)!).toBeLessThan(
      directionalSpectrumSal(forward)! - 3,
    );
  });

  test("directional SAL is independent of translation and rotation of the coordinate frame", () => {
    const samples = motion(4),
      angle = 0.731;
    const rotated = samples.map(
      (s): TrajectorySample => ({
        ...s,
        position: [
          s.position[0] * Math.cos(angle) - s.position[1] * Math.sin(angle) + 7,
          s.position[0] * Math.sin(angle) +
            s.position[1] * Math.cos(angle) -
            12,
          3,
        ],
      }),
    );
    expect(directionalSpectrumSal(samples)).toBeCloseTo(
      directionalSpectrumSal(rotated)!,
      7,
    );
  });

  test("Nyquist-only alternation is an SAL ambiguity; complementary TED must retain the oscillation", () => {
    const samples = Array.from(
      { length: 61 },
      (_, i): TrajectorySample => ({
        timestamp: i / 15,
        position: [(i % 2) / 15, 0, 0],
      }),
    );
    const forward = samples.map(
      (s, i): TrajectorySample => ({ ...s, position: [i / 15, 0, 0] }),
    );
    expect(directionalSpectrumSal(samples)).toBeCloseTo(
      directionalSpectrumSal(forward)!,
      6,
    );
    expect(computeTed(samples).value!).toBeGreaterThan(
      computeTed(forward).value! + 0.1,
    );
  });
  test.each([1, 8, 9, 15, 30, 63, 64, 65])(
    "arbitrary-length FFT equals an independent direct DFT, N=%i",
    (n) => {
      const values = Array.from(
        { length: n },
        (_, i) => 1 + Math.sin(i * 0.7) + i / n,
      );
      const spectrum = exactSpectrum(values);
      for (let k = 0; k < n; k++) {
        const real = values.reduce(
          (sum, v, j) => sum + v * Math.cos((2 * Math.PI * k * j) / n),
          0,
        );
        const imag = values.reduce(
          (sum, v, j) => sum - v * Math.sin((2 * Math.PI * k * j) / n),
          0,
        );
        expect(spectrum.real[k]).toBeCloseTo(real, 8);
        expect(spectrum.imag[k]).toBeCloseTo(imag, 8);
      }
    },
  );

  test("same smooth motion does not jump at power-of-two sample boundaries", () => {
    const sal = (n: number) =>
      computeSal(
        Array.from({ length: n + 1 }, (_, i): TrajectorySample => {
          const t = i / n;
          return {
            timestamp: 20 * t,
            position: [t - Math.sin(2 * Math.PI * t) / (2 * Math.PI), 0, 0],
          };
        }),
      ).value!;
    expect(Math.abs(sal(255) - sal(257))).toBeLessThan(3);
    expect(Math.abs(sal(511) - sal(513))).toBeLessThan(3);
  });

  test("repeating the same movement does not penalize a longer episode", () => {
    expect(computeWindowedSal(motion(12), 15, 4).value).toBeCloseTo(
      computeWindowedSal(motion(24), 15, 4).value!,
      7,
    );
  });

  test("window SAL is stable under coordinate-unit changes", () => {
    const samples = motion(12);
    const millimeters = samples.map((s) => ({
      ...s,
      position: s.position.map((x) => 1000 * x) as [number, number, number],
    }));
    for (const seconds of SAL_SCALES)
      expect(computeWindowedSal(samples, 15, seconds).value).toBeCloseTo(
        computeWindowedSal(millimeters, 15, seconds).value!,
        7,
      );
  });

  test("multiscale windows preserve their duration and cover shifted action boundaries", () => {
    const samples = motion(15).map((s) => ({
      ...s,
      gripper: s.timestamp < 3.2 ? 0 : 1,
    }));
    expect(partitionTrajectoryPhases(samples).phases).toHaveLength(2);
    for (const seconds of SAL_SCALES) {
      const result = computeWindowedSal(samples, 15, seconds);
      expect(result.windows.length).toBeGreaterThan(1);
      for (let i = 1; i < result.windows.length; i++) {
        expect(
          result.windows[i].start - result.windows[i - 1].start,
        ).toBeGreaterThan(1 / 15);
      }
      for (const window of result.windows)
        expect(window.end - window.start).toBeCloseTo(seconds, 6);
      expect(result.windows.some((w) => Math.abs(w.start - 3.2) < 1e-6)).toBe(
        true,
      );
      // At least one larger window retains the whole short action around 3.2 s.
      if (seconds >= 4)
        expect(result.windows.some((w) => w.start <= 2.5 && w.end >= 4)).toBe(
          true,
        );
    }
  });

  test("does not interpolate across a long time gap or invalid samples", () => {
    const a = motion(6),
      b = motion(6).map((s) => ({ ...s, timestamp: s.timestamp + 9 }));
    const result = computeWindowedSal([...a, ...b], 15, 4);
    expect(result.windows.length).toBeGreaterThan(0);
    expect(result.windows.every((w) => w.end <= 6 || w.start >= 9)).toBe(true);
    const invalid = motion(9);
    invalid[67].position[0] = NaN;
    expect(
      computeWindowedSal(invalid, 15, 4).windows.every(
        (w) => w.end < 67 / 15 || w.start > 67 / 15,
      ),
    ).toBe(true);
  });

  test("duplicate and reversed timestamps split the stream without sorting", () => {
    const samples = samplesFrom([0, 1, 2, 3, 4, 5]);
    samples[3].timestamp = samples[2].timestamp;
    expect(continuousSegments(samples).map((s) => s.length)).toEqual([3, 3]);
    samples[3].timestamp = 0;
    expect(continuousSegments(samples).length).toBeGreaterThan(1);
    expect(computeSal(samples).value).toBeNull();
  });

  test("static and short intervals are not scored as high-quality motion", () => {
    const still = motion(12).map((s) => ({
      ...s,
      position: [1, 1, 1] as [number, number, number],
    }));
    expect(computeWindowedSal(still, 15, 4).value).toBeNull();
    expect(computeWindowedSal(motion(1), 15, 2).value).toBeNull();
  });
});

describe("phase TED and PSD regressions", () => {
  test("DTW divides by actual alignment length, including repeated matches", () => {
    const result = dtwPositionDistance(
      samplesFrom([0, 0, 0, 1]),
      samplesFrom([0, 1, 1, 1.1]),
      1,
    )!;
    expect(result.pathLength).toBe(6);
    expect(result.sum).toBeCloseTo(0.1);
    expect(result.value).toBeCloseTo(0.1 / 6);
  });

  test("stable gripper phases retain a legitimate turn, while injected oscillation raises TED", () => {
    const smooth = motion(12).map(
      (s): TrajectorySample => ({
        timestamp: s.timestamp,
        gripper: s.timestamp < 6 ? 0 : 1,
        position:
          s.timestamp < 6 ? [s.timestamp, 0, 0] : [6, s.timestamp - 6, 0],
      }),
    );
    const noisy = smooth.map(
      (s, i): TrajectorySample => ({
        ...s,
        position: [s.position[0], s.position[1], 0.2 * Math.sin(i * 2.3)],
      }),
    );
    expect(computeTed(smooth).phaseSource).toBe("gripper");
    expect(computeTed(smooth).phaseCount).toBe(2);
    expect(computeTed(smooth).value!).toBeLessThan(1e-8);
    expect(computeTed(noisy).value!).toBeGreaterThan(0.001);
  });

  test("a one-frame gripper spike is debounced; explicit contact takes precedence", () => {
    const samples = motion(12).map((s, i) => ({
      ...s,
      gripper: i === 30 || i >= 120 ? 1 : 0,
    }));
    expect(partitionTrajectoryPhases(samples).phases).toHaveLength(2);
    const contact = partitionTrajectoryPhases(
      samples.map((s) => ({ ...s, contact: true })),
    );
    expect(contact.source).toBe("contact");
    expect(contact.phases).toHaveLength(1);
  });

  test("PSD remains full-band coordinate energy including DC", () => {
    const samples = samplesFrom([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(computePsd(samples).value).toBe(204);
    expect(
      computePsd(
        samples.map((s) => ({ ...s, position: [s.position[0] + 100, 0, 0] })),
      ).value!,
    ).toBeGreaterThan(204);
  });
});
