import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { SimplerLaunchRuntimeStatus } from "@/types/simpler-launch";

let tempRoot: string;

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "simpler-launch-"));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("simpler launch service", () => {
  test("rejects non-whitelisted task ids", async () => {
    const { SimplerLaunchError, launchSimplerEvaluation } = await import(
      "@/server/simpler-launch/service"
    );

    await expect(
      launchSimplerEvaluation("invalid_task", {
        runtimeRoot: tempRoot,
      }),
    ).rejects.toMatchObject<SimplerLaunchError>({
      statusCode: 400,
      message: "Unsupported SimplerEnv task id: invalid_task",
    });
  });

  test("rejects launch when another run is still active", async () => {
    const { launchSimplerEvaluation } = await import(
      "@/server/simpler-launch/service"
    );

    await writeFile(
      path.join(tempRoot, "active-run.json"),
      JSON.stringify({
        runId: "existing_run",
        pid: process.pid,
      }),
      "utf8",
    );

    await expect(
      launchSimplerEvaluation("bridge_carrot", {
        runtimeRoot: tempRoot,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "A SimplerEnv evaluation is already running",
    });
  });

  test("launch initializes runtime files and returns the starting run", async () => {
    const { launchSimplerEvaluation } = await import(
      "@/server/simpler-launch/service"
    );

    const scriptPath = path.join(tempRoot, "run.sh");
    await writeFile(scriptPath, "#!/usr/bin/env bash\nexit 0\n", "utf8");
    await chmod(scriptPath, 0o755);

    const unref = vi.fn();
    const spawnImpl = vi.fn().mockReturnValue({
      pid: 24680,
      unref,
      once(event: string, handler: () => void) {
        if (event === "spawn") {
          handler();
        }
        return this;
      },
    });

    const status = await launchSimplerEvaluation("bridge_carrot", {
      runtimeRoot: tempRoot,
      scriptPath,
      spawnImpl,
      findFreePortImpl: async () => 8123,
      isProcessRunningImpl: () => true,
      now: () => new Date("2026-05-15T12:00:00.000Z"),
    });

    expect(status.status).toBe("starting");
    expect(status.taskId).toBe("bridge_carrot");
    expect(status.runId).toContain("bridge_carrot");
    expect(status.logPath).toContain(status.runId);
    expect(status.logFiles).toMatchObject({
      launcher: path.join(tempRoot, status.runId, "launcher.log"),
      server: path.join(tempRoot, status.runId, "server.log"),
      client: path.join(tempRoot, status.runId, "client.log"),
    });
    expect(status.latestFrameUrl).toBe(
      `/api/evaluation/simpler/frame?runId=${status.runId}`,
    );
    expect(spawnImpl).toHaveBeenCalledTimes(1);
    expect(spawnImpl.mock.calls[0]?.[1]).toEqual([
      "bridge_carrot",
      status.runId,
    ]);
    expect(spawnImpl.mock.calls[0]?.[2]).toMatchObject({
      detached: true,
      env: expect.objectContaining({
        SIMPLERENV_LAUNCH_RUNTIME_DIR: path.join(tempRoot, status.runId),
        SIMPLERENV_LAUNCH_RUN_ID: status.runId,
        SIMPLERENV_LAUNCH_TASK_ID: "bridge_carrot",
        SIMPLERENV_LAUNCH_SERVER_PORT: "8123",
      }),
    });
    expect(unref).toHaveBeenCalledTimes(1);

    await expect(
      readJson(path.join(tempRoot, "latest-run.json")),
    ).resolves.toMatchObject({
      runId: status.runId,
    });
    await expect(
      readJson(path.join(tempRoot, "active-run.json")),
    ).resolves.toMatchObject({
      runId: status.runId,
      pid: 24680,
    });

    const runRoot = path.join(tempRoot, status.runId);
    await expect(readJson(path.join(runRoot, "status.json"))).resolves.toMatchObject({
      runId: status.runId,
      taskId: "bridge_carrot",
      status: "starting",
      pid: 24680,
    });
    await expect(readJson(path.join(runRoot, "meta.json"))).resolves.toMatchObject({
      taskId: "bridge_carrot",
      checkpointPath:
        "/root/autodl-tmp/checkpoints/pi05_simpler/pi05_bridge_v2_full/26000",
      serverPort: 8123,
      renderScale: 2,
    });
    await expect(readJson(path.join(runRoot, "actions.json"))).resolves.toEqual([]);
  });

  test("parses the latest runtime snapshot into API status data", async () => {
    const { getSimplerEvaluationStatus } = await import(
      "@/server/simpler-launch/service"
    );

    const runId = "2026-05-15T12-00-00-000Z_bridge_carrot";
    const runRoot = path.join(tempRoot, runId);
    await mkdir(runRoot, { recursive: true });
    const runtimeStatus: SimplerLaunchRuntimeStatus = {
      runId,
      taskId: "bridge_carrot",
      prompt: "put carrot on plate",
      status: "running",
      step: 42,
      startedAt: "2026-05-15T12:00:00.000Z",
      updatedAt: "2026-05-15T12:01:08.000Z",
      pid: 45678,
      latestFramePath: path.join(runRoot, "latest-frame.jpg"),
      actionCount: 1,
      logPath: runRoot,
      logFiles: {
        launcher: path.join(runRoot, "launcher.log"),
        server: path.join(runRoot, "server.log"),
        client: path.join(runRoot, "client.log"),
      },
      errorMessage: null,
    };
    await writeFile(
      path.join(tempRoot, "latest-run.json"),
      JSON.stringify({ runId }),
      "utf8",
    );
    await writeFile(
      path.join(runRoot, "status.json"),
      JSON.stringify(runtimeStatus),
      "utf8",
    );
    await writeFile(
      path.join(runRoot, "actions.json"),
      JSON.stringify([
        {
          step: 0,
          timestamp: 1710000000.12,
          x: 0.1,
          y: 0.2,
          z: -0.1,
          roll: 0.01,
          pitch: 0.02,
          yaw: -0.03,
          gripper: 1,
        },
      ]),
      "utf8",
    );
    await writeFile(path.join(runRoot, "latest-frame.jpg"), "frame", "utf8");

    const status = await getSimplerEvaluationStatus({
      runtimeRoot: tempRoot,
      isProcessRunningImpl: () => true,
    });

    expect(status).toMatchObject({
      runId,
      taskId: "bridge_carrot",
      prompt: "put carrot on plate",
      status: "running",
      step: 42,
      frameVersion: 1,
      latestFrameUrl: `/api/evaluation/simpler/frame?runId=${runId}`,
      errorMessage: null,
      logFiles: {
        launcher: path.join(runRoot, "launcher.log"),
        server: path.join(runRoot, "server.log"),
        client: path.join(runRoot, "client.log"),
      },
    });
    expect(status.actionSeries).toHaveLength(1);
    expect(status.actionSeries[0]?.yaw).toBe(-0.03);
  });


  test("reads separated server and client logs for the active run", async () => {
    const { readSimplerEvaluationLog } = await import(
      "@/server/simpler-launch/service"
    );

    const runId = "2026-05-15T12-00-00-000Z_bridge_carrot";
    const runRoot = path.join(tempRoot, runId);
    await mkdir(runRoot, { recursive: true });
    await writeFile(
      path.join(runRoot, "status.json"),
      JSON.stringify({
        runId,
        taskId: "bridge_carrot",
        prompt: "put carrot on plate",
        status: "running",
        step: 8,
        startedAt: "2026-05-15T12:00:00.000Z",
        updatedAt: "2026-05-15T12:00:08.000Z",
        pid: 123,
        latestFramePath: path.join(runRoot, "latest-frame.jpg"),
        actionCount: 8,
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
    await writeFile(path.join(runRoot, "server.log"), "server ready\nstep 8\n", "utf8");
    await writeFile(path.join(runRoot, "client.log"), "client prompt\nrollout\n", "utf8");

    await expect(
      readSimplerEvaluationLog(runId, "server", {
        runtimeRoot: tempRoot,
      }),
    ).resolves.toMatchObject({
      runId,
      source: "server",
      path: path.join(runRoot, "server.log"),
      content: "server ready\nstep 8\n",
      truncated: false,
    });

    await expect(
      readSimplerEvaluationLog(runId, "client", {
        runtimeRoot: tempRoot,
      }),
    ).resolves.toMatchObject({
      runId,
      source: "client",
      path: path.join(runRoot, "client.log"),
      content: "client prompt\nrollout\n",
      truncated: false,
    });
  });

  test("returns 404 when the frame file is missing", async () => {
    const { SimplerLaunchError, resolveSimplerFramePath } = await import(
      "@/server/simpler-launch/service"
    );

    const runId = "2026-05-15T12-00-00-000Z_bridge_carrot";
    const runRoot = path.join(tempRoot, runId);
    await mkdir(runRoot, { recursive: true });
    await writeFile(
      path.join(runRoot, "status.json"),
      JSON.stringify({
        runId,
        taskId: "bridge_carrot",
        prompt: "put carrot on plate",
        status: "running",
        step: 1,
        startedAt: "2026-05-15T12:00:00.000Z",
        updatedAt: "2026-05-15T12:00:01.000Z",
        pid: 123,
        latestFramePath: path.join(runRoot, "latest-frame.jpg"),
        actionCount: 1,
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

    await expect(
      resolveSimplerFramePath(runId, {
        runtimeRoot: tempRoot,
      }),
    ).rejects.toMatchObject<SimplerLaunchError>({
      statusCode: 404,
      message: "SimplerEnv frame not found",
    });
  });
});

async function readJson(filePath: string) {
  const fs = await import("node:fs/promises");
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}
