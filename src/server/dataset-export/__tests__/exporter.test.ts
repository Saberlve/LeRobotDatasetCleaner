import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { exportFilteredDataset } from "@/server/dataset-export/exporter";
import { loadLocalDatasetRegistry } from "@/server/local-datasets/registry";

const execFileAsync = promisify(execFile);

async function writeParquetFixture(
  filePath: string,
  rows: Array<Record<string, number>>,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await execFileAsync("python3", [
    "-c",
    [
      "import json, sys",
      "import pyarrow as pa",
      "import pyarrow.parquet as pq",
      "output_path = sys.argv[1]",
      "rows = json.loads(sys.argv[2])",
      "columns = {key: [row[key] for row in rows] for key in rows[0]}",
      "table = pa.table(columns).replace_schema_metadata({",
      '    b\'huggingface\': b\'{"features":{"action":{"_type":"List"}}}\',',
      "})",
      "pq.write_table(table, output_path)",
    ].join("\n"),
    filePath,
    JSON.stringify(rows),
  ]);
}

async function readParquetFixture(
  filePath: string,
): Promise<{ columns: Record<string, number[]>; huggingfaceMetadata: string }> {
  const { stdout } = await execFileAsync("python3", [
    "-c",
    [
      "import json, sys",
      "import pyarrow.parquet as pq",
      "table = pq.read_table(sys.argv[1])",
      "metadata = table.schema.metadata or {}",
      "print(json.dumps({",
      "    'columns': {name: table[name].to_pylist() for name in table.column_names},",
      "    'huggingfaceMetadata': metadata.get(b'huggingface', b'').decode('utf-8'),",
      "}))",
    ].join("\n"),
    filePath,
  ]);
  return JSON.parse(stdout) as {
    columns: Record<string, number[]>;
    huggingfaceMetadata: string;
  };
}

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
    process.env.LOCAL_DATASET_REGISTRY_PATH = path.join(
      tempRoot,
      "registry.json",
    );
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
      await fs.readFile(
        path.join(outputPath, "data", "episode_000000.json"),
        "utf8",
      ),
    );
    const exportedEpisodeOne = JSON.parse(
      await fs.readFile(
        path.join(outputPath, "data", "episode_000001.json"),
        "utf8",
      ),
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
      exportedEpisodes.map(
        (entry: { episode_index: number }) => entry.episode_index,
      ),
    ).toEqual([0, 1]);
    expect(
      exportedEpisodes.map(
        (entry: { source_episode_index: number }) => entry.source_episode_index,
      ),
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

  test("exports v2.1 datasets whose episode metadata uses the info data_path template", async () => {
    const outputPath = path.join(tempRoot, "demo_v21_template_flagged");
    await fs.mkdir(path.join(datasetRoot, "data", "chunk-000"), {
      recursive: true,
    });
    await fs.mkdir(
      path.join(datasetRoot, "videos", "chunk-000", "egocentric"),
      {
        recursive: true,
      },
    );
    await fs.writeFile(
      path.join(datasetRoot, "meta", "info.json"),
      JSON.stringify(
        {
          codebase_version: "v2.1",
          robot_type: "SO101",
          total_episodes: 3,
          total_frames: 30,
          total_tasks: 1,
          total_videos: 0,
          total_chunks: 1,
          chunks_size: 1000,
          fps: 30,
          data_path:
            "data/chunk-{episode_chunk:03d}/episode_{episode_index:06d}.parquet",
          video_path:
            "videos/chunk-{episode_chunk:03d}/egocentric/episode_{episode_index:06d}.mp4",
          features: {
            "observation.images.egocentric": {
              dtype: "video",
              shape: [480, 640, 3],
              names: ["height", "width", "channel"],
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );
    await fs.writeFile(
      path.join(datasetRoot, "meta", "episodes.jsonl"),
      [
        JSON.stringify({ episode_index: 0, length: 10 }),
        JSON.stringify({ episode_index: 1, length: 11 }),
        JSON.stringify({ episode_index: 2, length: 12 }),
      ].join("\n") + "\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(datasetRoot, "meta", "episodes_stats.jsonl"),
      [
        JSON.stringify({ episode_index: 0, mean: 0.1 }),
        JSON.stringify({ episode_index: 1, mean: 0.2 }),
        JSON.stringify({ episode_index: 2, mean: 0.3 }),
      ].join("\n") + "\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(datasetRoot, "meta", "tasks.jsonl"),
      `${JSON.stringify({ task_index: 0, task: "pick" })}\n`,
      "utf8",
    );
    await fs.writeFile(
      path.join(datasetRoot, "meta", "lang_map.json"),
      JSON.stringify({ pick: 0 }, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(datasetRoot, "meta", "modality.json"),
      JSON.stringify({ video: ["observation.images.egocentric"] }, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(datasetRoot, "meta", "stats.json"),
      JSON.stringify({ action: { mean: [999] } }, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(datasetRoot, "meta", "stats_psi0.json"),
      JSON.stringify({ action: { mean: [123] } }, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(datasetRoot, "data", "chunk-000", "episode_000001.parquet"),
      "episode-one",
      "utf8",
    );
    await fs.writeFile(
      path.join(
        datasetRoot,
        "videos",
        "chunk-000",
        "egocentric",
        "episode_000001.mp4",
      ),
      "video-one",
      "utf8",
    );

    const result = await exportFilteredDataset({
      repoId: "local/demo_v21",
      datasetPath: datasetRoot,
      flaggedEpisodeIds: [1],
      mode: "flagged",
      outputPath,
      alias: "demo_v21_template_flagged",
    });

    const exportedPayload = await fs.readFile(
      path.join(outputPath, "data", "chunk-000", "episode_000000.parquet"),
      "utf8",
    );
    const exportedVideo = await fs.readFile(
      path.join(
        outputPath,
        "videos",
        "chunk-000",
        "egocentric",
        "episode_000000.mp4",
      ),
      "utf8",
    );
    const exportedEpisodes = (
      await fs.readFile(path.join(outputPath, "meta", "episodes.jsonl"), "utf8")
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const exportedEpisodeStats = (
      await fs.readFile(
        path.join(outputPath, "meta", "episodes_stats.jsonl"),
        "utf8",
      )
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    expect(result.repoId).toBe("local/demo_v21_template_flagged");
    expect(exportedPayload).toBe("episode-one");
    expect(exportedVideo).toBe("video-one");
    await expect(
      fs.access(path.join(outputPath, "meta", "stats.json")),
    ).rejects.toThrow();
    await expect(
      fs.access(path.join(outputPath, "meta", "stats_psi0.json")),
    ).rejects.toThrow();
    await expect(
      fs.access(path.join(outputPath, "meta", "tasks.jsonl")),
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(outputPath, "meta", "lang_map.json")),
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(outputPath, "meta", "modality.json")),
    ).resolves.toBeUndefined();
    expect(exportedEpisodes).toEqual([
      expect.objectContaining({
        episode_index: 0,
        source_episode_index: 1,
        length: 11,
      }),
    ]);
    expect(exportedEpisodeStats).toEqual([
      expect.objectContaining({
        episode_index: 0,
        source_episode_index: 1,
        mean: 0.2,
      }),
    ]);
  });

  test("rewrites parquet episode row indexes and aggregate metadata after filtering", async () => {
    const outputPath = path.join(tempRoot, "demo_v21_parquet_unflagged");
    await fs.mkdir(path.join(datasetRoot, "data", "chunk-000"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(datasetRoot, "meta", "info.json"),
      JSON.stringify(
        {
          codebase_version: "v2.1",
          robot_type: "SO101",
          total_episodes: 3,
          total_frames: 7,
          total_tasks: 1,
          total_videos: 0,
          total_chunks: 1,
          chunks_size: 1000,
          fps: 30,
          splits: { train: "0:3" },
          data_path:
            "data/chunk-{episode_chunk:03d}/episode_{episode_index:06d}.parquet",
          video_path: null,
          features: {
            action: {
              dtype: "float32",
              shape: [1],
              names: ["motor"],
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );
    await fs.writeFile(
      path.join(datasetRoot, "meta", "episodes.jsonl"),
      [
        JSON.stringify({ episode_index: 0, length: 2 }),
        JSON.stringify({ episode_index: 1, length: 2 }),
        JSON.stringify({ episode_index: 2, length: 3 }),
      ].join("\n") + "\n",
      "utf8",
    );
    await writeParquetFixture(
      path.join(datasetRoot, "data", "chunk-000", "episode_000000.parquet"),
      [
        { episode_index: 0, index: 0, frame_index: 0, timestamp: 0 },
        { episode_index: 0, index: 1, frame_index: 1, timestamp: 1 },
      ],
    );
    await writeParquetFixture(
      path.join(datasetRoot, "data", "chunk-000", "episode_000002.parquet"),
      [
        { episode_index: 2, index: 4, frame_index: 0, timestamp: 0 },
        { episode_index: 2, index: 5, frame_index: 1, timestamp: 1 },
        { episode_index: 2, index: 6, frame_index: 2, timestamp: 2 },
      ],
    );

    await exportFilteredDataset({
      repoId: "local/demo_v21",
      datasetPath: datasetRoot,
      flaggedEpisodeIds: [1],
      mode: "unflagged",
      outputPath,
      alias: "demo_v21_parquet_unflagged",
    });

    const exportedInfo = JSON.parse(
      await fs.readFile(path.join(outputPath, "meta", "info.json"), "utf8"),
    );
    const exportedEpisodeZero = await readParquetFixture(
      path.join(outputPath, "data", "chunk-000", "episode_000000.parquet"),
    );
    const exportedEpisodeOne = await readParquetFixture(
      path.join(outputPath, "data", "chunk-000", "episode_000001.parquet"),
    );

    expect(exportedInfo).toMatchObject({
      total_episodes: 2,
      total_frames: 5,
      total_videos: 0,
      total_chunks: 1,
      splits: { train: "0:2" },
    });
    expect(exportedEpisodeZero.columns).toMatchObject({
      episode_index: [0, 0],
      index: [0, 1],
      frame_index: [0, 1],
    });
    expect(exportedEpisodeOne.columns).toMatchObject({
      episode_index: [1, 1, 1],
      index: [2, 3, 4],
      frame_index: [0, 1, 2],
    });
    expect(exportedEpisodeOne.huggingfaceMetadata).toContain(
      '"_type": "Sequence"',
    );
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
        const filePath =
          typeof args[0] === "string" ? args[0] : String(args[0]);
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
      JSON.stringify(
        { episode_index: 999, frames: [{ timestamp: 0, action: "escape" }] },
        null,
        2,
      ),
      "utf8",
    );

    try {
      await fs.rm(path.join(datasetRoot, "data", "episode_000000.json"));
      await fs.symlink(
        outsidePayload,
        path.join(datasetRoot, "data", "episode_000000.json"),
      );
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
    ).rejects.toThrow(
      "Episode metadata is invalid: data_file must be a non-empty string",
    );
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
