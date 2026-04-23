import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { GET as registryRoute } from "@/app/api/local-datasets/registry/route";
import { POST as registerRoute } from "@/app/api/local-datasets/register/route";
import { pickDirectory } from "@/server/local-datasets/picker";

describe("pickDirectory", () => {
  test("returns a chinese gui error when tk is unavailable", async () => {
    const result = await pickDirectory({
      createProcess: vi.fn().mockRejectedValue(new Error("tk unavailable")),
    });

    expect(result.path).toBeNull();
    expect(result.error).toMatch("无法打开本地文件夹选择窗口");
    expect(result.error).toMatch("tk unavailable");
  });
});

describe("local dataset api routes", () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "visualizer-picker-"));
    process.env.LOCAL_DATASET_REGISTRY_PATH = path.join(tempRoot, "registry.json");
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env.LOCAL_DATASET_REGISTRY_PATH;
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  test("registry GET returns persisted entries from task 1 registry", async () => {
    await fs.writeFile(
      process.env.LOCAL_DATASET_REGISTRY_PATH!,
      JSON.stringify([
        {
          repoId: "local/demo_box",
          path: "/tmp/demo",
          displayName: "demo_box",
          version: "v2.1",
          totalEpisodes: 8,
          fps: 30,
          robotType: "Acone",
          lastOpenedAt: "2026-04-23T00:00:00.000Z",
        },
      ]),
      "utf8",
    );

    const response = await registryRoute();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      entries: [
        {
          repoId: "local/demo_box",
          path: "/tmp/demo",
          displayName: "demo_box",
          version: "v2.1",
          totalEpisodes: 8,
          fps: 30,
          robotType: "Acone",
          lastOpenedAt: "2026-04-23T00:00:00.000Z",
        },
      ],
    });
  });

  test("register POST returns repoId, summary, and entryRoute", async () => {
    const datasetRoot = path.join(tempRoot, "dataset");
    await fs.mkdir(path.join(datasetRoot, "meta"), { recursive: true });
    await fs.writeFile(
      path.join(datasetRoot, "meta", "info.json"),
      JSON.stringify({
        codebase_version: "v3.0",
        total_episodes: 3,
        fps: 50,
        robot_type: "SO101",
      }),
      "utf8",
    );

    const request = new Request("http://localhost/api/local-datasets/register", {
      method: "POST",
      body: JSON.stringify({ path: datasetRoot, alias: "demo_box" }),
      headers: { "content-type": "application/json" },
    });

    const response = await registerRoute(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      repoId: "local/demo_box",
      summary: {
        repoId: "local/demo_box",
        path: path.resolve(datasetRoot),
        displayName: "demo_box",
        version: "v3.0",
        totalEpisodes: 3,
        fps: 50,
        robotType: "SO101",
        lastOpenedAt: expect.any(String),
      },
      entryRoute: "/local/demo_box/episode_0",
    });
  });

  test("register POST returns chinese client error for invalid json body", async () => {
    const request = new Request("http://localhost/api/local-datasets/register", {
      method: "POST",
      body: "{",
      headers: { "content-type": "application/json" },
    });

    const response = await registerRoute(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "请求体必须是 JSON 对象，且包含 path 字符串。",
    });
  });

  test("register POST returns chinese client error for non-object payloads", async () => {
    const invalidPayloads = [null, "demo", ["demo"], { path: 123 }, { alias: "demo_box" }];

    for (const payload of invalidPayloads) {
      const request = new Request("http://localhost/api/local-datasets/register", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "content-type": "application/json" },
      });

      const response = await registerRoute(request);

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "请求体必须是 JSON 对象，且包含 path 字符串。",
      });
    }
  });

  test("register POST returns server error when registry layer fails", async () => {
    vi.resetModules();
    vi.doMock("@/server/local-datasets/registry", () => ({
      registerLocalDataset: vi
        .fn()
        .mockRejectedValue(new Error("Local dataset registry is malformed")),
    }));
    const { POST: mockedRegisterRoute } = await import("@/app/api/local-datasets/register/route");
    const request = new Request("http://localhost/api/local-datasets/register", {
      method: "POST",
      body: JSON.stringify({ path: "/tmp/demo", alias: "demo_box" }),
      headers: { "content-type": "application/json" },
    });

    const response = await mockedRegisterRoute(request);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "本地数据集注册失败，请检查注册表或磁盘状态。",
    });
  });

  test("pick-directory POST returns chinese error payload when picker fails", async () => {
    vi.resetModules();
    vi.doMock("@/server/local-datasets/picker", () => ({
      pickDirectory: vi.fn().mockResolvedValue({
        path: null,
        error: "无法打开本地文件夹选择窗口，当前环境可能不支持 GUI。",
      }),
    }));
    const { POST: pickDirectoryRoute } = await import("@/app/api/local-datasets/pick-directory/route");

    const response = await pickDirectoryRoute();

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      path: null,
      error: "无法打开本地文件夹选择窗口，当前环境可能不支持 GUI。",
    });
  });
});
