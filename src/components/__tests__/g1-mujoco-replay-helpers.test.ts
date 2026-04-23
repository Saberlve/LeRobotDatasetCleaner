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
      Array.from({ length: G1_JOINT_NAMES.length }, (_, index) => `observation.state | ${index}`),
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
});

describe("buildG1QposFrame", () => {
  test("writes the full qpos frame in floating-base prefix plus ordered dataset values", () => {
    const columns = Array.from(
      { length: G1_JOINT_NAMES.length },
      (_, index) => `observation.state | ${index}`,
    );
    const row = Object.fromEntries(columns.map((column, index) => [column, index]));
    const frame = buildG1QposFrame(row, columns);

    expect(frame.length).toBe(7 + G1_JOINT_NAMES.length);
    expect(Array.from(frame)).toEqual([
      0, 0, 0, 1, 0, 0, 0, 0, 1, 2,
      3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
      13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
      23, 24, 25, 26, 27, 28,
    ]);
  });
});

describe("G1_REQUIRED_ASSET_PATHS", () => {
  test("matches the current minimal G1 asset manifest", () => {
    expect(G1_REQUIRED_ASSET_PATHS).toEqual([
      "/mujoco/g1/g1.xml",
      "/mujoco/g1/assets/pelvis.STL",
      "/mujoco/g1/assets/torso_link_rev_1_0.STL",
      "/mujoco/g1/assets/head_link.STL",
    ]);
  });
});
