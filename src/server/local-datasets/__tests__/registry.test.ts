import { afterEach, beforeEach, describe, expect, test } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  buildExportRepoId,
  buildLocalRepoId,
  loadLocalDatasetRegistry,
  registerLocalDataset,
  validateLocalDatasetPath,
} from "@/server/local-datasets/registry";

describe("local dataset registry", () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "visualizer-local-"));
    process.env.LOCAL_DATASET_REGISTRY_PATH = path.join(tempRoot, "registry.json");
  });

  afterEach(async () => {
    delete process.env.LOCAL_DATASET_REGISTRY_PATH;
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  test("buildLocalRepoId normalizes custom aliases", () => {
    expect(buildLocalRepoId("/tmp/demo", "straighten_box")).toBe("local/straighten_box");
    expect(buildLocalRepoId("/tmp/demo", "local/existing")).toBe("local/existing");
  });

  test("buildLocalRepoId falls back to dataset basename when alias is empty", () => {
    expect(buildLocalRepoId("/tmp/datasets/demo_box", "")).toBe("local/demo_box");
  });

  test("buildLocalRepoId rejects aliases that do not fit the supported route shape", () => {
    expect(() => buildLocalRepoId("/tmp/demo", "foo/bar")).toThrow(
      "Local dataset alias must be a single path segment",
    );
    expect(() => buildLocalRepoId("/tmp/demo", "local/foo/bar")).toThrow(
      "Local dataset alias must be a single path segment",
    );
  });

  test("buildExportRepoId falls back to the default local export alias", () => {
    expect(buildExportRepoId("local/demo_box", "", "flagged")).toBe("local/demo_box_flagged");
    expect(buildExportRepoId("local/demo_box", "", "unflagged")).toBe("local/demo_box_unflagged");
  });

  test("buildExportRepoId normalizes a custom export alias", () => {
    expect(buildExportRepoId("local/demo_box", " local/custom_export ", "flagged")).toBe(
      "local/custom_export",
    );
  });

  test("buildExportRepoId rejects non-local source repo ids", () => {
    expect(() => buildExportRepoId("org/dataset", "", "flagged")).toThrow(
      "Export repo id source must be a local dataset repo id",
    );
  });

  test("buildExportRepoId rejects malformed local-looking source repo ids", () => {
    expect(() => buildExportRepoId("local/", "", "flagged")).toThrow(
      "Export repo id source must be a local dataset repo id",
    );
  });

  test("buildExportRepoId rejects aliases that resolve to the source repo id", () => {
    expect(() => buildExportRepoId("local/demo_box", "demo_box", "flagged")).toThrow(
      "Export repo id must differ from the source repo id",
    );
  });

  test("validateLocalDatasetPath reads v2.1 info", async () => {
    const datasetRoot = path.join(tempRoot, "dataset");
    await fs.mkdir(path.join(datasetRoot, "meta"), { recursive: true });
    await fs.writeFile(
      path.join(datasetRoot, "meta", "info.json"),
      JSON.stringify({
        codebase_version: "v2.1",
        total_episodes: 8,
        fps: 30,
        robot_type: "Acone",
      }),
      "utf8",
    );

    const summary = await validateLocalDatasetPath(datasetRoot);
    expect(summary.version).toBe("v2.1");
    expect(summary.totalEpisodes).toBe(8);
    expect(summary.path).toBe(path.resolve(datasetRoot));
    expect(summary.fps).toBe(30);
    expect(summary.robotType).toBe("Acone");
  });

  test("validateLocalDatasetPath rejects invalid numeric metadata", async () => {
    const datasetRoot = path.join(tempRoot, "dataset-invalid-meta");
    await fs.mkdir(path.join(datasetRoot, "meta"), { recursive: true });
    await fs.writeFile(
      path.join(datasetRoot, "meta", "info.json"),
      JSON.stringify({
        codebase_version: "v2.1",
        total_episodes: 0,
        fps: Number.NaN,
        robot_type: "Acone",
      }),
      "utf8",
    );

    await expect(validateLocalDatasetPath(datasetRoot)).rejects.toThrow(
      "Local dataset metadata is invalid",
    );
  });

  test("loadLocalDatasetRegistry rejects corrupted registry JSON", async () => {
    await fs.writeFile(process.env.LOCAL_DATASET_REGISTRY_PATH!, "{", "utf8");

    await expect(loadLocalDatasetRegistry()).rejects.toThrow("Local dataset registry is malformed");
  });

  test("loadLocalDatasetRegistry rejects invalid registry entry shapes", async () => {
    await fs.writeFile(
      process.env.LOCAL_DATASET_REGISTRY_PATH!,
      JSON.stringify([{ repoId: "local/demo" }]),
      "utf8",
    );

    await expect(loadLocalDatasetRegistry()).rejects.toThrow("Local dataset registry is invalid");
  });

  test("registerLocalDataset does not overwrite corrupted registry data", async () => {
    const datasetRoot = path.join(tempRoot, "dataset-corrupted-registry");
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
    await fs.writeFile(process.env.LOCAL_DATASET_REGISTRY_PATH!, "{", "utf8");

    await expect(
      registerLocalDataset({ datasetPath: datasetRoot, alias: "demo_box" }),
    ).rejects.toThrow("Local dataset registry is malformed");
    await expect(fs.readFile(process.env.LOCAL_DATASET_REGISTRY_PATH!, "utf8")).resolves.toBe("{");
  });

  test("registerLocalDataset persists latest entry", async () => {
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

    const entry = await registerLocalDataset({ datasetPath: datasetRoot, alias: "demo_box" });
    const all = await loadLocalDatasetRegistry();

    expect(entry.repoId).toBe("local/demo_box");
    expect(entry.displayName).toBe("demo_box");
    expect(all[0].repoId).toBe("local/demo_box");
    expect(all[0].path).toBe(path.resolve(datasetRoot));
    expect(all[0].version).toBe("v3.0");
    expect(all[0].totalEpisodes).toBe(3);
    expect(all[0].fps).toBe(50);
    expect(all[0].robotType).toBe("SO101");
    expect(all[0].lastOpenedAt).toEqual(expect.any(String));
  });
});
