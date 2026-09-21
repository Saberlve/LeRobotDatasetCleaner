import { beforeEach, describe, expect, test, vi } from "vitest";
import { frames, profile, schema } from "./fixtures";

const state = vi.hoisted(() => ({
  batches: [] as Record<string, unknown>[][],
  data: [] as Record<string, unknown>[],
  info: {} as Record<string, unknown>,
  rangeFailure: false,
}));
const mocks = vi.hoisted(() => ({ fetchFile: vi.fn(), read: vi.fn() }));

vi.mock("@/app/[org]/[dataset]/[episode]/fetch-data", () => ({
  iterateEpisodeMetadataFilesV3: async function* () {
    for (const batch of state.batches) yield batch;
  },
}));
vi.mock("@/utils/versionUtils", () => ({
  getDatasetVersionAndInfo: async () => ({
    version: state.info.codebase_version,
    info: state.info,
  }),
  buildVersionedUrl: (_repo: string, _version: string, path: string) => path,
}));
vi.mock("@/utils/parquetUtils", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchParquetFile: mocks.fetchFile,
  readParquetAsObjects: mocks.read,
}));

import { analyzeEpisodeInitialIdle, loadEpisodeSignalFrames } from "../load";

beforeEach(() => {
  vi.clearAllMocks();
  state.rangeFailure = false;
  state.info = {
    ...schema(),
    chunks_size: 1000,
    data_path:
      "data/chunk-{episode_chunk:03d}/episode_{episode_index:06d}.parquet",
  };
  state.batches = [
    [{ episode_index: BigInt(7) }],
    [
      {
        episode_index: BigInt(8),
        "data/chunk_index": BigInt(1),
        "data/file_index": BigInt(2),
        dataset_from_index: BigInt(102),
        dataset_to_index: BigInt(162),
        length: BigInt(60),
      },
    ],
  ];
  const row = (
    f: ReturnType<typeof frames>[number],
    episode: number,
    index: number,
  ) => ({
    episode_index: BigInt(episode),
    frame_index: BigInt(f.frameIndex),
    index: BigInt(index),
    timestamp: f.timestamp,
    "observation.state": f.state,
    action: f.action,
  });
  state.data = [
    row(frames()[0], 7, 100),
    row(frames()[1], 7, 101),
    ...frames().map((f, i) => row(f, 8, i + 102)),
    row(frames()[0], 9, 162),
  ];
  mocks.fetchFile.mockResolvedValue({});
  mocks.read.mockImplementation(
    async (
      _file: unknown,
      _columns: string[],
      options?: { rowStart?: number; rowEnd?: number },
    ) => {
      if (state.rangeFailure && options) throw new Error("range unavailable");
      return options
        ? state.data.slice(options.rowStart, options.rowEnd)
        : state.data;
    },
  );
});

describe("complete original episode signal loading", () => {
  test("finds metadata in later batches and converts global bounds to file-local offsets", async () => {
    const rows = await loadEpisodeSignalFrames("lab/data", 8, profile());
    expect(rows).toEqual(frames());
    expect(mocks.fetchFile).toHaveBeenCalledWith(
      "data/chunk-001/file-002.parquet",
    );
    expect(mocks.read.mock.calls[1][2]).toEqual({ rowStart: 2, rowEnd: 62 });
    expect(mocks.read.mock.calls[1][1]).toEqual(
      expect.arrayContaining([
        "frame_index",
        "episode_index",
        "observation.state",
        "action",
      ]),
    );
    expect(
      (await analyzeEpisodeInitialIdle("lab/data", 8, profile())).status,
    ).toBe("candidate");
  });
  test("full-file fallback isolates the target episode", async () => {
    state.rangeFailure = true;
    expect(await loadEpisodeSignalFrames("lab/data", 8, profile())).toEqual(
      frames(),
    );
  });
  test.each(["v2.0", "v2.1"])(
    "loads all rows of %s with padded paths",
    async (version) => {
      state.info.codebase_version = version;
      state.data = state.data.filter((r) => r.episode_index === BigInt(8));
      expect(await loadEpisodeSignalFrames("lab/data", 8, profile())).toEqual(
        frames(),
      );
      expect(mocks.fetchFile).toHaveBeenCalledWith(
        "data/chunk-000/episode_000008.parquet",
      );
    },
  );
  test.each([
    "missing_metadata",
    "wrong_length",
    "truncated_rows",
    "duplicate_index",
    "wrong_episode",
    "nan_signal",
  ])("does not produce a candidate from %s", async (kind) => {
    switch (kind) {
      case "missing_metadata":
        delete state.batches[1][0]["dataset_from_index"];
        break;
      case "wrong_length":
        state.batches[1][0].length = 1;
        break;
      case "truncated_rows":
        state.data.splice(20, 1);
        break;
      case "duplicate_index":
        state.data[20].index = state.data[19].index;
        break;
      case "wrong_episode":
        state.data[20].episode_index = BigInt(9);
        break;
      case "nan_signal":
        state.data[20].action = [NaN, 0];
        break;
    }
    expect(
      await analyzeEpisodeInitialIdle("lab/data", 8, profile()),
    ).toMatchObject({ status: "needs_review", candidate: null });
  });
  test("missing event and missing metadata never invent zeros", async () => {
    expect(
      (
        await analyzeEpisodeInitialIdle("lab/data", 8, {
          ...profile(),
          startEventKey: "start",
        })
      ).status,
    ).toBe("needs_review");
    state.batches = [];
    expect(
      (await analyzeEpisodeInitialIdle("lab/data", 8, profile())).status,
    ).toBe("needs_review");
  });
  test("supports typed vectors and singleton parquet scalars", async () => {
    state.data = state.data.map((r) => ({
      ...r,
      timestamp: [r.timestamp],
      action: new Float64Array(r.action as number[]),
    }));
    expect(await loadEpisodeSignalFrames("lab/data", 8, profile())).toEqual(
      frames(),
    );
  });
});
