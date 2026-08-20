import { afterEach, describe, expect, test, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.doUnmock("@/server/dataset-export/exporter");
});

describe("POST /api/local-datasets/export", () => {
  test("returns 400 for invalid payloads", async () => {
    const { POST } = await import("@/app/api/local-datasets/export/route");
    const response = await POST(
      new Request("http://localhost/api/local-datasets/export", {
        method: "POST",
        body: JSON.stringify({ repoId: "local/demo", mode: "flagged" }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "请求体必须包含 repoId、flaggedEpisodeIds、mode 和 outputPath。",
    });
  });

  test("passes parsed values to exporter and returns JSON result", async () => {
    const exportFilteredDataset = vi.fn().mockResolvedValue({
      repoId: "local/demo_unflagged",
      path: "/tmp/demo_unflagged",
      mode: "unflagged",
      totalEpisodes: 4,
      entryRoute: "/local/demo_unflagged/episode_0",
      summary: {
        sourceRepoId: "local/demo",
        sourceTotalEpisodes: 5,
        exportedEpisodes: 4,
        droppedEpisodes: 1,
      },
    });

    vi.doMock("@/server/dataset-export/exporter", () => ({
      exportFilteredDataset,
    }));

    const { POST } = await import("@/app/api/local-datasets/export/route");
    const response = await POST(
      new Request("http://localhost/api/local-datasets/export", {
        method: "POST",
        body: JSON.stringify({
          repoId: "local/demo",
          flaggedEpisodeIds: [1],
          mode: "unflagged",
          outputPath: "/tmp/demo_unflagged",
          alias: "demo_unflagged",
        }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(response.status).toBe(200);
    expect(exportFilteredDataset).toHaveBeenCalledWith({
      repoId: "local/demo",
      flaggedEpisodeIds: [1],
      mode: "unflagged",
      outputPath: "/tmp/demo_unflagged",
      alias: "demo_unflagged",
    });
    await expect(response.json()).resolves.toEqual({
      repoId: "local/demo_unflagged",
      path: "/tmp/demo_unflagged",
      mode: "unflagged",
      totalEpisodes: 4,
      entryRoute: "/local/demo_unflagged/episode_0",
      summary: {
        sourceRepoId: "local/demo",
        sourceTotalEpisodes: 5,
        exportedEpisodes: 4,
        droppedEpisodes: 1,
      },
    });
  });
});
