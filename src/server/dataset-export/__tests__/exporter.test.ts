import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { exportFilteredDataset } from "@/server/dataset-export/exporter";
import { loadLocalDatasetRegistry } from "@/server/local-datasets/registry";

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
    const exportedEpisodeZero = JSON.parse(
      await fs.readFile(path.join(outputPath, "data", "episode_000000.json"), "utf8"),
    );
    const exportedEpisodeOne = JSON.parse(
      await fs.readFile(path.join(outputPath, "data", "episode_000001.json"), "utf8"),
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
    const registryEntries = await loadLocalDatasetRegistry();

    expect(result.repoId).toBe("local/demo_v21_unflagged");
    expect(exportedInfo.total_episodes).toBe(2);
    expect(exportedEpisodeZero).toMatchObject({
      episode_index: 0,
      source_episode_index: 0,
    });
    expect(exportedEpisodeOne).toMatchObject({
      episode_index: 1,
      source_episode_index: 2,
    });
    expect(
      exportedEpisodes.map((entry: { episode_index: number }) => entry.episode_index),
    ).toEqual([0, 1]);
    expect(
      exportedEpisodes.map((entry: { source_episode_index: number }) => entry.source_episode_index),
    ).toEqual([0, 2]);
    expect(registryEntries).toEqual([
      expect.objectContaining({
        repoId: "local/demo_v21_unflagged",
        displayName: "demo_v21_unflagged",
        path: path.resolve(outputPath),
        version: "v2.1",
        totalEpisodes: 2,
        fps: 30,
        robotType: "SO101",
      }),
    ]);
    await expect(
      fs.access(path.join(outputPath, "data", "episode_000002.json")),
    ).rejects.toThrow();
    expect(result.entryRoute).toBe("/local/demo_v21_unflagged/episode_0");
  });

  test("rejects aliases that resolve to the source repo id before writing output", async () => {
    const outputPath = path.join(tempRoot, "demo_v21_alias_collision");

    await expect(
      exportFilteredDataset({
        repoId: "local/demo_v21",
        datasetPath: datasetRoot,
        flaggedEpisodeIds: [1],
        mode: "flagged",
        outputPath,
        alias: "demo_v21",
      }),
    ).rejects.toThrow("Export repo id must differ from the source repo id");
    await expect(fs.access(outputPath)).rejects.toThrow();
  });

  test("rejects episode metadata that points outside the dataset root", async () => {
    const outputPath = path.join(tempRoot, "demo_v21_bad_data_file");
    await fs.writeFile(
      path.join(datasetRoot, "meta", "episodes.jsonl"),
      [
        JSON.stringify({
          episode_index: 0,
          tasks: ["pick"],
          data_file: "../escape.json",
        }),
        JSON.stringify({
          episode_index: 1,
          tasks: ["pick"],
          data_file: "data/episode_000001.json",
        }),
        JSON.stringify({
          episode_index: 2,
          tasks: ["pick"],
          data_file: "data/episode_000002.json",
        }),
      ].join("\n") + "\n",
      "utf8",
    );

    await expect(
      exportFilteredDataset({
        repoId: "local/demo_v21",
        datasetPath: datasetRoot,
        flaggedEpisodeIds: [1],
        mode: "unflagged",
        outputPath,
        alias: "demo_v21_bad_data_file",
      }),
    ).rejects.toThrow("Episode data_file must stay within the dataset root");
    await expect(fs.access(outputPath)).rejects.toThrow();
  });

  test("cleans up the written output when registration fails afterward", async () => {
    const outputPath = path.join(tempRoot, "demo_v21_registry_failure");
    await fs.writeFile(process.env.LOCAL_DATASET_REGISTRY_PATH!, "{", "utf8");

    await expect(
      exportFilteredDataset({
        repoId: "local/demo_v21",
        datasetPath: datasetRoot,
        flaggedEpisodeIds: [1],
        mode: "unflagged",
        outputPath,
        alias: "demo_v21_registry_failure",
      }),
    ).rejects.toThrow("Local dataset registry is malformed");
    await expect(fs.access(outputPath)).rejects.toThrow();
  });

  test("cleans up partial output when writing fails after temp directory creation", async () => {
    const outputPath = path.join(tempRoot, "demo_v21_partial_write_failure");
    const originalWriteFile = fs.writeFile.bind(fs);
    const writeFileSpy = vi
      .spyOn(fs, "writeFile")
      .mockImplementation(async (...args: Parameters<typeof fs.writeFile>) => {
        const filePath = typeof args[0] === "string" ? args[0] : String(args[0]);
        if (filePath.endsWith(path.join("meta", "info.json"))) {
          throw new Error("simulated write failure");
        }

        return originalWriteFile(...args);
      });

    await expect(
      exportFilteredDataset({
        repoId: "local/demo_v21",
        datasetPath: datasetRoot,
        flaggedEpisodeIds: [1],
        mode: "unflagged",
        outputPath,
        alias: "demo_v21_partial_write_failure",
      }),
    ).rejects.toThrow("simulated write failure");

    writeFileSpy.mockRestore();
    await expect(fs.access(outputPath)).rejects.toThrow();
  });

  test("rejects symlinked episode payloads that escape the dataset root", async () => {
    const outputPath = path.join(tempRoot, "demo_v21_symlink_escape");
    const outsidePayload = path.join(tempRoot, "outside-episode.json");
    await fs.writeFile(
      outsidePayload,
      JSON.stringify({ episode_index: 999, frames: [{ timestamp: 0, action: "escape" }] }, null, 2),
      "utf8",
    );

    try {
      await fs.rm(path.join(datasetRoot, "data", "episode_000000.json"));
      await fs.symlink(outsidePayload, path.join(datasetRoot, "data", "episode_000000.json"));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EPERM" || code === "EACCES" || code === "ENOSYS") {
        return;
      }

      throw error;
    }

    await expect(
      exportFilteredDataset({
        repoId: "local/demo_v21",
        datasetPath: datasetRoot,
        flaggedEpisodeIds: [1],
        mode: "unflagged",
        outputPath,
        alias: "demo_v21_symlink_escape",
      }),
    ).rejects.toThrow("Episode data_file must stay within the dataset root");
    await expect(fs.access(outputPath)).rejects.toThrow();
  });

  test("rejects duplicate episode metadata entries", async () => {
    const outputPath = path.join(tempRoot, "demo_v21_duplicate_episode");
    await fs.writeFile(
      path.join(datasetRoot, "meta", "episodes.jsonl"),
      [
        JSON.stringify({
          episode_index: 0,
          tasks: ["pick"],
          data_file: "data/episode_000000.json",
        }),
        JSON.stringify({
          episode_index: 0,
          tasks: ["pick-again"],
          data_file: "data/episode_000001.json",
        }),
      ].join("\n") + "\n",
      "utf8",
    );

    await expect(
      exportFilteredDataset({
        repoId: "local/demo_v21",
        datasetPath: datasetRoot,
        flaggedEpisodeIds: [1],
        mode: "unflagged",
        outputPath,
        alias: "demo_v21_duplicate_episode",
      }),
    ).rejects.toThrow("Episode metadata is invalid: duplicate episode_index");
    await expect(fs.access(outputPath)).rejects.toThrow();
  });

  test("rejects malformed episode metadata data_file values", async () => {
    const outputPath = path.join(tempRoot, "demo_v21_bad_episode_shape");
    await fs.writeFile(
      path.join(datasetRoot, "meta", "episodes.jsonl"),
      [
        JSON.stringify({
          episode_index: 0,
          tasks: ["pick"],
          data_file: "",
        }),
        JSON.stringify({
          episode_index: 1,
          tasks: ["pick"],
          data_file: "data/episode_000001.json",
        }),
      ].join("\n") + "\n",
      "utf8",
    );

    await expect(
      exportFilteredDataset({
        repoId: "local/demo_v21",
        datasetPath: datasetRoot,
        flaggedEpisodeIds: [1],
        mode: "unflagged",
        outputPath,
        alias: "demo_v21_bad_episode_shape",
      }),
    ).rejects.toThrow("Episode metadata is invalid: data_file must be a non-empty string");
    await expect(fs.access(outputPath)).rejects.toThrow();
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
