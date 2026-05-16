import { spawn } from "node:child_process";
import {
  access,
  mkdir,
  open as openFile,
  readdir,
  readFile,
  readlink,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import net from "node:net";
import path from "node:path";

import type {
  EvaluationBenchmark,
  EvaluationModelServerLogFiles,
  EvaluationModelServerLogResponse,
  EvaluationModelServerLogSource,
  EvaluationModelServerStatus,
} from "@/types/evaluation-model-server";

const REPO_ROOT = process.env.NEXTJS_REPO_ROOT || process.cwd();
const OPENPI_ROOT = process.env.OPENPI_CODE_ROOT || "/VLA/openpi";
const ACTIVE_SERVER_FILE = "active-server.json";
const STATUS_FILE = "status.json";
const LOG_FILE_NAMES = {
  launcher: "launcher.log",
  server: "server.log",
} as const;
const FINAL_STATUSES = new Set<EvaluationModelServerStatus["status"]>([
  "idle",
  "failed",
  "stopped",
]);
const START_TIMEOUT_MS = Math.max(
  5000,
  Number(process.env.EVALUATION_MODEL_SERVER_START_TIMEOUT_MS || 300000),
);
const LOG_TAIL_BYTES = 64 * 1024;

type BenchmarkConfig = {
  benchmark: EvaluationBenchmark;
  label: string;
  portEnvVar: string;
  defaultPort: number;
  checkpointEnvVar: string;
  defaultCheckpointPath: string;
  runtimeRootEnvVar: string;
  defaultRuntimeRoot: string;
  scriptPathEnvVar: string;
  defaultScriptPath: string;
  envPrefix: string;
};

type ActiveServerRecord = {
  pid: number;
};

type ModelServerServiceDeps = {
  runtimeRoot: string;
  scriptPath: string;
  port: number;
  checkpointPath: string;
  spawnImpl: typeof spawn;
  now: () => Date;
  waitForPortReadyImpl: (port: number, pid: number) => Promise<boolean>;
  isPortListeningImpl: (port: number) => Promise<boolean>;
  isProcessRunningImpl: (pid: number) => boolean;
  findPidByPortImpl: (port: number) => Promise<number | null>;
  killProcessGroupImpl: (pid: number, signal?: NodeJS.Signals | number) => void;
  waitForExitImpl: (pid: number, timeoutMs: number) => Promise<boolean>;
};

type ServiceDeps = Partial<ModelServerServiceDeps>;

const BENCHMARK_CONFIGS: Record<EvaluationBenchmark, BenchmarkConfig> = {
  simpler: {
    benchmark: "simpler",
    label: "Simpler 模型服务",
    portEnvVar: "SIMPLER_MODEL_SERVER_PORT",
    defaultPort: 8000,
    checkpointEnvVar: "SIMPLER_MODEL_SERVER_CHECKPOINT_PATH",
    defaultCheckpointPath:
      "/root/autodl-tmp/checkpoints/pi05_simpler/pi05_bridge_v2_full/26000",
    runtimeRootEnvVar: "SIMPLER_MODEL_SERVER_RUNTIME_ROOT",
    defaultRuntimeRoot: path.join(
      OPENPI_ROOT,
      "third_party/SimplerEnv/runtime/evaluation/simpler-server",
    ),
    scriptPathEnvVar: "SIMPLER_MODEL_SERVER_SCRIPT_PATH",
    defaultScriptPath: path.join(REPO_ROOT, "scripts/run_simpler_server.sh"),
    envPrefix: "SIMPLER_MODEL_SERVER",
  },
  rmbench: {
    benchmark: "rmbench",
    label: "RMBench 模型服务",
    portEnvVar: "RMBENCH_MODEL_SERVER_PORT",
    defaultPort: 9999,
    checkpointEnvVar: "RMBENCH_MODEL_SERVER_CHECKPOINT_PATH",
    defaultCheckpointPath:
      "/root/autodl-tmp/checkpoints/pi05_rmbench_memory_lora_pytorch/rmbench_mem_lora_h800/30000",
    runtimeRootEnvVar: "RMBENCH_MODEL_SERVER_RUNTIME_ROOT",
    defaultRuntimeRoot: path.join(
      OPENPI_ROOT,
      "third_party/RMBench/runtime/evaluation/rmbench-server",
    ),
    scriptPathEnvVar: "RMBENCH_MODEL_SERVER_SCRIPT_PATH",
    defaultScriptPath: path.join(REPO_ROOT, "scripts/run_rmbench_server.sh"),
    envPrefix: "RMBENCH_MODEL_SERVER",
  },
};

export class EvaluationModelServerError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = "EvaluationModelServerError";
    this.statusCode = statusCode;
  }
}

export async function startSimplerModelServer(deps?: ServiceDeps) {
  return startModelServer("simpler", deps);
}

export async function startRmbenchModelServer(deps?: ServiceDeps) {
  return startModelServer("rmbench", deps);
}

export async function stopSimplerModelServer(deps?: ServiceDeps) {
  return stopModelServer("simpler", deps);
}

export async function stopRmbenchModelServer(deps?: ServiceDeps) {
  return stopModelServer("rmbench", deps);
}

export async function getSimplerModelServerStatus(deps?: ServiceDeps) {
  return getModelServerStatus("simpler", deps);
}

export async function getRmbenchModelServerStatus(deps?: ServiceDeps) {
  return getModelServerStatus("rmbench", deps);
}

export async function readSimplerModelServerLog(
  source: EvaluationModelServerLogSource,
  deps?: ServiceDeps,
) {
  return readModelServerLog("simpler", source, deps);
}

export async function readRmbenchModelServerLog(
  source: EvaluationModelServerLogSource,
  deps?: ServiceDeps,
) {
  return readModelServerLog("rmbench", source, deps);
}

async function startModelServer(benchmark: EvaluationBenchmark, deps?: ServiceDeps) {
  const resolved = resolveDeps(benchmark, deps);
  await mkdir(resolved.runtimeRoot, { recursive: true });
  await reconcileStatus(benchmark, resolved);

  const current = await readStatus(resolved.runtimeRoot);
  if (current?.pid && resolved.isProcessRunningImpl(current.pid)) {
    throw new EvaluationModelServerError(`${current.label} 已在运行。`, 409);
  }

  ensureDistinctConfiguredPorts(benchmark, resolved.port);
  await assertPortAvailable(resolved.port);

  const logFiles = buildLogFiles(resolved.runtimeRoot);
  const timestamp = resolved.now().toISOString();
  const status: EvaluationModelServerStatus = {
    benchmark,
    label: BENCHMARK_CONFIGS[benchmark].label,
    status: "starting",
    pid: null,
    port: resolved.port,
    startedAt: timestamp,
    updatedAt: timestamp,
    checkpointPath: resolved.checkpointPath,
    logPath: resolved.runtimeRoot,
    logFiles,
    errorMessage: null,
  };

  await Promise.all([
    writeStatus(resolved.runtimeRoot, status),
    writeFile(logFiles.launcher, "", "utf8"),
    writeFile(logFiles.server, "", "utf8"),
    removeFile(path.join(resolved.runtimeRoot, ACTIVE_SERVER_FILE)),
  ]);

  try {
    const child = resolved.spawnImpl(resolved.scriptPath, [], {
      cwd: REPO_ROOT,
      detached: true,
      env: {
        ...process.env,
        OPENPI_CODE_ROOT: OPENPI_ROOT,
        [`${BENCHMARK_CONFIGS[benchmark].envPrefix}_RUNTIME_DIR`]: resolved.runtimeRoot,
        [`${BENCHMARK_CONFIGS[benchmark].envPrefix}_PORT`]: String(resolved.port),
        [`${BENCHMARK_CONFIGS[benchmark].envPrefix}_CHECKPOINT_PATH`]:
          resolved.checkpointPath,
        [`${BENCHMARK_CONFIGS[benchmark].envPrefix}_LOG_LAUNCHER`]:
          logFiles.launcher,
        [`${BENCHMARK_CONFIGS[benchmark].envPrefix}_LOG_SERVER`]: logFiles.server,
      },
      stdio: "ignore",
    });
    const pid = await waitForSpawn(child);
    child.unref();

    await writeStatus(resolved.runtimeRoot, {
      ...status,
      pid,
      updatedAt: resolved.now().toISOString(),
    });
    await writeJsonAtomic(path.join(resolved.runtimeRoot, ACTIVE_SERVER_FILE), {
      pid,
    });

    const ready = await resolved.waitForPortReadyImpl(resolved.port, pid);
    if (!ready) {
      throw new EvaluationModelServerError(
        `${status.label} 启动超时，请检查端口与日志。`,
        500,
      );
    }

    await writeStatus(resolved.runtimeRoot, {
      ...status,
      pid,
      status: "running",
      updatedAt: resolved.now().toISOString(),
      errorMessage: null,
    });
  } catch (error) {
    await writeStatus(resolved.runtimeRoot, {
      ...status,
      status: "failed",
      updatedAt: resolved.now().toISOString(),
      errorMessage:
        error instanceof EvaluationModelServerError
          ? error.message
          : `Failed to start ${status.label}`,
    });
    await removeFile(path.join(resolved.runtimeRoot, ACTIVE_SERVER_FILE));
    if (error instanceof EvaluationModelServerError) {
      throw error;
    }
    throw new EvaluationModelServerError(`Failed to start ${status.label}`, 500);
  }

  return getModelServerStatus(benchmark, deps);
}

async function stopModelServer(benchmark: EvaluationBenchmark, deps?: ServiceDeps) {
  const resolved = resolveDeps(benchmark, deps);
  await mkdir(resolved.runtimeRoot, { recursive: true });
  await reconcileStatus(benchmark, resolved);

  const current = await readStatus(resolved.runtimeRoot);
  if (!current?.pid || !resolved.isProcessRunningImpl(current.pid)) {
    if (current) {
      return getModelServerStatus(benchmark, deps);
    }
    throw new EvaluationModelServerError(
      `${BENCHMARK_CONFIGS[benchmark].label} 未运行。`,
      409,
    );
  }

  await writeStatus(resolved.runtimeRoot, {
    ...current,
    status: "stopping",
    updatedAt: resolved.now().toISOString(),
  });
  resolved.killProcessGroupImpl(current.pid, "SIGTERM");
  const exited = await resolved.waitForExitImpl(current.pid, 5000);
  if (!exited) {
    resolved.killProcessGroupImpl(current.pid, "SIGKILL");
    await resolved.waitForExitImpl(current.pid, 2000);
  }

  await writeStatus(resolved.runtimeRoot, {
    ...current,
    status: "stopped",
    updatedAt: resolved.now().toISOString(),
    errorMessage: null,
  });
  await removeFile(path.join(resolved.runtimeRoot, ACTIVE_SERVER_FILE));

  return getModelServerStatus(benchmark, deps);
}

async function getModelServerStatus(benchmark: EvaluationBenchmark, deps?: ServiceDeps) {
  const resolved = resolveDeps(benchmark, deps);
  await mkdir(resolved.runtimeRoot, { recursive: true });
  await reconcileStatus(benchmark, resolved);
  const current = await readStatus(resolved.runtimeRoot);
  return current ?? buildIdleStatus(benchmark, resolved);
}

async function readModelServerLog(
  benchmark: EvaluationBenchmark,
  source: EvaluationModelServerLogSource,
  deps?: ServiceDeps,
): Promise<EvaluationModelServerLogResponse> {
  const resolved = resolveDeps(benchmark, deps);
  await mkdir(resolved.runtimeRoot, { recursive: true });
  await reconcileStatus(benchmark, resolved);

  const logPath = buildLogFiles(resolved.runtimeRoot)[source];
  const logData = await readLogTail(logPath, LOG_TAIL_BYTES);
  return {
    benchmark,
    source,
    path: logPath,
    content: logData.content,
    truncated: logData.truncated,
    updatedAt: logData.updatedAt,
  };
}

function resolveDeps(benchmark: EvaluationBenchmark, deps?: ServiceDeps) {
  const config = BENCHMARK_CONFIGS[benchmark];
  const configuredPort =
    deps?.port ?? readConfiguredPort(config.portEnvVar, config.defaultPort);

  return {
    runtimeRoot: path.resolve(
      deps?.runtimeRoot || process.env[config.runtimeRootEnvVar] || config.defaultRuntimeRoot,
    ),
    scriptPath: path.resolve(
      deps?.scriptPath || process.env[config.scriptPathEnvVar] || config.defaultScriptPath,
    ),
    port: configuredPort,
    checkpointPath:
      deps?.checkpointPath ||
      process.env[config.checkpointEnvVar] ||
      config.defaultCheckpointPath,
    spawnImpl: deps?.spawnImpl ?? spawn,
    now: deps?.now ?? (() => new Date()),
    waitForPortReadyImpl:
      deps?.waitForPortReadyImpl ??
      ((port: number, pid: number) => waitForPortReady(port, pid)),
    isPortListeningImpl: deps?.isPortListeningImpl ?? canConnect,
    isProcessRunningImpl: deps?.isProcessRunningImpl ?? isProcessRunning,
    findPidByPortImpl: deps?.findPidByPortImpl ?? findPidByPort,
    killProcessGroupImpl: deps?.killProcessGroupImpl ?? killProcessGroup,
    waitForExitImpl: deps?.waitForExitImpl ?? waitForExit,
  } satisfies ModelServerServiceDeps;
}

function buildIdleStatus(
  benchmark: EvaluationBenchmark,
  resolved: ModelServerServiceDeps,
): EvaluationModelServerStatus {
  return {
    benchmark,
    label: BENCHMARK_CONFIGS[benchmark].label,
    status: "idle",
    pid: null,
    port: resolved.port,
    startedAt: null,
    updatedAt: null,
    checkpointPath: resolved.checkpointPath,
    logPath: resolved.runtimeRoot,
    logFiles: buildLogFiles(resolved.runtimeRoot),
    errorMessage: null,
  };
}

function buildLogFiles(runtimeRoot: string): EvaluationModelServerLogFiles {
  return {
    launcher: path.join(runtimeRoot, LOG_FILE_NAMES.launcher),
    server: path.join(runtimeRoot, LOG_FILE_NAMES.server),
  };
}

async function reconcileStatus(
  benchmark: EvaluationBenchmark,
  resolved: ModelServerServiceDeps,
) {
  const current = await readStatus(resolved.runtimeRoot);
  const recovered = await recoverStatusFromPort(benchmark, resolved, current);
  if (recovered) {
    return;
  }

  if (!current) {
    await removeFile(path.join(resolved.runtimeRoot, ACTIVE_SERVER_FILE));
    return;
  }

  if (FINAL_STATUSES.has(current.status)) {
    await removeFile(path.join(resolved.runtimeRoot, ACTIVE_SERVER_FILE));
    return;
  }

  await writeStatus(resolved.runtimeRoot, {
    ...current,
    benchmark,
    status: current.status === "stopping" ? "stopped" : "failed",
    updatedAt: resolved.now().toISOString(),
    errorMessage:
      current.status === "stopping"
        ? null
        : current.errorMessage || "模型服务进程已退出",
  });
  await removeFile(path.join(resolved.runtimeRoot, ACTIVE_SERVER_FILE));
}

async function recoverStatusFromPort(
  benchmark: EvaluationBenchmark,
  resolved: ModelServerServiceDeps,
  current: EvaluationModelServerStatus | null,
) {
  const isListening = await resolved.isPortListeningImpl(resolved.port);
  if (isListening) {
    const pidFromPort = await resolved.findPidByPortImpl(resolved.port);
    const runningPid =
      pidFromPort && resolved.isProcessRunningImpl(pidFromPort)
        ? pidFromPort
        : current?.pid && resolved.isProcessRunningImpl(current.pid)
          ? current.pid
          : null;

    const base = current ?? buildIdleStatus(benchmark, resolved);
    const recovered: EvaluationModelServerStatus = {
      ...base,
      benchmark,
      label: BENCHMARK_CONFIGS[benchmark].label,
      status: "running",
      pid: runningPid,
      port: resolved.port,
      startedAt: base.startedAt ?? resolved.now().toISOString(),
      updatedAt: resolved.now().toISOString(),
      checkpointPath: base.checkpointPath,
      logPath: base.logPath,
      logFiles: base.logFiles,
      errorMessage: null,
    };
    await writeStatus(resolved.runtimeRoot, recovered);
    if (runningPid) {
      await writeJsonAtomic(path.join(resolved.runtimeRoot, ACTIVE_SERVER_FILE), {
        pid: runningPid,
      });
    } else {
      await removeFile(path.join(resolved.runtimeRoot, ACTIVE_SERVER_FILE));
    }
    return recovered;
  }

  if (current?.status === "starting" && current.pid && resolved.isProcessRunningImpl(current.pid)) {
    await writeJsonAtomic(path.join(resolved.runtimeRoot, ACTIVE_SERVER_FILE), {
      pid: current.pid,
    });
    return current;
  }

  return null;
}

async function readStatus(runtimeRoot: string) {
  return readJsonFile<EvaluationModelServerStatus>(path.join(runtimeRoot, STATUS_FILE));
}

async function writeStatus(runtimeRoot: string, status: EvaluationModelServerStatus) {
  await writeJsonAtomic(path.join(runtimeRoot, STATUS_FILE), status);
}

function ensureDistinctConfiguredPorts(
  benchmark: EvaluationBenchmark,
  candidatePort: number,
) {
  const otherBenchmark = benchmark === "simpler" ? "rmbench" : "simpler";
  const otherConfig = BENCHMARK_CONFIGS[otherBenchmark];
  const otherPort = readConfiguredPort(otherConfig.portEnvVar, otherConfig.defaultPort);
  if (candidatePort === otherPort) {
    throw new EvaluationModelServerError(
      `${BENCHMARK_CONFIGS[benchmark].label} 与 ${otherConfig.label} 不能共用端口 ${candidatePort}。`,
      500,
    );
  }
}

function readConfiguredPort(envVar: string, fallback: number) {
  const raw = process.env[envVar];
  const parsed = raw ? Number(raw) : fallback;
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new EvaluationModelServerError(`${envVar} 必须是有效端口号。`, 500);
  }
  return parsed;
}

async function assertPortAvailable(port: number) {
  await new Promise<void>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", () => {
      reject(
        new EvaluationModelServerError(
          `模型服务端口 ${port} 不可用，请更换端口后重试。`,
          409,
        ),
      );
    });
    server.listen(port, "127.0.0.1", () => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });
}

async function waitForPortReady(port: number, pid: number) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < START_TIMEOUT_MS) {
    if (!isProcessRunning(pid)) {
      return false;
    }
    if (await canConnect(port)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function canConnect(port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const finish = (result: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(250);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

async function writeJsonAtomic(filePath: string, value: unknown) {
  const tempPath = `${filePath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tempPath, filePath);
}

async function removeFile(filePath: string) {
  await rm(filePath, { force: true });
}

async function readLogTail(filePath: string, maxBytes: number) {
  try {
    const fileStats = await stat(filePath);
    if (fileStats.size === 0) {
      return {
        content: "",
        truncated: false,
        updatedAt: fileStats.mtime.toISOString(),
      };
    }

    const start = Math.max(0, fileStats.size - maxBytes);
    const buffer = Buffer.alloc(fileStats.size - start);
    const handle = await openFile(filePath, "r");
    try {
      await handle.read(buffer, 0, buffer.byteLength, start);
    } finally {
      await handle.close();
    }

    return {
      content: normalizeLogContent(buffer.toString("utf8"), start > 0),
      truncated: start > 0,
      updatedAt: fileStats.mtime.toISOString(),
    };
  } catch {
    return {
      content: "",
      truncated: false,
      updatedAt: null,
    };
  }
}

function normalizeLogContent(content: string, truncated: boolean) {
  if (!truncated) {
    return content;
  }

  const newlineIndex = content.indexOf("\n");
  if (newlineIndex === -1) {
    return content;
  }
  return content.slice(newlineIndex + 1);
}

async function waitForSpawn(child: ReturnType<typeof spawn>) {
  if (typeof child.pid !== "number") {
    throw new Error("Spawned process did not provide a pid");
  }

  return new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("spawn", () => resolve(child.pid!));
  });
}

function isProcessRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killProcessGroup(
  pid: number,
  signal: NodeJS.Signals | number = "SIGTERM",
) {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      (error as NodeJS.ErrnoException).code !== "ESRCH"
    ) {
      throw error;
    }
  }
}

async function waitForExit(pid: number, timeoutMs: number) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!isProcessRunning(pid)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return !isProcessRunning(pid);
}

async function findPidByPort(port: number) {
  const socketInodes = await findListeningSocketInodes(port);
  if (socketInodes.size === 0) {
    return null;
  }

  try {
    const procEntries = await readdir("/proc", { withFileTypes: true });
    for (const entry of procEntries) {
      if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) {
        continue;
      }

      const pid = Number(entry.name);
      if (!Number.isInteger(pid) || pid <= 0) {
        continue;
      }

      const fdDir = `/proc/${entry.name}/fd`;
      let fds: string[];
      try {
        fds = await readdir(fdDir);
      } catch {
        continue;
      }

      for (const fd of fds) {
        try {
          const target = await readlink(path.join(fdDir, fd));
          const match = /^socket:\[(\d+)\]$/.exec(target);
          if (match && socketInodes.has(match[1])) {
            return pid;
          }
        } catch {
          continue;
        }
      }
    }
  } catch {
    return null;
  }

  return null;
}

async function findListeningSocketInodes(port: number) {
  const socketInodes = new Set<string>();
  const encodedPort = port.toString(16).toUpperCase().padStart(4, "0");

  for (const tablePath of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    try {
      const content = await readFile(tablePath, "utf8");
      for (const line of content.split("\n").slice(1)) {
        const columns = line.trim().split(/\s+/);
        if (columns.length < 10) {
          continue;
        }

        const [, localAddress, , state, , , , , , inode] = columns;
        const localPort = localAddress?.split(":")[1];
        if (localPort === encodedPort && state === "0A" && inode) {
          socketInodes.add(inode);
        }
      }
    } catch {
      continue;
    }
  }

  return socketInodes;
}
