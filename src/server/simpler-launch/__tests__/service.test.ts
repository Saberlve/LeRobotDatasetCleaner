import { chmod, mkdir, mkdtemp, stat, utimes, writeFile } from "node:fs/promises";
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
  test.each([
    [
      "bridge_stack",
      {
        envName: "StackGreenCubeOnYellowCubeBakedTexInScene-v0",
        sceneName: "bridge_table_1_v1",
        robot: "widowx",
        rgbOverlayPath:
          "ManiSkill2_real2sim/data/real_inpainting/bridge_real_eval_1.png",
      },
    ],
    [
      "bridge_spoon",
      {
        envName: "PutSpoonOnTableClothInScene-v0",
        sceneName: "bridge_table_1_v1",
        robot: "widowx",
        rgbOverlayPath:
          "ManiSkill2_real2sim/data/real_inpainting/bridge_real_eval_1.png",
      },
    ],
    [
      "eggplant",
      {
        envName: "PutEggplantInBasketScene-v0",
        sceneName: "bridge_table_1_v2",
        robot: "widowx_sink_camera_setup",
        rgbOverlayPath: "ManiSkill2_real2sim/data/real_inpainting/bridge_sink.png",
      },
    ],
  ])(
    "launch initializes runtime files for supported task %s",
    async (taskId, expectedMeta) => {
      const { launchSimplerEvaluation } = await import(
        "@/server/simpler-launch/service"
      );

      const scriptPath = path.join(tempRoot, "run.sh");
      await writeFile(scriptPath, "#!/usr/bin/env bash\nexit 0\n", "utf8");
      await chmod(scriptPath, 0o755);

      const spawnImpl = vi.fn().mockReturnValue({
        pid: 24680,
        unref: vi.fn(),
        once(event: string, handler: () => void) {
          if (event === "spawn") {
            handler();
          }
          return this;
        },
      });

      const status = await launchSimplerEvaluation(taskId, {
        runtimeRoot: tempRoot,
        scriptPath,
        spawnImpl,
        readModelServerStatusImpl: async () => runningModelServerStatus(tempRoot),
        isProcessRunningImpl: () => true,
        now: () => new Date("2026-05-16T10:00:00.000Z"),
      });

      expect(status.taskId).toBe(taskId);
      expect(spawnImpl.mock.calls[0]?.[1]).toEqual([taskId, status.runId]);
      expect(spawnImpl.mock.calls[0]?.[2]).toMatchObject({
        env: expect.objectContaining({
          SIMPLERENV_LAUNCH_TASK_ID: taskId,
          SIMPLERENV_LAUNCH_RUNTIME_DIR: path.join(tempRoot, status.runId),
        }),
      });

      await expect(
        readJson(path.join(tempRoot, status.runId, "meta.json")),
      ).resolves.toMatchObject({
        taskId,
        ...expectedMeta,
        checkpointPath:
          "/root/autodl-tmp/checkpoints/pi05_simpler/pi05_bridge_v2_full/26000",
        serverPort: 8123,
        renderScale: 2,
      });
    },
  );

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
        readModelServerStatusImpl: async () => runningModelServerStatus(tempRoot),
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "A SimplerEnv evaluation is already running",
    });
  });

  test("rejects launch when the latest run is still live even without active-run.json", async () => {
    const { launchSimplerEvaluation } = await import(
      "@/server/simpler-launch/service"
    );

    const runId = "2026-05-16T10-00-00-000Z_bridge_spoon";
    const runRoot = path.join(tempRoot, runId);
    await mkdir(runRoot, { recursive: true });
    await writeFile(
      path.join(tempRoot, "latest-run.json"),
      JSON.stringify({ runId }),
      "utf8",
    );
    await writeFile(
      path.join(runRoot, "status.json"),
      JSON.stringify({
        runId,
        taskId: "bridge_spoon",
        prompt: "put the spoon on the towel",
        status: "running",
        step: 12,
        startedAt: "2026-05-16T10:00:00.000Z",
        updatedAt: "2026-05-16T10:00:12.000Z",
        pid: 45678,
        latestFramePath: path.join(runRoot, "latest-frame.jpg"),
        actionCount: 12,
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
      launchSimplerEvaluation("bridge_carrot", {
        runtimeRoot: tempRoot,
        readModelServerStatusImpl: async () => runningModelServerStatus(tempRoot),
        isProcessRunningImpl: (pid) => pid === 45678,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "A SimplerEnv evaluation is already running",
    });
  });

  test("rejects launch when the persistent Simpler model server is not running", async () => {
    const { launchSimplerEvaluation } = await import(
      "@/server/simpler-launch/service"
    );

    await expect(
      launchSimplerEvaluation("bridge_carrot", {
        runtimeRoot: tempRoot,
        readModelServerStatusImpl: async () => ({
          ...runningModelServerStatus(tempRoot),
          status: "stopped",
          pid: null,
          startedAt: null,
        }),
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Simpler 模型服务未运行，请先启动 Simpler 模型服务。",
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
      readModelServerStatusImpl: async () => runningModelServerStatus(tempRoot),
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
      actionCount,
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
      processActive: true,
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

  test("stops the latest live run even when active-run.json is missing and the runtime status is already final", async () => {
    const { stopSimplerEvaluation } = await import(
      "@/server/simpler-launch/service"
    );

    const runId = "2026-05-16T10-00-00-000Z_bridge_spoon";
    const runRoot = path.join(tempRoot, runId);
    const killProcessImpl = vi.fn();
    const waitForExitImpl = vi.fn().mockResolvedValue(true);

    await mkdir(runRoot, { recursive: true });
    await writeFile(
      path.join(tempRoot, "latest-run.json"),
      JSON.stringify({ runId }),
      "utf8",
    );
    await writeFile(
      path.join(runRoot, "status.json"),
      JSON.stringify({
        runId,
        taskId: "bridge_spoon",
        prompt: "put the spoon on the towel",
        status: "failed",
        step: 12,
        startedAt: "2026-05-16T10:00:00.000Z",
        updatedAt: "2026-05-16T10:00:12.000Z",
        pid: 45678,
        latestFramePath: path.join(runRoot, "latest-frame.jpg"),
        actionCount: 12,
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
      stopSimplerEvaluation(undefined, {
        runtimeRoot: tempRoot,
        isProcessRunningImpl: (pid) => pid === 45678,
        killProcessImpl,
        waitForExitImpl,
        now: () => new Date("2026-05-16T10:01:00.000Z"),
      }),
    ).resolves.toMatchObject({
      runId,
      status: "stopped",
    });

    expect(killProcessImpl).toHaveBeenCalledWith(45678, "SIGTERM");
    expect(waitForExitImpl).toHaveBeenCalledWith(45678, 5000);
  });

  test("treats a stopped run as stopped even if the runtime rewrites status to failed during shutdown", async () => {
    const { getSimplerEvaluationStatus } = await import(
      "@/server/simpler-launch/service"
    );

    const runId = "2026-05-16T10-00-00-000Z_bridge_spoon";
    const runRoot = path.join(tempRoot, runId);
    await mkdir(runRoot, { recursive: true });
    await writeFile(
      path.join(tempRoot, "latest-run.json"),
      JSON.stringify({ runId }),
      "utf8",
    );
    await writeFile(
      path.join(runRoot, "status.json"),
      JSON.stringify({
        runId,
        taskId: "bridge_spoon",
        prompt: "put the spoon on the towel",
        status: "failed",
        step: 12,
        startedAt: "2026-05-16T10:00:00.000Z",
        updatedAt: "2026-05-16T10:00:12.000Z",
        pid: 45678,
        latestFramePath: path.join(runRoot, "latest-frame.jpg"),
        actionCount: 12,
        logPath: runRoot,
        logFiles: {
          launcher: path.join(runRoot, "launcher.log"),
          server: path.join(runRoot, "server.log"),
          client: path.join(runRoot, "client.log"),
        },
        errorMessage: "no close frame received or sent",
      }),
      "utf8",
    );
    await writeFile(
      path.join(runRoot, "stop-requested.json"),
      JSON.stringify({ requestedAt: "2026-05-16T10:01:00.000Z" }),
      "utf8",
    );

    await expect(
      getSimplerEvaluationStatus({
        runtimeRoot: tempRoot,
        isProcessRunningImpl: () => false,
        now: () => new Date("2026-05-16T10:02:00.000Z"),
      }),
    ).resolves.toMatchObject({
      runId,
      status: "stopped",
      processActive: false,
      errorMessage: null,
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
        step,
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

  test("builds an MJPEG stream that emits the current frame immediately and appends later file updates", async () => {
    const { createSimplerFrameStream } = await import(
      "@/server/simpler-launch/service"
    );

    const runId = "2026-05-16T12-00-00-000Z_bridge_carrot";
    const runRoot = path.join(tempRoot, runId);
    const framePath = path.join(runRoot, "latest-frame.jpg");
    await mkdir(runRoot, { recursive: true });
    await writeRuntimeStatus(runRoot, runId, framePath, "running", 1, 1);
    await writeFile(framePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

    const stream = await createSimplerFrameStream(runId, {
      runtimeRoot: tempRoot,
      framePollIntervalMs: 1,
    });
    const reader = stream.getReader();

    const firstChunk = await readChunkText(reader);
    expect(firstChunk).toContain("--frame");
    expect(firstChunk).toContain("Content-Type: image/jpeg");
    expect(firstChunk).toContain("X-Simpler-Action-Count: 1");

    await writeFile(framePath, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]));
    await writeRuntimeStatus(runRoot, runId, framePath, "running", 2, 2);
    const secondChunk = await readChunkText(reader);
    expect(secondChunk).toContain("Content-Length: 6");
    expect(secondChunk).toContain("X-Simpler-Action-Count: 2");

    await reader.cancel();
  });

  test("waits for actionCount to advance before streaming an updated live frame", async () => {
    const { createSimplerFrameStream } = await import(
      "@/server/simpler-launch/service"
    );

    const runId = "2026-05-16T12-02-00-000Z_bridge_carrot";
    const runRoot = path.join(tempRoot, runId);
    const framePath = path.join(runRoot, "latest-frame.jpg");
    await mkdir(runRoot, { recursive: true });
    await writeRuntimeStatus(runRoot, runId, framePath, "running", 1, 1);
    await writeFile(framePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

    const stream = await createSimplerFrameStream(runId, {
      runtimeRoot: tempRoot,
      framePollIntervalMs: 1,
    });
    const reader = stream.getReader();

    await readChunkText(reader);

    await writeFile(framePath, Buffer.from([0xff, 0xd8, 0xee, 0xd9]));
    await expect(
      Promise.race([
        reader.read(),
        new Promise<ReadableStreamReadResult<Uint8Array>>((_, reject) => {
          setTimeout(() => reject(new Error("timed out waiting for gated frame")), 120);
        }),
      ]),
    ).rejects.toThrow("timed out waiting for gated frame");

    await reader.cancel();
  });

  test("returns the final frame and then closes once the run has already finished", async () => {
    const { createSimplerFrameStream } = await import(
      "@/server/simpler-launch/service"
    );

    const runId = "2026-05-16T12-05-00-000Z_bridge_carrot";
    const runRoot = path.join(tempRoot, runId);
    const framePath = path.join(runRoot, "latest-frame.jpg");
    await mkdir(runRoot, { recursive: true });
    await writeRuntimeStatus(runRoot, runId, framePath, "succeeded", 1, 1);
    await writeFile(framePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

    const stream = await createSimplerFrameStream(runId, {
      runtimeRoot: tempRoot,
      framePollIntervalMs: 1,
    });
    const reader = stream.getReader();

    expect(await readChunkText(reader)).toContain("--frame");
    await expect(reader.read()).resolves.toMatchObject({ done: true });
  });

  test("streams a new frame even when the file keeps the same size and mtime", async () => {
    const { createSimplerFrameStream } = await import(
      "@/server/simpler-launch/service"
    );

    const runId = "2026-05-16T12-10-00-000Z_bridge_carrot";
    const runRoot = path.join(tempRoot, runId);
    const framePath = path.join(runRoot, "latest-frame.jpg");
    await mkdir(runRoot, { recursive: true });
    await writeRuntimeStatus(runRoot, runId, framePath, "running", 1, 1);
    await writeFile(framePath, Buffer.from([0xff, 0xd8, 0xaa, 0xd9]));

    const initialStat = await stat(framePath);
    const stream = await createSimplerFrameStream(runId, {
      runtimeRoot: tempRoot,
      framePollIntervalMs: 1,
    });
    const reader = stream.getReader();

    await readChunkText(reader);

    await writeFile(framePath, Buffer.from([0xff, 0xd8, 0xbb, 0xd9]));
    await utimes(framePath, initialStat.atime, initialStat.mtime);
    await writeRuntimeStatus(runRoot, runId, framePath, "running", 2, 2);

    await expect(
      Promise.race([
        reader.read(),
        new Promise<ReadableStreamReadResult<Uint8Array>>((_, reject) => {
          setTimeout(() => reject(new Error("timed out waiting for second frame")), 200);
        }),
      ]),
    ).resolves.toMatchObject({ done: false });

    await reader.cancel();
  });
});

function runningModelServerStatus(root: string) {
  return {
    benchmark: "simpler" as const,
    label: "Simpler 模型服务",
    status: "running" as const,
    pid: 97531,
    port: 8123,
    startedAt: "2026-05-16T09:59:00.000Z",
    updatedAt: "2026-05-16T09:59:05.000Z",
    checkpointPath:
      "/root/autodl-tmp/checkpoints/pi05_simpler/pi05_bridge_v2_full/26000",
    logPath: path.join(root, "model-server"),
    logFiles: {
      launcher: path.join(root, "model-server", "launcher.log"),
      server: path.join(root, "model-server", "server.log"),
    },
    errorMessage: null,
  };
}

async function readJson(filePath: string) {
  const fs = await import("node:fs/promises");
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeRuntimeStatus(
  runRoot: string,
  runId: string,
  framePath: string,
  status: SimplerLaunchRuntimeStatus["status"],
  actionCount = 1,
  step = 1,
) {
  await writeFile(
    path.join(runRoot, "status.json"),
    JSON.stringify({
      runId,
      taskId: "bridge_carrot",
      prompt: "put carrot on plate",
      status,
      step,
      startedAt: "2026-05-16T12:00:00.000Z",
      updatedAt: "2026-05-16T12:00:01.000Z",
      pid: status === "running" ? 123 : null,
      latestFramePath: framePath,
      actionCount,
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
}

async function readChunkText(
  reader: ReadableStreamDefaultReader<Uint8Array>,
) {
  const chunk = await reader.read();
  expect(chunk.done).toBe(false);
  return Buffer.from(chunk.value ?? new Uint8Array()).toString("latin1");
}
