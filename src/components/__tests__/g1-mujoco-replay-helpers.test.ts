import { describe, expect, test } from "vitest";

import {
  G1_REQUIRED_ASSET_PATHS,
  G1_JOINT_NAMES,
  buildG1QposFrames,
  buildG1QposFrame,
  extractOrderedG1StateColumns,
} from "@/components/g1-mujoco-replay-helpers";

describe("extractOrderedG1StateColumns", () => {
  test("returns ordered observation.state columns for a complete G1 row", () => {
    const row = Object.fromEntries(
      Array.from({ length: G1_JOINT_NAMES.length }, (_, index) => [
        `observation.state | ${index}`,
        index * 0.1,
      ]),
    );

    expect(extractOrderedG1StateColumns(row)).toEqual(
      Array.from(
        { length: G1_JOINT_NAMES.length },
        (_, index) => `observation.state | ${index}`,
      ),
    );
  });

  test("throws when a required G1 joint column is missing", () => {
    expect(() =>
      extractOrderedG1StateColumns({
        "observation.state | 0": 0,
        "observation.state | 1": 1,
      }),
    ).toThrow("Missing G1 state column observation.state | 2");
  });

  test("accepts Psi0 v2.1 states columns with 32 dimensions", () => {
    const row = Object.fromEntries(
      Array.from({ length: 32 }, (_, index) => [`states | ${index}`, index]),
    );

    expect(extractOrderedG1StateColumns(row)).toEqual(
      Array.from({ length: 32 }, (_, index) => `states | ${index}`),
    );
  });
});

describe("buildG1QposFrame", () => {
  test("writes the full qpos frame in floating-base prefix plus ordered dataset values", () => {
    const columns = Array.from(
      { length: G1_JOINT_NAMES.length },
      (_, index) => `observation.state | ${index}`,
    );
    const row = Object.fromEntries(
      columns.map((column, index) => [column, index]),
    );
    const frame = buildG1QposFrame(row, columns);

    expect(frame.length).toBe(7 + G1_JOINT_NAMES.length);
    expect(Array.from(frame)).toEqual([
      0, 0, 0, 1, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
      16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28,
    ]);
  });

  test("maps Psi0 32D state into G1 qpos while ignoring hand and torso-height dimensions", () => {
    const columns = Array.from(
      { length: 32 },
      (_, index) => `states | ${index}`,
    );
    const row = Object.fromEntries(
      columns.map((column, index) => [column, index]),
    );
    const frame = buildG1QposFrame(row, columns);

    expect(frame.length).toBe(7 + G1_JOINT_NAMES.length);
    expect(Array.from(frame.slice(7, 19))).toEqual(Array(12).fill(0));
    expect(Array.from(frame.slice(19, 22))).toEqual([30, 28, 29]);
    expect(Array.from(frame.slice(22, 36))).toEqual([
      14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27,
    ]);
  });
});

describe("buildG1QposFrames", () => {
  test("integrates Psi0 vx and vy into floating-base translation", () => {
    const columns = Array.from(
      { length: 32 },
      (_, index) => `states | ${index}`,
    );
    const rows = Array.from({ length: 3 }, () => ({
      ...Object.fromEntries(columns.map((column) => [column, 0])),
      "states | 31": 0.75,
      "action | 32": 0.3,
      "action | 33": 0.6,
      "action | 34": 0,
    }));

    const frames = buildG1QposFrames(rows, columns, 30);

    expect(frames).toHaveLength(3);
    expect(frames[0][0]).toBeCloseTo(0);
    expect(frames[0][1]).toBeCloseTo(0);
    expect(frames[0][2]).toBeCloseTo(0.75);
    expect(frames[1][0]).toBeCloseTo(0.01);
    expect(frames[1][1]).toBeCloseTo(0.02);
    expect(frames[2][0]).toBeCloseTo(0.02);
    expect(frames[2][1]).toBeCloseTo(0.04);
  });

  test("uses target yaw when present and rotates local velocity into world translation", () => {
    const columns = Array.from(
      { length: 32 },
      (_, index) => `states | ${index}`,
    );
    const makeRow = (targetYaw: number) => ({
      ...Object.fromEntries(columns.map((column) => [column, 0])),
      "action | 32": 1,
      "action | 33": 0,
      "action | 34": 0,
      "action | 35": targetYaw,
    });

    const frames = buildG1QposFrames(
      [makeRow(0), makeRow(Math.PI / 2)],
      columns,
      10,
    );

    expect(frames[1][0]).toBeCloseTo(0);
    expect(frames[1][1]).toBeCloseTo(0.1);
    expect(frames[1][3]).toBeCloseTo(Math.cos(Math.PI / 4));
    expect(frames[1][6]).toBeCloseTo(Math.sin(Math.PI / 4));
  });

  test("falls back to static floating base when Psi0 action command columns are absent", () => {
    const columns = Array.from(
      { length: 32 },
      (_, index) => `states | ${index}`,
    );
    const row = Object.fromEntries(columns.map((column) => [column, 0]));

    const [frame] = buildG1QposFrames([row], columns, 30);

    expect(Array.from(frame.slice(0, 7))).toEqual([0, 0, 0, 1, 0, 0, 0]);
  });
});

describe("G1_REQUIRED_ASSET_PATHS", () => {
  test("matches the current browser G1 asset manifest", () => {
    expect(G1_REQUIRED_ASSET_PATHS).toEqual(
      expect.arrayContaining(["/mujoco/g1/g1.xml"]),
    );
    expect(G1_REQUIRED_ASSET_PATHS).toHaveLength(1);
  });
});
