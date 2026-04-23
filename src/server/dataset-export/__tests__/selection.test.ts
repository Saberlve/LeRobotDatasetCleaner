import { describe, expect, test } from "vitest";

import {
  buildEpisodeSelectionPlan,
  defaultExportAlias,
} from "@/server/dataset-export/selection";

describe("buildEpisodeSelectionPlan", () => {
  test("keeps flagged episodes and remaps them densely", () => {
    expect(
      buildEpisodeSelectionPlan({
        totalEpisodes: 6,
        flaggedEpisodeIds: [4, 1, 4],
        mode: "flagged",
      }),
    ).toMatchObject({
      keptEpisodeIds: [1, 4],
      droppedEpisodeIds: [0, 2, 3, 5],
      episodeIdMap: { 1: 0, 4: 1 },
      newTotalEpisodes: 2,
    });
  });

  test("keeps unflagged episodes and remaps them densely", () => {
    expect(
      buildEpisodeSelectionPlan({
        totalEpisodes: 5,
        flaggedEpisodeIds: [1, 3],
        mode: "unflagged",
      }),
    ).toMatchObject({
      keptEpisodeIds: [0, 2, 4],
      droppedEpisodeIds: [1, 3],
      episodeIdMap: { 0: 0, 2: 1, 4: 2 },
      newTotalEpisodes: 3,
    });
  });

  test("rejects out-of-range episode ids", () => {
    expect(() =>
      buildEpisodeSelectionPlan({
        totalEpisodes: 3,
        flaggedEpisodeIds: [3],
        mode: "flagged",
      }),
    ).toThrow("Flagged episode id 3 is out of range");
  });

  test("rejects malformed total episode counts", () => {
    expect(() =>
      buildEpisodeSelectionPlan({
        totalEpisodes: 3.7,
        flaggedEpisodeIds: [1],
        mode: "flagged",
      }),
    ).toThrow("Total episodes must be a positive integer");
  });

  test("rejects invalid export modes", () => {
    expect(() =>
      buildEpisodeSelectionPlan({
        totalEpisodes: 3,
        flaggedEpisodeIds: [1],
        mode: "all" as never,
      }),
    ).toThrow("Export mode must be either flagged or unflagged");
  });

  test("rejects empty flagged export", () => {
    expect(() =>
      buildEpisodeSelectionPlan({
        totalEpisodes: 4,
        flaggedEpisodeIds: [],
        mode: "flagged",
      }),
    ).toThrow("没有可导出的 flagged episodes");
  });

  test("rejects empty unflagged export", () => {
    expect(() =>
      buildEpisodeSelectionPlan({
        totalEpisodes: 2,
        flaggedEpisodeIds: [0, 1],
        mode: "unflagged",
      }),
    ).toThrow("没有可导出的 unflagged episodes");
  });
});

describe("defaultExportAlias", () => {
  test("adds mode suffix to local repo display name", () => {
    expect(defaultExportAlias("local/demo_box", "flagged")).toBe("demo_box_flagged");
    expect(defaultExportAlias("local/demo_box", "unflagged")).toBe("demo_box_unflagged");
  });
});
