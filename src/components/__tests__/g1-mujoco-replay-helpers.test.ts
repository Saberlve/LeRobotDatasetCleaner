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
      Array.from({ length: 29 }, (_, index) => [
        `observation.state | ${index}`,
        index * 0.1,
      ]),
    );

    expect(extractOrderedG1StateColumns(row)).toEqual(
      Array.from({ length: 29 }, (_, index) => `observation.state | ${index}`),
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
  test("writes dataset values after the floating-base qpos prefix", () => {
    const columns = Array.from(
      { length: G1_JOINT_NAMES.length },
      (_, index) => `observation.state | ${index}`,
    );
    const row = Object.fromEntries(columns.map((column, index) => [column, index]));

    expect(Array.from(buildG1QposFrame(row, columns).slice(0, 10))).toEqual([
      0, 0, 0, 1, 0, 0, 0, 0, 1, 2,
    ]);
  });
});

describe("G1_REQUIRED_ASSET_PATHS", () => {
  test("includes the MuJoCo entry XML", () => {
    expect(G1_REQUIRED_ASSET_PATHS).toContain("/mujoco/g1/g1.xml");
  });
});
