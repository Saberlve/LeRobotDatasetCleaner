import { afterEach, beforeEach, describe, expect, test } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { exportFilteredDataset } from "@/server/dataset-export/exporter";

describe("exportFilteredDataset", () => {
  let tempRoot: string;
  let datasetRoot: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "visualizer-export-"));
    datasetRoot = path.join(tempRoot, "demo_v21");
    await fs.cp(
      path.resolve("src/server/dataset-export/__tests__/fixtures/minimal-v21"),
      datasetRoot,
      { recursive: true },
    );
    process.env.LOCAL_DATASET_REGISTRY_PATH = path.join(tempRoot, "registry.json");
  });

  afterEach(async () => {
    delete process.env.LOCAL_DATASET_REGISTRY_PATH;
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  test("exports unflagged episodes into a new local dataset directory", async () => {
    const outputPath = path.join(tempRoot, "demo_v21_unflagged");

    const result = await exportFilteredDataset({
      repoId: "local/demo_v21",
      datasetPath: datasetRoot,
      flaggedEpisodeIds: [1],
      mode: "unflagged",
      outputPath,
      alias: "demo_v21_unflagged",
    });

    const exportedInfo = JSON.parse(
      await fs.readFile(path.join(outputPath, "meta", "info.json"), "utf8"),
    );
    const exportedEpisodes = (
      await fs.readFile(path.join(outputPath, "meta", "episodes.jsonl"), "utf8")
    )
      .trim()
      .split("\n")
      // Fixture note: these episode payloads are JSON stand-ins for the project's
      // local-dataset layout so later parquet-backed export support can swap the
      // underlying bytes without changing this test's contract.
      .map((line) => JSON.parse(line));

    expect(result.repoId).toBe("local/demo_v21_unflagged");
    expect(exportedInfo.total_episodes).toBe(2);
    expect(
      exportedEpisodes.map((entry: { episode_index: number }) => entry.episode_index),
    ).toEqual([0, 1]);
    await expect(
      fs.access(path.join(outputPath, "data", "episode_000002.json")),
    ).rejects.toThrow();
    expect(result.entryRoute).toBe("/local/demo_v21_unflagged/episode_0");
  });

  test("rejects exporting into an existing directory", async () => {
    const outputPath = path.join(tempRoot, "existing-output");
    await fs.mkdir(outputPath, { recursive: true });

    await expect(
      exportFilteredDataset({
        repoId: "local/demo_v21",
        datasetPath: datasetRoot,
        flaggedEpisodeIds: [1],
        mode: "flagged",
        outputPath,
        alias: "demo_v21_flagged",
      }),
    ).rejects.toThrow("输出目录已存在");
  });
});
