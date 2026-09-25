import { describe, expect, test } from "vitest";
import {
  computePhaseSmoothness,
  computeSparcSpeed,
  rankPhaseSmoothness,
} from "../trajectory-phase-sparc";
import type { TrajectorySample } from "../trajectory-smoothness";

const curve = (u: number) => 10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5;
function reach(duration = 4, fps = 30, jitter = 0): TrajectorySample[] {
  return Array.from({ length: Math.round(duration * fps) + 1 }, (_, i) => {
    const u = i / (duration * fps),
      t = i / fps;
    return {
      timestamp: t,
      position: [
        curve(u),
        jitter * Math.sin(2 * Math.PI * 3 * t) * Math.sin(Math.PI * u),
        0,
      ],
    };
  });
}
const shifted = (s: TrajectorySample[], offset: number) =>
  s.map((p) => ({ ...p, timestamp: p.timestamp + offset }));

describe("standard scalar-speed SPARC", () => {
  // Independent golden values from the author's NumPy spectral_arclength,
  // default padlevel=4, amp_th=.05; fc=min(10, sampleRate/2).
  test.each([
    [60, 15, -1.4004071208042548],
    [120, 30, -1.4004073928752343],
    [240, 60, -1.400407409849293],
  ])("agrees with the author implementation at N=%i", (n, fs, expected) => {
    const v = Array.from({ length: n }, (_, i) => {
      const u = (i + 0.5) / n;
      return 30 * u ** 2 * (1 - u) ** 2;
    });
    const result = computeSparcSpeed(v, fs);
    expect(result.value).toBeCloseTo(expected, 10);
    expect(result.cutoffHz!).toBeLessThanOrEqual(fs / 2);
  });
  test("matches the author's Gaussian example", () => {
    const v = Array.from({ length: 200 }, (_, i) =>
      Math.exp(-5 * (-1 + i / 100) ** 2),
    );
    expect(computeSparcSpeed(v, 100).value).toBeCloseTo(
      -1.4140312617104793,
      10,
    );
  });
  test("amplitude and global time scaling do not change the normalized arc", () => {
    const v = Array.from({ length: 120 }, (_, i) => {
      const u = (i + 0.5) / 120;
      return 30 * u ** 2 * (1 - u) ** 2;
    });
    const a = computeSparcSpeed(v, 30).value!;
    expect(
      computeSparcSpeed(
        v.map((x) => 1000 * x),
        30,
      ).value,
    ).toBeCloseTo(a, 10);
    expect(
      computeSparcSpeed(
        v.map((x) => x / 2),
        15,
      ).value,
    ).toBeCloseTo(a, 10);
  });
  test("in-band periodic velocity disturbance worsens the score without amplifying tiny noise", () => {
    const base = Array.from({ length: 120 }, (_, i) => {
      const u = (i + 0.5) / 120;
      return 30 * u ** 2 * (1 - u) ** 2;
    });
    const score = (a: number) =>
      computeSparcSpeed(
        base.map((v, i) => v * (1 + a * Math.sin((2 * Math.PI * 3 * i) / 30))),
        30,
      ).value!;
    expect(Math.abs(score(0.02) - score(0))).toBeLessThan(0.02);
    expect(score(0.2)).toBeLessThan(score(0) - 0.2);
    expect(score(0.4)).toBeLessThan(score(0.2));
  });
  test("invalid, static and very short speed arrays have no score", () => {
    expect(computeSparcSpeed(Array(30).fill(0), 15).value).toBeNull();
    expect(computeSparcSpeed([1, 2], 15).value).toBeNull();
    expect(computeSparcSpeed(Array(30).fill(-1), 15).value).toBeNull();
    expect(computeSparcSpeed(Array(30).fill(1), NaN).value).toBeNull();
  });
  test("separated velocity pulses are less continuous than overlapping pulses", () => {
    const pulse = (u: number) =>
      u >= 0 && u <= 1 ? 30 * u ** 2 * (1 - u) ** 2 : 0;
    const score = (lag: number) =>
      computeSparcSpeed(
        Array.from(
          { length: 180 },
          (_, i) => pulse(i / 60) + pulse(i / 60 - lag),
        ),
        60,
      ).value!;
    expect(score(1.1)).toBeLessThan(score(0.2));
  });
});

describe("event phase scoring without manual labels", () => {
  test("gripper events produce variable-length phases and preserve transition checks", () => {
    const samples = reach(9, 30).map((s) => ({
      ...s,
      gripper: s.timestamp < 3.3 ? 0 : 1,
    }));
    const result = computePhaseSmoothness(1, samples);
    expect(result.phases.filter((p) => p.status === "scored")).toHaveLength(2);
    expect(result.phases[0].end).toBeCloseTo(3.3);
    expect(result.phases[1].start).toBeCloseTo(3.3);
    expect(
      result.windows.some(
        (w) => w.kind === "boundary" && w.start < 3.3 && w.end > 3.3,
      ),
    ).toBe(true);
    expect(result.phases.reduce((n, p) => n + p.end - p.start, 0)).toBeCloseTo(
      9,
    );
  });
  test("coordinate rotation, translation and unit conversion preserve primary values", () => {
    const source = reach(4, 30, 0.01);
    const transformed = source.map(
      (s): TrajectorySample => ({
        ...s,
        position: [-s.position[1] * 1000 + 10, s.position[0] * 1000 - 31, 500],
      }),
    );
    const a = computePhaseSmoothness(1, source),
      b = computePhaseSmoothness(2, transformed);
    expect(b.sparc).toBeCloseTo(a.sparc!, 7);
    expect(b.ted).toBeCloseTo(a.ted!, 7);
  });
  test("oscillation is not split into many smooth pieces and raises geometric residual", () => {
    const smooth = computePhaseSmoothness(1, reach());
    const oscillation = computePhaseSmoothness(2, reach(4, 30, 0.04));
    expect(
      oscillation.phases.filter((p) => p.status === "scored"),
    ).toHaveLength(1);
    expect(oscillation.ted!).toBeGreaterThan(smooth.ted! + 0.005);
    expect(oscillation.sparc!).toBeLessThan(smooth.sparc!);
  });
  test("retains legitimate event-aligned bends with a single cubic per phase", () => {
    const s = Array.from(
      { length: 241 },
      (_, i): TrajectorySample => ({
        timestamp: i / 30,
        gripper: i < 120 ? 0 : 1,
        position: i < 120 ? [i / 30, 0, 0] : [4, (i - 120) / 30, 0],
      }),
    );
    const r = computePhaseSmoothness(1, s);
    expect(r.phases.filter((p) => p.status === "scored")).toHaveLength(2);
    expect(r.ted!).toBeLessThan(1e-8);
  });
  test("long quiet padding does not enter the movement average", () => {
    const movement = reach();
    const idle = Array.from(
      { length: 120 },
      (_, i): TrajectorySample => ({ timestamp: i / 30, position: [0, 0, 0] }),
    );
    const padded = computePhaseSmoothness(2, [
      ...idle,
      ...shifted(movement, 4),
    ]);
    expect(padded.phases.some((p) => p.status === "low_signal")).toBe(true);
    expect(padded.scoredSeconds).toBeLessThan(4.5);
    expect(
      Math.abs(padded.sparc! - computePhaseSmoothness(1, movement).sparc!),
    ).toBeLessThan(0.15);
  });
  test("small stationary measurement noise is excluded without filtering the scored motion", () => {
    let state = 20260923;
    const uniform = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return (state + 1) / 4294967297;
    };
    const noise = () =>
      0.0001 *
      Math.sqrt(-2 * Math.log(uniform())) *
      Math.cos(2 * Math.PI * uniform());
    const idle = Array.from(
      { length: 120 },
      (_, i): TrajectorySample => ({
        timestamp: i / 30,
        position: [noise(), noise(), noise()],
      }),
    );
    const movement = shifted(reach(), 4).map(
      (s): TrajectorySample => ({
        ...s,
        position: [s.position[0] + noise(), noise(), noise()],
      }),
    );
    const r = computePhaseSmoothness(1, [...idle, ...movement]);
    expect(r.noiseEstimate).not.toBeNull();
    expect(
      r.phases.some(
        (p) => p.status === "low_signal" && p.start === 0 && p.end > 3,
      ),
    ).toBe(true);
    expect(r.scoredSeconds).toBeLessThan(4.6);
    expect(
      Math.abs(r.sparc! - computePhaseSmoothness(2, reach()).sparc!),
    ).toBeLessThan(0.2);
  });
  test("does not interpolate across invalid rows or missing time", () => {
    const s = [...reach(), ...shifted(reach(), 7)];
    const r = computePhaseSmoothness(1, s);
    expect(r.phases.every((p) => p.end <= 4 || p.start >= 7)).toBe(true);
    expect(r.windows.every((p) => p.end <= 4 || p.start >= 7)).toBe(true);
    const broken = reach();
    broken[60].position[0] = NaN;
    const split = computePhaseSmoothness(1, broken);
    expect(split.phases.every((p) => p.end < 2 || p.start > 2)).toBe(true);
  });
  test("static and insufficient short motions are never promoted to good examples", () => {
    const still = reach().map(
      (s): TrajectorySample => ({ ...s, position: [1, 1, 1] }),
    );
    expect(computePhaseSmoothness(1, still).sparc).toBeNull();
    expect(computePhaseSmoothness(2, reach(0.3)).sparc).toBeNull();
    expect(
      rankPhaseSmoothness(
        [1, 2, 3].map((i) => computePhaseSmoothness(i, still)),
      ).every((e) => e.score === null),
    ).toBe(true);
  });
  test("relative score needs comparable episodes; TED can only discount the SPARC rank", () => {
    const raw = [0, 0.01, 0.04].map((jitter, i) =>
      computePhaseSmoothness(i, reach(4, 30, jitter)),
    );
    expect(
      rankPhaseSmoothness(raw.slice(0, 2)).every((e) => e.score === null),
    ).toBe(true);
    for (const e of rankPhaseSmoothness(raw)) {
      expect(e.score).not.toBeNull();
      expect(e.score!).toBeLessThanOrEqual(100 * e.sparcQuality!);
      expect(e.score!).toBeGreaterThanOrEqual(80 * e.sparcQuality!);
    }
  });
});
