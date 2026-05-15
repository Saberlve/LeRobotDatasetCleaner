import { spawn } from "node:child_process";
import {
  access,
  mkdir,
  open as openFile,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import net from "node:net";
import path from "node:path";

import type {
  SimplerLaunchActionPoint,
  SimplerLaunchLogFiles,
  SimplerLaunchLogResponse,
  SimplerLaunchLogSource,
  SimplerLaunchMeta,
  SimplerLaunchRuntimeStatus,
  SimplerLaunchRunStatus,
  SimplerLaunchStatusResponse,
  SimplerTaskId,
} from "@/types/simpler-launch";

const REPO_ROOT = process.env.NEXTJS_REPO_ROOT || process.cwd();
const OPENPI_ROOT = process.env.OPENPI_CODE_ROOT || "/VLA/openpi";
const DEFAULT_RUNTIME_ROOT =
  process.env.SIMPLER_LAUNCH_RUNTIME_ROOT ||
  path.join(OPENPI_ROOT, "third_party/SimplerEnv/runtime/launch");
const DEFAULT_SCRIPT_PATH =
  process.env.SIMPLER_LAUNCH_SCRIPT_PATH ||
  path.join(REPO_ROOT, "scripts/run_simpler_launch.sh");
const FIXED_CHECKPOINT_PATH =
  "/root/autodl-tmp/checkpoints/pi05_simpler/pi05_bridge_v2_full/26000";
const ACTIVE_RUN_FILE = "active-run.json";
const LATEST_RUN_FILE = "latest-run.json";
const LOG_TAIL_BYTES = Math.max(
  4096,
  Number(process.env.SIMPLER_LAUNCH_LOG_TAIL_BYTES || 65536),
);
const FINAL_STATUSES = new Set<SimplerLaunchRunStatus>([
  "idle",
  "succeeded",
  "failed",
  "stopped",
]);
const LOG_FILE_NAMES = {
  launcher: "launcher.log",
  server: "server.log",
  client: "client.log",
} as const;
const LOG_SOURCES: SimplerLaunchLogSource[] = ["server", "client"];

type ActiveRunRecord = {
  runId: string;
  pid: number;
};

type TaskConfig = {
  envName: string;
  sceneName: string;
  robot: string;
  rgbOverlayPath: string;
  renderScale: number;
};

type LaunchDeps = {
  runtimeRoot: string;
  scriptPath: string;
  spawnImpl: typeof spawn;
  now: () => Date;
  findFreePortImpl: () => Promise<number>;
  isProcessRunningImpl: (pid: number) => boolean;
  killProcessGroupImpl: (pid: number, signal?: NodeJS.Signals | number) => void;
  waitForExitImpl: (pid: number, timeoutMs: number) => Promise<boolean>;
};

type ServiceDeps = Partial<LaunchDeps>;

const TASK_CONFIGS: Record<SimplerTaskId, TaskConfig> = {
  bridge_carrot: {
    envName: "PutCarrotOnPlateInScene-v0",
    sceneName: "bridge_table_1_v1",
    robot: "widowx",
    rgbOverlayPath:
      "ManiSkill2_real2sim/data/real_inpainting/bridge_real_eval_1.png",
    renderScale: 2,
  },
  bridge_stack: {
    envName: "StackGreenCubeOnYellowCubeBakedTexInScene-v0",
    sceneName: "bridge_table_1_v1",
    robot: "widowx",
    rgbOverlayPath:
      "ManiSkill2_real2sim/data/real_inpainting/bridge_real_eval_1.png",
    renderScale: 2,
  },
  bridge_spoon: {
    envName: "PutSpoonOnTableClothInScene-v0",
    sceneName: "bridge_table_1_v1",
    robot: "widowx",
    rgbOverlayPath:
      "ManiSkill2_real2sim/data/real_inpainting/bridge_real_eval_1.png",
    renderScale: 2,
  },
  eggplant: {
    envName: "PutEggplantInBasketScene-v0",
    sceneName: "bridge_table_1_v2",
    robot: "widowx_sink_camera_setup",
    rgbOverlayPath: "ManiSkill2_real2sim/data/real_inpainting/bridge_sink.png",
    renderScale: 2,
  },
};

export class SimplerLaunchError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = "SimplerLaunchError";
    this.statusCode = statusCode;
  }
}

export async function launchSimplerEvaluation(
  taskId: string,
  deps?: ServiceDeps,
): Promise<SimplerLaunchStatusResponse> {
  if (!isSimplerTaskId(taskId)) {
    throw new SimplerLaunchError(
      `Unsupported SimplerEnv task id: ${taskId}`,
      400,
    );
  }

  const resolved = resolveDeps(deps);
  await mkdir(resolved.runtimeRoot, { recursive: true });
  await reconcileActiveRun(resolved);

  const activeRun = await readActiveRun(resolved.runtimeRoot);
  if (activeRun && resolved.isProcessRunningImpl(activeRun.pid)) {
    throw new SimplerLaunchError(
      "A SimplerEnv evaluation is already running",
      409,
    );
  }

  const runId = createRunId(taskId, resolved.now());
  const runRoot = path.join(resolved.runtimeRoot, runId);
  const logFiles = buildLogFiles(runRoot);
  const taskConfig = TASK_CONFIGS[taskId];
  const serverPort = await resolved.findFreePortImpl();
  const timestamp = resolved.now().toISOString();
  const meta: SimplerLaunchMeta = {
    taskId,
    envName: taskConfig.envName,
    sceneName: taskConfig.sceneName,
    robot: taskConfig.robot,
    rgbOverlayPath: taskConfig.rgbOverlayPath,
    checkpointPath: FIXED_CHECKPOINT_PATH,
    serverPort,
    renderScale: taskConfig.renderScale,
  };
  const status: SimplerLaunchRuntimeStatus = {
    runId,
    taskId,
    prompt: "",
    status: "starting",
    step: 0,
    startedAt: timestamp,
    updatedAt: timestamp,
    pid: null,
    latestFramePath: path.join(runRoot, "latest-frame.jpg"),
    actionCount: 0,
    logPath: runRoot,
    logFiles,
    errorMessage: null,
  };

  await mkdir(runRoot, { recursive: true });
  await Promise.all([
    writeJsonAtomic(path.join(runRoot, "meta.json"), meta),
    writeJsonAtomic(path.join(runRoot, "actions.json"), []),
    writeJsonAtomic(path.join(runRoot, "status.json"), status),
    writeFile(logFiles.launcher, "", "utf8"),
    writeFile(logFiles.server, "", "utf8"),
    writeFile(logFiles.client, "", "utf8"),
  ]);

  try {
    const child = resolved.spawnImpl(resolved.scriptPath, [taskId, runId], {
      cwd: REPO_ROOT,
      detached: true,
      env: {
        ...process.env,
        OPENPI_CODE_ROOT: OPENPI_ROOT,
        SIMPLERENV_LAUNCH_RUNTIME_DIR: runRoot,
        SIMPLERENV_LAUNCH_RUN_ID: runId,
        SIMPLERENV_LAUNCH_TASK_ID: taskId,
        SIMPLERENV_LAUNCH_SERVER_PORT: String(serverPort),
        SIMPLERENV_LAUNCH_CHECKPOINT_PATH: FIXED_CHECKPOINT_PATH,
        SIMPLERENV_LAUNCH_RENDER_SCALE: String(taskConfig.renderScale),
        SIMPLERENV_LAUNCH_LOG_LAUNCHER: logFiles.launcher,
        SIMPLERENV_LAUNCH_LOG_SERVER: logFiles.server,
        SIMPLERENV_LAUNCH_LOG_CLIENT: logFiles.client,
      },
      stdio: "ignore",
    });
    const pid = await waitForSpawn(child);
    child.unref();

    status.pid = pid;
    await writeJsonAtomic(path.join(runRoot, "status.json"), status);
    await writeJsonAtomic(path.join(resolved.runtimeRoot, ACTIVE_RUN_FILE), {
      runId,
      pid,
    });
    await writeJsonAtomic(path.join(resolved.runtimeRoot, LATEST_RUN_FILE), {
      runId,
    });
  } catch {
    await updateRuntimeStatus(runRoot, {
      status: "failed",
      updatedAt: resolved.now().toISOString(),
      errorMessage: "Failed to launch SimplerEnv",
    });
    throw new SimplerLaunchError("Failed to launch SimplerEnv", 500);
  }

  return getSimplerEvaluationStatus(resolved, runId);
}

export async function stopSimplerEvaluation(
  requestedRunId?: string,
  deps?: ServiceDeps,
): Promise<SimplerLaunchStatusResponse> {
  const resolved = resolveDeps(deps);
  await reconcileActiveRun(resolved);

  const activeRun = await readActiveRun(resolved.runtimeRoot);
  if (!activeRun) {
    const latestRunId = await readLatestRunId(resolved.runtimeRoot);
    if (latestRunId) {
      return getSimplerEvaluationStatus(resolved, latestRunId);
    }
    throw new SimplerLaunchError("No active SimplerEnv evaluation", 409);
  }

  if (requestedRunId && requestedRunId !== activeRun.runId) {
    throw new SimplerLaunchError(
      "Requested runId does not match the active run",
      409,
    );
  }

  const runRoot = path.join(resolved.runtimeRoot, activeRun.runId);
  const current = await readRuntimeStatus(runRoot);
  if (!current) {
    await removeFile(path.join(resolved.runtimeRoot, ACTIVE_RUN_FILE));
    throw new SimplerLaunchError("No active SimplerEnv evaluation", 409);
  }

  if (!resolved.isProcessRunningImpl(activeRun.pid)) {
    await reconcileRun(activeRun.runId, resolved);
    return getSimplerEvaluationStatus(resolved, activeRun.runId);
  }

  await updateRuntimeStatus(runRoot, {
    status: "stopping",
    updatedAt: resolved.now().toISOString(),
    pid: activeRun.pid,
  });
  resolved.killProcessGroupImpl(activeRun.pid, "SIGTERM");
  const exited = await resolved.waitForExitImpl(activeRun.pid, 5000);
  if (!exited) {
    resolved.killProcessGroupImpl(activeRun.pid, "SIGKILL");
    await resolved.waitForExitImpl(activeRun.pid, 2000);
  }

  await updateRuntimeStatus(runRoot, {
    status: "stopped",
    updatedAt: resolved.now().toISOString(),
    errorMessage: null,
  });
  await removeFile(path.join(resolved.runtimeRoot, ACTIVE_RUN_FILE));

  return getSimplerEvaluationStatus(resolved, activeRun.runId);
}

export async function getSimplerEvaluationStatus(
  deps?: ServiceDeps,
  requestedRunId?: string,
): Promise<SimplerLaunchStatusResponse> {
  const resolved = resolveDeps(deps);
  await mkdir(resolved.runtimeRoot, { recursive: true });

  const runId =
    requestedRunId ||
    (await readActiveRun(resolved.runtimeRoot))?.runId ||
    (await readLatestRunId(resolved.runtimeRoot));
  if (!runId) {
    return buildIdleStatus();
  }

  await reconcileRun(runId, resolved);
  const runRoot = path.join(resolved.runtimeRoot, runId);
  const runtimeStatus = await readRuntimeStatus(runRoot);
  if (!runtimeStatus) {
    return buildIdleStatus();
  }

  return {
    runId: runtimeStatus.runId,
    taskId: runtimeStatus.taskId,
    prompt: runtimeStatus.prompt,
    status: runtimeStatus.status,
    step: runtimeStatus.step,
    startedAt: runtimeStatus.startedAt,
    updatedAt: runtimeStatus.updatedAt,
    latestFrameUrl: `/api/evaluation/simpler/frame?runId=${encodeURIComponent(runtimeStatus.runId)}`,
    frameVersion: runtimeStatus.actionCount,
    actionSeries: await readActions(runRoot),
    errorMessage: runtimeStatus.errorMessage,
    logPath: runtimeStatus.logPath,
    logFiles: resolveLogFiles(runRoot, runtimeStatus),
  };
}

export async function resolveSimplerFramePath(
  runId: string,
  deps?: ServiceDeps,
): Promise<string> {
  validateRunId(runId);
  const resolved = resolveDeps(deps);
  const runtimeStatus = await readRuntimeStatus(
    path.join(resolved.runtimeRoot, runId),
  );
  if (!runtimeStatus) {
    throw new SimplerLaunchError("SimplerEnv run not found", 404);
  }

  const framePath =
    runtimeStatus.latestFramePath ||
    path.join(resolved.runtimeRoot, runId, "latest-frame.jpg");
  if (!(await fileExists(framePath))) {
    throw new SimplerLaunchError("SimplerEnv frame not found", 404);
  }
  return framePath;
}

export async function readSimplerEvaluationLog(
  runId: string,
  source: string,
  deps?: ServiceDeps,
): Promise<SimplerLaunchLogResponse> {
  validateRunId(runId);
  if (!isSimplerLogSource(source)) {
    throw new SimplerLaunchError(
      `Unsupported SimplerEnv log source: ${source}`,
      400,
    );
  }

  const resolved = resolveDeps(deps);
  const runRoot = path.join(resolved.runtimeRoot, runId);
  const runtimeStatus = await readRuntimeStatus(runRoot);
  if (!runtimeStatus) {
    throw new SimplerLaunchError("SimplerEnv run not found", 404);
  }

  const logPath = resolveLogFiles(runRoot, runtimeStatus)[source];
  const logData = await readLogTail(logPath, LOG_TAIL_BYTES);
  return {
    runId,
    source,
    path: logPath,
    content: logData.content,
    truncated: logData.truncated,
    updatedAt: logData.updatedAt,
  };
}

function resolveDeps(deps?: ServiceDeps): LaunchDeps {
  return {
    runtimeRoot: path.resolve(deps?.runtimeRoot || DEFAULT_RUNTIME_ROOT),
    scriptPath: path.resolve(deps?.scriptPath || DEFAULT_SCRIPT_PATH),
    spawnImpl: deps?.spawnImpl ?? spawn,
    now: deps?.now ?? (() => new Date()),
    findFreePortImpl: deps?.findFreePortImpl ?? findFreePort,
    isProcessRunningImpl: deps?.isProcessRunningImpl ?? isProcessRunning,
    killProcessGroupImpl: deps?.killProcessGroupImpl ?? killProcessGroup,
    waitForExitImpl: deps?.waitForExitImpl ?? waitForExit,
  };
}

function isSimplerTaskId(value: string): value is SimplerTaskId {
  return Object.prototype.hasOwnProperty.call(TASK_CONFIGS, value);
}

function isSimplerLogSource(value: string): value is SimplerLaunchLogSource {
  return LOG_SOURCES.includes(value as SimplerLaunchLogSource);
}

function createRunId(taskId: SimplerTaskId, now: Date) {
  return `${now.toISOString().replace(/:/g, "-").replace(/\./g, "-")}_${taskId}`;
}

function validateRunId(runId: string) {
  if (!/^[A-Za-z0-9._-]+$/.test(runId)) {
    throw new SimplerLaunchError("Invalid SimplerEnv runId", 400);
  }
}

function buildIdleStatus(): SimplerLaunchStatusResponse {
  return {
    runId: null,
    taskId: null,
    prompt: "",
    status: "idle",
    step: 0,
    startedAt: null,
    updatedAt: null,
    latestFrameUrl: null,
    frameVersion: 0,
    actionSeries: [],
    errorMessage: null,
    logPath: null,
    logFiles: null,
  };
}

function buildLogFiles(runRoot: string): SimplerLaunchLogFiles {
  return {
    launcher: path.join(runRoot, LOG_FILE_NAMES.launcher),
    server: path.join(runRoot, LOG_FILE_NAMES.server),
    client: path.join(runRoot, LOG_FILE_NAMES.client),
  };
}

function resolveLogFiles(
  runRoot: string,
  runtimeStatus?: SimplerLaunchRuntimeStatus | null,
): SimplerLaunchLogFiles {
  return runtimeStatus?.logFiles ?? buildLogFiles(runRoot);
}

async function reconcileActiveRun(deps: LaunchDeps) {
  const activeRun = await readActiveRun(deps.runtimeRoot);
  if (!activeRun) return;
  await reconcileRun(activeRun.runId, deps);
}

async function reconcileRun(runId: string, deps: LaunchDeps) {
  const runRoot = path.join(deps.runtimeRoot, runId);
  const runtimeStatus = await readRuntimeStatus(runRoot);
  if (!runtimeStatus) return;

  if (FINAL_STATUSES.has(runtimeStatus.status)) {
    const activeRun = await readActiveRun(deps.runtimeRoot);
    if (activeRun?.runId === runId) {
      await removeFile(path.join(deps.runtimeRoot, ACTIVE_RUN_FILE));
    }
    return;
  }

  if (runtimeStatus.pid && deps.isProcessRunningImpl(runtimeStatus.pid)) {
    return;
  }

  await updateRuntimeStatus(runRoot, {
    status: runtimeStatus.status === "stopping" ? "stopped" : "failed",
    updatedAt: deps.now().toISOString(),
    errorMessage:
      runtimeStatus.status === "stopping"
        ? null
        : runtimeStatus.errorMessage || "评测进程已退出",
  });
  const activeRun = await readActiveRun(deps.runtimeRoot);
  if (activeRun?.runId === runId) {
    await removeFile(path.join(deps.runtimeRoot, ACTIVE_RUN_FILE));
  }
}

async function readActiveRun(runtimeRoot: string) {
  return readJsonFile<ActiveRunRecord>(path.join(runtimeRoot, ACTIVE_RUN_FILE));
}

async function readLatestRunId(runtimeRoot: string) {
  const latest = await readJsonFile<{ runId: string }>(
    path.join(runtimeRoot, LATEST_RUN_FILE),
  );
  return latest?.runId ?? null;
}

async function readRuntimeStatus(runRoot: string) {
  return readJsonFile<SimplerLaunchRuntimeStatus>(path.join(runRoot, "status.json"));
}

async function readActions(runRoot: string) {
  const actions =
    (await readJsonFile<SimplerLaunchActionPoint[]>(
      path.join(runRoot, "actions.json"),
    )) ?? [];
  return Array.isArray(actions) ? actions : [];
}

async function updateRuntimeStatus(
  runRoot: string,
  patch: Partial<SimplerLaunchRuntimeStatus>,
) {
  const current = await readRuntimeStatus(runRoot);
  if (!current) return;
  await writeJsonAtomic(path.join(runRoot, "status.json"), {
    ...current,
    ...patch,
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

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
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

async function findFreePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to allocate port")));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
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
