import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, test, vi } from "vitest";

let tempRoot: string;

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "evaluation-model-server-"));
});

describe("evaluation model server service", () => {
  test("starts the Simpler server with persistent runtime state", async () => {
    const { startSimplerModelServer } = await import(
      "@/server/evaluation-model-server/service"
    );

    const status = await startSimplerModelServer({
      runtimeRoot: path.join(tempRoot, "simpler"),
      scriptPath: path.join(tempRoot, "run-simpler-server.sh"),
      port: 8123,
      spawnImpl: createSpawnImpl(41001),
      isProcessRunningImpl: () => true,
      waitForPortReadyImpl: async () => true,
      isPortListeningImpl: async () => true,
      now: () => new Date("2026-05-16T10:00:00.000Z"),
    });

    expect(status).toMatchObject({
      benchmark: "simpler",
      label: "Simpler 模型服务",
      status: "running",
      pid: 41001,
      port: 8123,
      checkpointPath:
        "/root/autodl-tmp/checkpoints/pi05_simpler/pi05_bridge_v2_full/26000",
    });

    await expect(
      readJson(path.join(tempRoot, "simpler", "active-server.json")),
    ).resolves.toMatchObject({
      pid: 41001,
    });
    await expect(
      readJson(path.join(tempRoot, "simpler", "status.json")),
    ).resolves.toMatchObject({
      benchmark: "simpler",
      status: "running",
      pid: 41001,
      port: 8123,
    });
  });

  test("starts Simpler and RMBench servers independently on different ports", async () => {
    const {
      getRmbenchModelServerStatus,
      getSimplerModelServerStatus,
      startRmbenchModelServer,
      startSimplerModelServer,
    } = await import("@/server/evaluation-model-server/service");

    await startSimplerModelServer({
      runtimeRoot: path.join(tempRoot, "simpler"),
      scriptPath: path.join(tempRoot, "run-simpler-server.sh"),
      port: 8123,
      spawnImpl: createSpawnImpl(41001),
      isProcessRunningImpl: () => true,
      waitForPortReadyImpl: async () => true,
      isPortListeningImpl: async () => true,
      now: () => new Date("2026-05-16T10:00:00.000Z"),
    });
    await startRmbenchModelServer({
      runtimeRoot: path.join(tempRoot, "rmbench"),
      scriptPath: path.join(tempRoot, "run-rmbench-server.sh"),
      port: 9123,
      spawnImpl: createSpawnImpl(42001),
      isProcessRunningImpl: () => true,
      waitForPortReadyImpl: async () => true,
      isPortListeningImpl: async () => true,
      now: () => new Date("2026-05-16T10:01:00.000Z"),
    });

    await expect(
      getSimplerModelServerStatus({
        runtimeRoot: path.join(tempRoot, "simpler"),
        port: 8123,
        isPortListeningImpl: async () => true,
        isProcessRunningImpl: () => true,
      }),
    ).resolves.toMatchObject({
      benchmark: "simpler",
      status: "running",
      port: 8123,
    });
    await expect(
      getRmbenchModelServerStatus({
        runtimeRoot: path.join(tempRoot, "rmbench"),
        port: 9123,
        isPortListeningImpl: async () => true,
        isProcessRunningImpl: () => true,
      }),
    ).resolves.toMatchObject({
      benchmark: "rmbench",
      status: "running",
      port: 9123,
    });
  });

  test("stopping one persistent server does not affect the other", async () => {
    const {
      getRmbenchModelServerStatus,
      startRmbenchModelServer,
      startSimplerModelServer,
      stopSimplerModelServer,
    } = await import("@/server/evaluation-model-server/service");

    let simplerListening = true;
    const killProcessGroupImpl = vi.fn(() => {
      simplerListening = false;
    });
    const waitForExitImpl = vi.fn().mockResolvedValue(true);

    await startSimplerModelServer({
      runtimeRoot: path.join(tempRoot, "simpler"),
      scriptPath: path.join(tempRoot, "run-simpler-server.sh"),
      port: 8123,
      spawnImpl: createSpawnImpl(41001),
      isProcessRunningImpl: () => true,
      waitForPortReadyImpl: async () => true,
      isPortListeningImpl: async () => true,
      now: () => new Date("2026-05-16T10:00:00.000Z"),
    });
    await startRmbenchModelServer({
      runtimeRoot: path.join(tempRoot, "rmbench"),
      scriptPath: path.join(tempRoot, "run-rmbench-server.sh"),
      port: 9123,
      spawnImpl: createSpawnImpl(42001),
      isProcessRunningImpl: (pid) => pid === 42001,
      waitForPortReadyImpl: async () => true,
      isPortListeningImpl: async () => true,
      now: () => new Date("2026-05-16T10:01:00.000Z"),
    });

    await expect(
      stopSimplerModelServer({
        runtimeRoot: path.join(tempRoot, "simpler"),
        port: 8123,
        isPortListeningImpl: async () => simplerListening,
        isProcessRunningImpl: () => true,
        killProcessGroupImpl,
        waitForExitImpl,
        now: () => new Date("2026-05-16T10:02:00.000Z"),
      }),
    ).resolves.toMatchObject({
      benchmark: "simpler",
      status: "stopped",
    });

    expect(killProcessGroupImpl).toHaveBeenCalledWith(41001, "SIGTERM");
    await expect(
      getRmbenchModelServerStatus({
        runtimeRoot: path.join(tempRoot, "rmbench"),
        port: 9123,
        isPortListeningImpl: async () => true,
        isProcessRunningImpl: (pid) => pid === 42001,
      }),
    ).resolves.toMatchObject({
      benchmark: "rmbench",
      status: "running",
      pid: 42001,
    });
  });

  test("reconciles stale runtime records when the tracked process is gone", async () => {
    const { getSimplerModelServerStatus } = await import(
      "@/server/evaluation-model-server/service"
    );

    const runtimeRoot = path.join(tempRoot, "simpler");
    await mkdir(runtimeRoot, { recursive: true });
    await writeFile(
      path.join(runtimeRoot, "active-server.json"),
      JSON.stringify({ pid: 41001 }),
      "utf8",
    );
    await writeFile(
      path.join(runtimeRoot, "status.json"),
      JSON.stringify({
        benchmark: "simpler",
        label: "Simpler 模型服务",
        status: "running",
        pid: 41001,
        port: 8123,
        startedAt: "2026-05-16T10:00:00.000Z",
        updatedAt: "2026-05-16T10:00:01.000Z",
        checkpointPath:
          "/root/autodl-tmp/checkpoints/pi05_simpler/pi05_bridge_v2_full/26000",
        logPath: runtimeRoot,
        logFiles: {
          launcher: path.join(runtimeRoot, "launcher.log"),
          server: path.join(runtimeRoot, "server.log"),
        },
        errorMessage: null,
      }),
      "utf8",
    );

    await expect(
      getSimplerModelServerStatus({
        runtimeRoot,
        port: 8123,
        isProcessRunningImpl: () => false,
        now: () => new Date("2026-05-16T10:03:00.000Z"),
      }),
    ).resolves.toMatchObject({
      benchmark: "simpler",
      status: "failed",
      pid: 41001,
      errorMessage: "模型服务进程已退出",
    });
  });

  test("recovers a running server from the configured port when the recorded pid is stale", async () => {
    const { getSimplerModelServerStatus } = await import(
      "@/server/evaluation-model-server/service"
    );

    const runtimeRoot = path.join(tempRoot, "simpler");
    await mkdir(runtimeRoot, { recursive: true });
    await writeFile(
      path.join(runtimeRoot, "status.json"),
      JSON.stringify({
        benchmark: "simpler",
        label: "Simpler 模型服务",
        status: "failed",
        pid: 41001,
        port: 8123,
        startedAt: "2026-05-16T10:00:00.000Z",
        updatedAt: "2026-05-16T10:00:01.000Z",
        checkpointPath:
          "/root/autodl-tmp/checkpoints/pi05_simpler/pi05_bridge_v2_full/26000",
        logPath: runtimeRoot,
        logFiles: {
          launcher: path.join(runtimeRoot, "launcher.log"),
          server: path.join(runtimeRoot, "server.log"),
        },
        errorMessage: "模型服务进程已退出",
      }),
      "utf8",
    );

    await expect(
      getSimplerModelServerStatus({
        runtimeRoot,
        port: 8123,
        isPortListeningImpl: async (port) => port === 8123,
        isProcessRunningImpl: (pid) => pid === 41002,
        findPidByPortImpl: async (port) => (port === 8123 ? 41002 : null),
        now: () => new Date("2026-05-16T10:03:00.000Z"),
      }),
    ).resolves.toMatchObject({
      benchmark: "simpler",
      status: "running",
      pid: 41002,
      errorMessage: null,
    });
  });

  test("treats a listening configured port as running even when status.json says failed", async () => {
    const { getSimplerModelServerStatus } = await import(
      "@/server/evaluation-model-server/service"
    );

    const runtimeRoot = path.join(tempRoot, "simpler");
    await mkdir(runtimeRoot, { recursive: true });
    await writeFile(
      path.join(runtimeRoot, "status.json"),
      JSON.stringify({
        benchmark: "simpler",
        label: "Simpler 模型服务",
        status: "failed",
        pid: 41001,
        port: 8123,
        startedAt: "2026-05-16T10:00:00.000Z",
        updatedAt: "2026-05-16T10:00:01.000Z",
        checkpointPath:
          "/root/autodl-tmp/checkpoints/pi05_simpler/pi05_bridge_v2_full/26000",
        logPath: runtimeRoot,
        logFiles: {
          launcher: path.join(runtimeRoot, "launcher.log"),
          server: path.join(runtimeRoot, "server.log"),
        },
        errorMessage: "模型服务进程已退出",
      }),
      "utf8",
    );

    await expect(
      getSimplerModelServerStatus({
        runtimeRoot,
        port: 8123,
        isPortListeningImpl: async (port) => port === 8123,
        isProcessRunningImpl: (pid) => pid === 41001,
        findPidByPortImpl: async () => 41001,
        now: () => new Date("2026-05-16T10:03:00.000Z"),
      }),
    ).resolves.toMatchObject({
      benchmark: "simpler",
      status: "running",
      pid: 41001,
      errorMessage: null,
    });
  });

  test("does not report running when the configured port is not listening even if the old pid still exists", async () => {
    const { getSimplerModelServerStatus } = await import(
      "@/server/evaluation-model-server/service"
    );

    const runtimeRoot = path.join(tempRoot, "simpler");
    await mkdir(runtimeRoot, { recursive: true });
    await writeFile(
      path.join(runtimeRoot, "status.json"),
      JSON.stringify({
        benchmark: "simpler",
        label: "Simpler 模型服务",
        status: "running",
        pid: 41001,
        port: 8123,
        startedAt: "2026-05-16T10:00:00.000Z",
        updatedAt: "2026-05-16T10:00:01.000Z",
        checkpointPath:
          "/root/autodl-tmp/checkpoints/pi05_simpler/pi05_bridge_v2_full/26000",
        logPath: runtimeRoot,
        logFiles: {
          launcher: path.join(runtimeRoot, "launcher.log"),
          server: path.join(runtimeRoot, "server.log"),
        },
        errorMessage: null,
      }),
      "utf8",
    );

    await expect(
      getSimplerModelServerStatus({
        runtimeRoot,
        port: 8123,
        isPortListeningImpl: async () => false,
        isProcessRunningImpl: (pid) => pid === 41001,
        now: () => new Date("2026-05-16T10:03:00.000Z"),
      }),
    ).resolves.toMatchObject({
      benchmark: "simpler",
      status: "failed",
      pid: 41001,
      errorMessage: "模型服务进程已退出",
    });
  });

  test("stops a recovered server when the recorded pid is stale but the port is still owned", async () => {
    const { stopSimplerModelServer } = await import(
      "@/server/evaluation-model-server/service"
    );

    const runtimeRoot = path.join(tempRoot, "simpler");
    let recoveredListening = true;
    const killProcessGroupImpl = vi.fn(() => {
      recoveredListening = false;
    });
    const waitForExitImpl = vi.fn().mockResolvedValue(true);

    await mkdir(runtimeRoot, { recursive: true });
    await writeFile(
      path.join(runtimeRoot, "status.json"),
      JSON.stringify({
        benchmark: "simpler",
        label: "Simpler 模型服务",
        status: "failed",
        pid: 41001,
        port: 8123,
        startedAt: "2026-05-16T10:00:00.000Z",
        updatedAt: "2026-05-16T10:00:01.000Z",
        checkpointPath:
          "/root/autodl-tmp/checkpoints/pi05_simpler/pi05_bridge_v2_full/26000",
        logPath: runtimeRoot,
        logFiles: {
          launcher: path.join(runtimeRoot, "launcher.log"),
          server: path.join(runtimeRoot, "server.log"),
        },
        errorMessage: "模型服务进程已退出",
      }),
      "utf8",
    );

    await expect(
      stopSimplerModelServer({
        runtimeRoot,
        port: 8123,
        isPortListeningImpl: async (port) => port === 8123 && recoveredListening,
        isProcessRunningImpl: (pid) => pid === 41002,
        findPidByPortImpl: async (port) => (port === 8123 ? 41002 : null),
        killProcessGroupImpl,
        waitForExitImpl,
        now: () => new Date("2026-05-16T10:04:00.000Z"),
      }),
    ).resolves.toMatchObject({
      benchmark: "simpler",
      status: "stopped",
      pid: 41002,
    });

    expect(killProcessGroupImpl).toHaveBeenCalledWith(41002, "SIGTERM");
    expect(waitForExitImpl).toHaveBeenCalledWith(41002, 5000);
  });

  test("reads the persistent model server log tail from the benchmark runtime root", async () => {
    const { readSimplerModelServerLog } = await import(
      "@/server/evaluation-model-server/service"
    );

    const runtimeRoot = path.join(tempRoot, "simpler");
    await mkdir(runtimeRoot, { recursive: true });
    await writeFile(
      path.join(runtimeRoot, "server.log"),
      [
        "INFO:root:Creating server (host: demo, ip: 127.0.0.1)",
        "INFO:websockets.server:server listening on 0.0.0.0:8000",
      ].join("\n"),
      "utf8",
    );

    await expect(
      readSimplerModelServerLog("server", {
        runtimeRoot,
      }),
    ).resolves.toMatchObject({
      benchmark: "simpler",
      source: "server",
      path: path.join(runtimeRoot, "server.log"),
      content: expect.stringContaining("server listening on 0.0.0.0:8000"),
      truncated: false,
    });
  });
});

function createSpawnImpl(pid: number) {
  return vi.fn().mockReturnValue({
    pid,
    unref: vi.fn(),
    once(event: string, handler: () => void) {
      if (event === "spawn") {
        handler();
      }
      return this;
    },
  });
}

async function readJson(filePath: string) {
  const fs = await import("node:fs/promises");
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}
