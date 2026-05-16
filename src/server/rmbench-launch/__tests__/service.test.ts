import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { RmbenchLaunchRuntimeStatus } from "@/types/rmbench-launch";

let tempRoot: string;

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "rmbench-launch-"));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("rmbench launch service", () => {
  test("returns lightweight status data without embedding the full action series", async () => {
    const { getRmbenchEvaluationStatus } = await import(
      "@/server/rmbench-launch/service"
    );

    const runId = "2026-05-15T12-00-00-000Z_swap_blocks";
    const runRoot = path.join(tempRoot, runId);
    await mkdir(runRoot, { recursive: true });
    const runtimeStatus: RmbenchLaunchRuntimeStatus = {
      runId,
      taskId: "swap_blocks",
      taskConfig: "demo_clean",
      prompt: "swap the blocks",
      status: "running",
      step: 12,
      startedAt: "2026-05-15T12:00:00.000Z",
      updatedAt: "2026-05-15T12:00:12.000Z",
      pid: 12345,
      latestFramePaths: {
        third_view: path.join(runRoot, "frames/third_view.jpg"),
        head_camera: path.join(runRoot, "frames/head_camera.jpg"),
        left_camera: path.join(runRoot, "frames/left_camera.jpg"),
        right_camera: path.join(runRoot, "frames/right_camera.jpg"),
      },
      actionCount: 2,
      logPath: runRoot,
      logFiles: {
        launcher: path.join(runRoot, "launcher.log"),
        server: path.join(runRoot, "server.log"),
        client: path.join(runRoot, "client.log"),
      },
      errorMessage: null,
    };

    await writeFile(path.join(tempRoot, "latest-run.json"), JSON.stringify({ runId }), "utf8");
    await writeFile(path.join(runRoot, "status.json"), JSON.stringify(runtimeStatus), "utf8");
    await writeFile(
      path.join(runRoot, "actions.json"),
      JSON.stringify([
        { step: 1, timestamp: 1710000000.12, x: 0.1, y: 0.2 },
        { step: 2, timestamp: 1710000000.24, x: 0.3, y: 0.4 },
      ]),
      "utf8",
    );

    const status = await getRmbenchEvaluationStatus(
      {
        runtimeRoot: tempRoot,
        isProcessRunningImpl: () => true,
      },
      runId,
    );

    expect(status).toMatchObject({
      runId,
      taskId: "swap_blocks",
      status: "running",
      processActive: true,
      step: 12,
      actionCount: 2,
      prompt: "swap the blocks",
    });
    expect(status.actionSeries).toEqual([]);
  });

  test("returns only actions after the requested step", async () => {
    const { readRmbenchEvaluationActions } = await import(
      "@/server/rmbench-launch/service"
    );

    const runId = "2026-05-15T12-00-00-000Z_swap_blocks";
    const runRoot = path.join(tempRoot, runId);
    await mkdir(runRoot, { recursive: true });
    await writeFile(
      path.join(runRoot, "status.json"),
      JSON.stringify({
        runId,
        taskId: "swap_blocks",
        taskConfig: "demo_clean",
        prompt: "swap the blocks",
        status: "running",
        step: 12,
        startedAt: "2026-05-15T12:00:00.000Z",
        updatedAt: "2026-05-15T12:00:12.000Z",
        pid: 12345,
        latestFramePaths: {
          third_view: null,
          head_camera: null,
          left_camera: null,
          right_camera: null,
        },
        actionCount: 3,
        logPath: runRoot,
        logFiles: {
          launcher: path.join(runRoot, "launcher.log"),
          server: path.join(runRoot, "server.log"),
          client: path.join(runRoot, "client.log"),
        },
        errorMessage: null,
      }),
      "utf8",
    );
    await writeFile(
      path.join(runRoot, "actions.json"),
      JSON.stringify([
        { step: 1, timestamp: 1710000000.12, x: 0.1 },
        { step: 2, timestamp: 1710000000.24, x: 0.2 },
        { step: 3, timestamp: 1710000000.36, x: 0.3 },
      ]),
      "utf8",
    );

    const actions = await readRmbenchEvaluationActions(runId, { runtimeRoot: tempRoot }, 1);

    expect(actions.actionCount).toBe(3);
    expect(actions.actionSeries.map((point) => point.step)).toEqual([2, 3]);
  });
});
