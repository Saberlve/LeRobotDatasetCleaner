import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  buildLocalDatasetUrl,
  isLocalDatasetRepoId,
} from "@/utils/localDatasets";
import { buildVersionedUrl } from "@/utils/versionUtils";

// ---------------------------------------------------------------------------
// buildVersionedUrl — pure function, no mocking needed
// ---------------------------------------------------------------------------
describe("buildVersionedUrl", () => {
  test("builds URL for v2.0 dataset data path", () => {
    const url = buildVersionedUrl(
      "rabhishek100/so100_train_dataset",
      "v2.0",
      "data/000/episode_000000.parquet",
    );
    expect(url).toBe(
      "https://huggingface.co/datasets/rabhishek100/so100_train_dataset/resolve/main/data/000/episode_000000.parquet",
    );
  });

  test("builds URL for v2.1 dataset video path", () => {
    const url = buildVersionedUrl(
      "youliangtan/so101-table-cleanup",
      "v2.1",
      "videos/observation.images.top/chunk-000/episode_000007.mp4",
    );
    expect(url).toBe(
      "https://huggingface.co/datasets/youliangtan/so101-table-cleanup/resolve/main/videos/observation.images.top/chunk-000/episode_000007.mp4",
    );
  });

  test("builds URL for v3.0 episode metadata", () => {
    const url = buildVersionedUrl(
      "lerobot-data-collection/level12_rac_2_2026-02-07",
      "v3.0",
      "meta/episodes/chunk-000/file-000.parquet",
    );
    expect(url).toBe(
      "https://huggingface.co/datasets/lerobot-data-collection/level12_rac_2_2026-02-07/resolve/main/meta/episodes/chunk-000/file-000.parquet",
    );
  });

  test("builds URL for v3.0 data chunk", () => {
    const url = buildVersionedUrl(
      "lerobot-data-collection/level12_rac_2_2026-02-07",
      "v3.0",
      "data/chunk-001/file-003.parquet",
    );
    expect(url).toBe(
      "https://huggingface.co/datasets/lerobot-data-collection/level12_rac_2_2026-02-07/resolve/main/data/chunk-001/file-003.parquet",
    );
  });

  test("builds URL for meta/info.json", () => {
    const url = buildVersionedUrl("myorg/mydataset", "v3.0", "meta/info.json");
    expect(url).toBe(
      "https://huggingface.co/datasets/myorg/mydataset/resolve/main/meta/info.json",
    );
  });

  test("builds URL for configured local dataset assets", () => {
    const previous = process.env.LOCAL_LEROBOT_DATASETS_JSON;
    const previousBaseUrl = process.env.LOCAL_DATASET_BASE_URL;
    process.env.LOCAL_LEROBOT_DATASETS_JSON = JSON.stringify({
      "local/pickXtimes_v21_filtered": "/mnt/d/pickXtimes_v21_filtered",
    });
    process.env.LOCAL_DATASET_BASE_URL = "http://127.0.0.1:3000";

    try {
      const url = buildVersionedUrl(
        "local/pickXtimes_v21_filtered",
        "v2.1",
        "meta/info.json",
      );
      expect(url).toBe(
        "http://127.0.0.1:3000/api/local-datasets/local/pickXtimes_v21_filtered/meta/info.json",
      );
    } finally {
      if (previous === undefined) {
        delete process.env.LOCAL_LEROBOT_DATASETS_JSON;
      } else {
        process.env.LOCAL_LEROBOT_DATASETS_JSON = previous;
      }
      if (previousBaseUrl === undefined) {
        delete process.env.LOCAL_DATASET_BASE_URL;
      } else {
        process.env.LOCAL_DATASET_BASE_URL = previousBaseUrl;
      }
    }
  });

  test("builds local dataset url from persistent registry when env is empty", async () => {
    const previousEnvRegistry = process.env.LOCAL_LEROBOT_DATASETS_JSON;
    const previousRegistryPath = process.env.LOCAL_DATASET_REGISTRY_PATH;
    const previousBaseUrl = process.env.LOCAL_DATASET_BASE_URL;
    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "visualizer-registry-"),
    );
    const registryPath = path.join(tempDir, "registry.json");

    delete process.env.LOCAL_LEROBOT_DATASETS_JSON;
    process.env.LOCAL_DATASET_REGISTRY_PATH = registryPath;
    process.env.LOCAL_DATASET_BASE_URL = "http://127.0.0.1:3000";
    await fs.writeFile(
      registryPath,
      JSON.stringify([
        {
          repoId: "local/straighten_box",
          path: "/mnt/d/straighten_the_box",
          displayName: "straighten_box",
          version: "v2.1",
          totalEpisodes: 4,
          fps: 30,
          robotType: "Acone",
          lastOpenedAt: "2026-04-23T00:00:00.000Z",
        },
      ]),
      "utf8",
    );

    try {
      const url = buildVersionedUrl(
        "local/straighten_box",
        "v2.1",
        "meta/info.json",
      );
      expect(url).toBe(
        "http://127.0.0.1:3000/api/local-datasets/local/straighten_box/meta/info.json",
      );
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
      if (previousEnvRegistry === undefined) {
        delete process.env.LOCAL_LEROBOT_DATASETS_JSON;
      } else {
        process.env.LOCAL_LEROBOT_DATASETS_JSON = previousEnvRegistry;
      }
      if (previousRegistryPath === undefined) {
        delete process.env.LOCAL_DATASET_REGISTRY_PATH;
      } else {
        process.env.LOCAL_DATASET_REGISTRY_PATH = previousRegistryPath;
      }
      if (previousBaseUrl === undefined) {
        delete process.env.LOCAL_DATASET_BASE_URL;
      } else {
        process.env.LOCAL_DATASET_BASE_URL = previousBaseUrl;
      }
    }
  });

  test("ignores env registry entries with non-absolute dataset paths", () => {
    expect(isLocalDatasetRepoId("local/relative_dataset")).toBe(true);
  });

  test("local dataset detection only matches single-segment local repo ids", () => {
    expect(isLocalDatasetRepoId("local/straighten_box")).toBe(true);
    expect(isLocalDatasetRepoId("local/foo/bar")).toBe(false);
    expect(isLocalDatasetRepoId("lerobot/pusht")).toBe(false);
  });

  test("remote dataset urls still resolve when local registry is malformed", async () => {
    const previousEnvRegistry = process.env.LOCAL_LEROBOT_DATASETS_JSON;
    const previousRegistryPath = process.env.LOCAL_DATASET_REGISTRY_PATH;
    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "visualizer-registry-"),
    );
    const registryPath = path.join(tempDir, "registry.json");

    delete process.env.LOCAL_LEROBOT_DATASETS_JSON;
    process.env.LOCAL_DATASET_REGISTRY_PATH = registryPath;
    await fs.writeFile(registryPath, "{not-json", "utf8");

    try {
      expect(buildVersionedUrl("lerobot/pusht", "v2.1", "meta/info.json")).toBe(
        "https://huggingface.co/datasets/lerobot/pusht/resolve/main/meta/info.json",
      );
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
      if (previousEnvRegistry === undefined) {
        delete process.env.LOCAL_LEROBOT_DATASETS_JSON;
      } else {
        process.env.LOCAL_LEROBOT_DATASETS_JSON = previousEnvRegistry;
      }
      if (previousRegistryPath === undefined) {
        delete process.env.LOCAL_DATASET_REGISTRY_PATH;
      } else {
        process.env.LOCAL_DATASET_REGISTRY_PATH = previousRegistryPath;
      }
    }
  });

  test("does not match prototype keys as local dataset repo ids", () => {
    expect(isLocalDatasetRepoId("toString")).toBe(false);
  });

  test("client-side local dataset urls fall back to same-origin api paths", () => {
    const previousPublicBaseUrl =
      process.env.NEXT_PUBLIC_LOCAL_DATASET_BASE_URL;
    const previousServerBaseUrl = process.env.LOCAL_DATASET_BASE_URL;

    delete process.env.NEXT_PUBLIC_LOCAL_DATASET_BASE_URL;
    delete process.env.LOCAL_DATASET_BASE_URL;
    vi.stubGlobal("window", {} as Window & typeof globalThis);

    try {
      expect(
        buildLocalDatasetUrl("local/straighten_box", "meta/info.json"),
      ).toBe("/api/local-datasets/local/straighten_box/meta/info.json");
    } finally {
      vi.unstubAllGlobals();
      if (previousPublicBaseUrl === undefined) {
        delete process.env.NEXT_PUBLIC_LOCAL_DATASET_BASE_URL;
      } else {
        process.env.NEXT_PUBLIC_LOCAL_DATASET_BASE_URL = previousPublicBaseUrl;
      }
      if (previousServerBaseUrl === undefined) {
        delete process.env.LOCAL_DATASET_BASE_URL;
      } else {
        process.env.LOCAL_DATASET_BASE_URL = previousServerBaseUrl;
      }
    }
  });

  test("client-side local dataset urls ignore server base URL to stay same-origin", () => {
    const previousPublicBaseUrl =
      process.env.NEXT_PUBLIC_LOCAL_DATASET_BASE_URL;
    const previousServerBaseUrl = process.env.LOCAL_DATASET_BASE_URL;

    delete process.env.NEXT_PUBLIC_LOCAL_DATASET_BASE_URL;
    process.env.LOCAL_DATASET_BASE_URL = "http://127.0.0.1:3001";
    vi.stubGlobal("window", {} as Window & typeof globalThis);

    try {
      expect(
        buildLocalDatasetUrl(
          "local/pick_X_times_filterd_twice",
          "meta/info.json",
        ),
      ).toBe(
        "/api/local-datasets/local/pick_X_times_filterd_twice/meta/info.json",
      );
    } finally {
      vi.unstubAllGlobals();
      if (previousPublicBaseUrl === undefined) {
        delete process.env.NEXT_PUBLIC_LOCAL_DATASET_BASE_URL;
      } else {
        process.env.NEXT_PUBLIC_LOCAL_DATASET_BASE_URL = previousPublicBaseUrl;
      }
      if (previousServerBaseUrl === undefined) {
        delete process.env.LOCAL_DATASET_BASE_URL;
      } else {
        process.env.LOCAL_DATASET_BASE_URL = previousServerBaseUrl;
      }
    }
  });

  test("server-side local dataset urls use PORT when no base URL is configured", () => {
    const previousPublicBaseUrl =
      process.env.NEXT_PUBLIC_LOCAL_DATASET_BASE_URL;
    const previousServerBaseUrl = process.env.LOCAL_DATASET_BASE_URL;
    const previousPort = process.env.PORT;

    delete process.env.NEXT_PUBLIC_LOCAL_DATASET_BASE_URL;
    delete process.env.LOCAL_DATASET_BASE_URL;
    process.env.PORT = "3001";

    try {
      expect(
        buildLocalDatasetUrl(
          "local/pick_X_times_filterd_twice",
          "meta/info.json",
        ),
      ).toBe(
        "http://127.0.0.1:3001/api/local-datasets/local/pick_X_times_filterd_twice/meta/info.json",
      );
    } finally {
      if (previousPublicBaseUrl === undefined) {
        delete process.env.NEXT_PUBLIC_LOCAL_DATASET_BASE_URL;
      } else {
        process.env.NEXT_PUBLIC_LOCAL_DATASET_BASE_URL = previousPublicBaseUrl;
      }
      if (previousServerBaseUrl === undefined) {
        delete process.env.LOCAL_DATASET_BASE_URL;
      } else {
        process.env.LOCAL_DATASET_BASE_URL = previousServerBaseUrl;
      }
      if (previousPort === undefined) {
        delete process.env.PORT;
      } else {
        process.env.PORT = previousPort;
      }
    }
  });
});

// ---------------------------------------------------------------------------
// getDatasetVersionAndInfo — tested with mocked fetch
// ---------------------------------------------------------------------------
describe("getDatasetVersionAndInfo", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("accepts v2.0 codebase_version", async () => {
    const infoV20 = {
      codebase_version: "v2.0",
      robot_type: "so100",
      total_episodes: 50,
      total_frames: 5000,
      total_tasks: 1,
      chunks_size: 1000,
      data_files_size_in_mb: 10,
      video_files_size_in_mb: 500,
      fps: 30,
      splits: { train: "0:50" },
      data_path: "data/{episode_chunk:03d}/episode_{episode_index:06d}.parquet",
      video_path:
        "videos/{video_key}/chunk-{episode_chunk:03d}/episode_{episode_index:06d}.mp4",
      features: {
        "observation.images.top": {
          dtype: "video",
          shape: [480, 640, 3],
          names: null,
        },
        "observation.state": {
          dtype: "float32",
          shape: [1, 6],
          names: ["j0", "j1", "j2", "j3", "j4", "j5"],
        },
        action: {
          dtype: "float32",
          shape: [1, 6],
          names: ["j0", "j1", "j2", "j3", "j4", "j5"],
        },
      },
    };

    globalThis.fetch = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify(infoV20), { status: 200 })),
    ) as unknown as typeof fetch;

    const { getDatasetVersionAndInfo } = await import("@/utils/versionUtils");
    const result = await getDatasetVersionAndInfo(
      "rabhishek100/so100_train_dataset",
    );
    expect(result.version).toBe("v2.0");
    expect(result.info.total_episodes).toBe(50);
  });

  test("accepts v2.1 codebase_version", async () => {
    const infoV21 = {
      codebase_version: "v2.1",
      robot_type: "so101",
      total_episodes: 100,
      total_frames: 10000,
      total_tasks: 1,
      chunks_size: 1000,
      data_files_size_in_mb: 20,
      video_files_size_in_mb: 1000,
      fps: 30,
      splits: { train: "0:100" },
      data_path: "data/{episode_chunk:03d}/episode_{episode_index:06d}.parquet",
      video_path:
        "videos/{video_key}/chunk-{episode_chunk:03d}/episode_{episode_index:06d}.mp4",
      features: {
        "observation.images.top": {
          dtype: "video",
          shape: [480, 640, 3],
          names: null,
        },
        "observation.state": { dtype: "float32", shape: [1, 6], names: null },
        action: { dtype: "float32", shape: [1, 6], names: null },
      },
    };

    globalThis.fetch = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify(infoV21), { status: 200 })),
    ) as unknown as typeof fetch;

    // Use fresh import to bypass cache — or just call with a different repoId
    const { getDatasetVersionAndInfo } = await import("@/utils/versionUtils");
    const result = await getDatasetVersionAndInfo(
      "youliangtan/so101-table-cleanup",
    );
    expect(result.version).toBe("v2.1");
  });

  test("accepts v3.0 codebase_version", async () => {
    const infoV30 = {
      codebase_version: "v3.0",
      robot_type: "openarm",
      total_episodes: 200,
      total_frames: 40000,
      total_tasks: 1,
      chunks_size: 100,
      data_files_size_in_mb: 50,
      video_files_size_in_mb: 2000,
      fps: 50,
      splits: { train: "0:200" },
      data_path: null,
      video_path: null,
      features: {
        "observation.images.top": {
          dtype: "video",
          shape: [480, 640, 3],
          names: null,
        },
        "observation.state": { dtype: "float32", shape: [1, 14], names: null },
        action: { dtype: "float32", shape: [1, 14], names: null },
      },
    };

    globalThis.fetch = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify(infoV30), { status: 200 })),
    ) as unknown as typeof fetch;

    const { getDatasetVersionAndInfo } = await import("@/utils/versionUtils");
    const result = await getDatasetVersionAndInfo(
      "lerobot-data-collection/level12_rac_2_2026-02-07",
    );
    expect(result.version).toBe("v3.0");
    expect(result.info.total_episodes).toBe(200);
  });

  test("throws for unsupported version", async () => {
    const infoUnsupported = {
      codebase_version: "v1.0",
      features: { dummy: { dtype: "float32", shape: [1], names: null } },
    };

    globalThis.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(infoUnsupported), { status: 200 }),
      ),
    ) as unknown as typeof fetch;

    const { getDatasetVersionAndInfo } = await import("@/utils/versionUtils");
    await expect(getDatasetVersionAndInfo("old/dataset")).rejects.toThrow(
      "not supported",
    );
  });

  test("throws when info.json has no features field", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ codebase_version: "v3.0" }), {
          status: 200,
        }),
      ),
    ) as unknown as typeof fetch;

    const { getDatasetVersionAndInfo } = await import("@/utils/versionUtils");
    await expect(getDatasetVersionAndInfo("broken/dataset")).rejects.toThrow();
  });

  test("throws when fetch fails (network error)", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(new Response("Not Found", { status: 404 })),
    ) as unknown as typeof fetch;

    const { getDatasetVersionAndInfo } = await import("@/utils/versionUtils");
    await expect(
      getDatasetVersionAndInfo("nonexistent/repo"),
    ).rejects.toThrow();
  });
});
