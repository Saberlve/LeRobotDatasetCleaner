import { describe, expect, test } from "vitest";

import { getFilteringExportState } from "@/components/filtering-panel";

describe("getFilteringExportState", () => {
  test("disables flagged export when nothing is flagged", () => {
    expect(
      getFilteringExportState({
        repoId: "local/demo_v21",
        mode: "flagged",
        flaggedCount: 0,
        totalEpisodes: 3,
        outputPath: "/tmp/demo",
        submitting: false,
      }),
    ).toMatchObject({
      disabled: true,
      reason: "Flag at least one episode before exporting flagged data.",
    });
  });

  test("enables unflagged export when a local dataset has output path and remaining episodes", () => {
    expect(
      getFilteringExportState({
        repoId: "local/demo_v21",
        mode: "unflagged",
        flaggedCount: 1,
        totalEpisodes: 3,
        outputPath: "/tmp/demo_unflagged",
        submitting: false,
      }),
    ).toMatchObject({
      disabled: false,
      isLocalRepo: true,
      reason: null,
    });
  });

  test("disables export for remote datasets", () => {
    expect(
      getFilteringExportState({
        repoId: "org/demo",
        mode: "flagged",
        flaggedCount: 2,
        totalEpisodes: 3,
        outputPath: "/tmp/demo_flagged",
        submitting: false,
      }),
    ).toMatchObject({
      disabled: true,
      reason: "Only local datasets can be exported.",
    });
  });
});
