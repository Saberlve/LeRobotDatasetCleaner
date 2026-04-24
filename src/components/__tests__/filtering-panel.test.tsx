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
        outputParentDirectory: "/tmp",
        datasetName: "demo",
        submitting: false,
      }),
    ).toMatchObject({
      disabled: true,
      reason: "Flag at least one episode before exporting flagged data.",
    });
  });

  test("enables unflagged export when a local dataset has parent directory and dataset name", () => {
    expect(
      getFilteringExportState({
        repoId: "local/demo_v21",
        mode: "unflagged",
        flaggedCount: 1,
        totalEpisodes: 3,
        outputParentDirectory: "/tmp",
        datasetName: "demo_unflagged",
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
        outputParentDirectory: "/tmp",
        datasetName: "demo_flagged",
        submitting: false,
      }),
    ).toMatchObject({
      disabled: true,
      reason: "Only local datasets can be exported.",
    });
  });

  test("disables export until a parent directory is selected", () => {
    expect(
      getFilteringExportState({
        repoId: "local/demo_v21",
        mode: "flagged",
        flaggedCount: 1,
        totalEpisodes: 3,
        outputParentDirectory: "",
        datasetName: "demo_flagged",
        submitting: false,
      }),
    ).toMatchObject({
      disabled: true,
      reason: "Choose an output parent directory before exporting.",
    });
  });

  test("disables export until a dataset name is entered", () => {
    expect(
      getFilteringExportState({
        repoId: "local/demo_v21",
        mode: "flagged",
        flaggedCount: 1,
        totalEpisodes: 3,
        outputParentDirectory: "/tmp",
        datasetName: "",
        submitting: false,
      }),
    ).toMatchObject({
      disabled: true,
      reason: "Enter a dataset name before exporting.",
    });
  });

  test("rejects dataset names that contain path separators", () => {
    expect(
      getFilteringExportState({
        repoId: "local/demo_v21",
        mode: "flagged",
        flaggedCount: 1,
        totalEpisodes: 3,
        outputParentDirectory: "/tmp",
        datasetName: "../demo",
        submitting: false,
      }),
    ).toMatchObject({
      disabled: true,
      reason: "Dataset name cannot contain path separators.",
    });
  });
});
