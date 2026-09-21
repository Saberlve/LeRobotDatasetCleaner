import { beforeEach, describe, expect, test, vi } from "vitest";
import { frames, profile, schema } from "./fixtures";
const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  videos: vi.fn(),
  sample: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock("../load", () => ({ loadEpisodeSignalFrames: mocks.load }));
vi.mock("@/app/[org]/[dataset]/[episode]/fetch-data", () => ({
  getEpisodeVideosInfo: mocks.videos,
}));
vi.mock("../tail-video", () => ({
  createTailVideoSampler: () => ({
    sample: mocks.sample,
    dispose: mocks.dispose,
  }),
}));
import {
  runIdleBatch,
  selectBatchEpisodes,
  type BatchEntry,
  type BatchMode,
} from "../batch";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.load.mockResolvedValue(frames());
  mocks.videos.mockResolvedValue([{ filename: "camera", url: "/video" }]);
  mocks.sample.mockResolvedValue([
    { camera: "camera", pixels: new Uint8ClampedArray([20, 40, 80, 255]) },
  ]);
});
function options(mode: BatchMode = "both") {
  const results: BatchEntry[] = [];
  const controller = new AbortController();
  return {
    results,
    controller,
    input: {
      repoId: "local/test",
      episodes: [0, 1],
      mode,
      profiles: { start: profile(), end: profile() },
      schema: schema(),
      signal: controller.signal,
      onProgress: vi.fn(),
      onResult: (r: BatchEntry) => results.push(r),
    },
  };
}
describe("batch detection", () => {
  test("count selects real episode IDs and clips at dataset end", () => {
    expect(selectBatchEpisodes([5, 0, 2], 2, 10)).toEqual([2, 5]);
    expect(() => selectBatchEpisodes([0, 1], 0, 1.5)).toThrow();
    expect(() => selectBatchEpisodes([0, 1], 0, 0)).toThrow();
    expect(() => selectBatchEpisodes([0, 1], 9, 1)).toThrow();
  });
  test.each(["start", "end", "both"] as const)(
    "%s mode runs exactly the selected edges",
    async (mode) => {
      const { input, results } = options(mode);
      await runIdleBatch(input);
      expect(results.map((r) => `${r.episodeId}:${r.edge}`)).toEqual(
        mode === "both"
          ? ["0:start", "0:end", "1:start", "1:end"]
          : [`0:${mode}`, `1:${mode}`],
      );
      expect(mocks.videos).toHaveBeenCalledTimes(mode === "start" ? 0 : 2);
      expect(mocks.dispose).toHaveBeenCalledTimes(mode === "start" ? 0 : 2);
    },
  );
  test("one edge read failure does not suppress other episodes or tail analysis", async () => {
    const { input, results } = options();
    mocks.load.mockRejectedValueOnce(Error("missing rows"));
    await runIdleBatch(input);
    expect(results[0].error).toBe("missing rows");
    expect(results).toHaveLength(4);
    expect(results[1].result).toBeTruthy();
  });
  test("stopping in a read discards its late result and starts no more jobs", async () => {
    const { input, results, controller } = options();
    mocks.load.mockImplementationOnce(async () => {
      controller.abort();
      return frames();
    });
    await expect(runIdleBatch(input)).rejects.toThrow();
    expect(results).toHaveLength(0);
    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(mocks.videos).not.toHaveBeenCalled();
  });
  test("settings snapshot cannot be changed during a batch", async () => {
    const { input, results } = options("start");
    input.onProgress.mockImplementation(() => {
      input.profiles.start.contextSeconds = 100;
    });
    await runIdleBatch(input);
    expect(
      results.every(
        (r) => r.profile.contextSeconds === 0.5 && r.result?.candidate,
      ),
    ).toBe(true);
  });
  test("cancelling during video sampling disposes decoders and publishes no partial candidate", async () => {
    const { input, results, controller } = options("end");
    mocks.load.mockResolvedValue(
      frames().map((f) => ({ ...f, state: [0, 0], action: [0, 0] })),
    );
    mocks.sample.mockImplementationOnce(async () => {
      controller.abort();
      throw Error("cancelled");
    });
    await expect(runIdleBatch(input)).rejects.toThrow();
    expect(mocks.dispose).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(0);
  });
  test("invalid settings are rejected before any reads", async () => {
    const { input } = options();
    input.profiles.end.contextSeconds = -1;
    await expect(runIdleBatch(input)).rejects.toThrow();
    expect(mocks.load).not.toHaveBeenCalled();
  });
});
