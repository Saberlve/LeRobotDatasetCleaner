import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, test, vi } from "vitest";
import { frames, profile, schema } from "./fixtures";

const state = vi.hoisted(() => ({
  root: "",
  info: {} as Record<string, unknown>,
}));
vi.mock("@/utils/versionUtils", () => ({
  getDatasetVersionAndInfo: async () => ({ version: "v3.0", info: state.info }),
  buildVersionedUrl: (_repo: string, _version: string, file: string) =>
    path.join(state.root, file),
  getDatasetStats: async () => null,
}));
vi.mock("@/utils/parquetUtils", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchParquetFile: async (file: string) => {
    const bytes = await fs.readFile(file);
    return bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
  },
}));

import { analyzeEpisodeInitialIdle, loadEpisodeSignalFrames } from "../load";

afterEach(async () => {
  if (state.root) await fs.rm(state.root, { recursive: true, force: true });
});

test("reads actual parquet arrays and bigint indices across metadata chunks without neighboring episodes", async () => {
  state.root = await fs.mkdtemp(
    path.join(os.tmpdir(), "initial-idle-parquet-"),
  );
  state.info = schema();
  await promisify(execFile)("python3", [
    "-c",
    [
      "import json, pathlib, sys",
      "import pyarrow as pa",
      "import pyarrow.parquet as pq",
      "root = pathlib.Path(sys.argv[1])",
      "frames = json.loads(sys.argv[2])",
      "def write(relative, rows):",
      "    target = root / relative",
      "    target.parent.mkdir(parents=True, exist_ok=True)",
      "    pq.write_table(pa.Table.from_pylist(rows), target)",
      "write('meta/episodes/chunk-000/file-000.parquet', [{'episode_index': 7}])",
      "write('meta/episodes/chunk-001/file-000.parquet', [{'episode_index': 8, 'data/chunk_index': 1, 'data/file_index': 2, 'dataset_from_index': 102, 'dataset_to_index': 162, 'length': 60}])",
      "def row(f, ep, idx):",
      "    return {'episode_index': ep, 'frame_index': f['frameIndex'], 'index': idx, 'timestamp': f['timestamp'], 'observation.state': f['state'], 'action': f['action']}",
      "rows = [row(frames[0], 7, 100), row(frames[1], 7, 101)]",
      "rows += [row(f, 8, 102 + i) for i, f in enumerate(frames)]",
      "rows += [row(frames[0], 9, 162)]",
      "write('data/chunk-001/file-002.parquet', rows)",
    ].join("\n"),
    state.root,
    JSON.stringify(frames()),
  ]);
  expect(await loadEpisodeSignalFrames("lab/parquet", 8, profile())).toEqual(
    frames(),
  );
  expect(
    await analyzeEpisodeInitialIdle("lab/parquet", 8, profile()),
  ).toMatchObject({
    status: "candidate",
    candidate: {
      removedFrames: { start: 0, end: 23 },
      reviewStatus: "pending",
    },
  });
});
