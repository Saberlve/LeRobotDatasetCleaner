import { describe, expect, test } from "vitest";

import {
  G1_REQUIRED_ASSET_PATHS,
  G1_JOINT_NAMES,
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

describe("G1_REQUIRED_ASSET_PATHS", () => {
  test("matches the current browser G1 asset manifest", () => {
    expect(G1_REQUIRED_ASSET_PATHS).toEqual(
      expect.arrayContaining([
        "/mujoco/g1/g1.xml",
        "/mujoco/g1/assets/pelvis.STL",
        "/mujoco/g1/assets/left_hip_pitch_link.STL",
        "/mujoco/g1/assets/right_shoulder_yaw_link.STL",
      ]),
    );
    expect(G1_REQUIRED_ASSET_PATHS).toHaveLength(36);
  });
});
