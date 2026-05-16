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

import { getSimplerModelServerStatus } from "@/server/evaluation-model-server/service";
import type { EvaluationModelServerStatus } from "@/types/evaluation-model-server";

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
const STOP_REQUEST_FILE = "stop-requested.json";
const LOG_TAIL_BYTES = Math.max(
  4096,
  Number(process.env.SIMPLER_LAUNCH_LOG_TAIL_BYTES || 65536),
);
const DEFAULT_FRAME_STREAM_POLL_INTERVAL_MS = Math.max(
  30,
  Number(process.env.SIMPLER_FRAME_STREAM_POLL_INTERVAL_MS || 40),
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
  readModelServerStatusImpl: () => Promise<EvaluationModelServerStatus>;
  isProcessRunningImpl: (pid: number) => boolean;
  killProcessImpl: (pid: number, signal?: NodeJS.Signals | number) => void;
  readProcessGroupIdImpl: (pid: number) => Promise<number | null>;
  killProcessGroupImpl: (pid: number, signal?: NodeJS.Signals | number) => void;
  waitForExitImpl: (pid: number, timeoutMs: number) => Promise<boolean>;
};

type ServiceDeps = Partial<LaunchDeps>;
type FrameStreamDeps = ServiceDeps & {
  framePollIntervalMs?: number;
  sleepImpl?: (ms: number) => Promise<void>;
};

export const FRAME_STREAM_BOUNDARY = "frame";
export const FRAME_STREAM_CONTENT_TYPE =
  `multipart/x-mixed-replace; boundary=${FRAME_STREAM_BOUNDARY}`;
const FRAME_STREAM_STEP_HEADER = "X-Simpler-Step";
const FRAME_STREAM_ACTION_COUNT_HEADER = "X-Simpler-Action-Count";

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

  const activeRun = await resolveTrackedActiveRun(resolved);
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
  const modelServerStatus = await resolved.readModelServerStatusImpl();
  if (modelServerStatus.status !== "running") {
    throw new SimplerLaunchError(
      "Simpler 模型服务未运行，请先启动 Simpler 模型服务。",
      409,
    );
  }

  const serverPort = modelServerStatus.port;
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

  const activeRun = await resolveTrackedActiveRun(resolved, requestedRunId);
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

  const stopTargets = collectStopTargetPids(activeRun, current, resolved);
  if (stopTargets.length === 0) {
    await reconcileRun(activeRun.runId, resolved);
    return getSimplerEvaluationStatus(resolved, activeRun.runId);
  }

  await updateRuntimeStatus(runRoot, {
    status: "stopping",
    updatedAt: resolved.now().toISOString(),
    pid: activeRun.pid,
  });
  await writeJsonAtomic(path.join(runRoot, STOP_REQUEST_FILE), {
    requestedAt: resolved.now().toISOString(),
  });
  for (const pid of stopTargets) {
    killTrackedProcess(pid, resolved, "SIGTERM");
  }
  const exitedStates = await Promise.all(
    stopTargets.map((pid) => resolved.waitForExitImpl(pid, 5000)),
  );
  const remainingTargets = stopTargets.filter((_, index) => !exitedStates[index]);
  if (remainingTargets.length > 0) {
    for (const pid of remainingTargets) {
      killTrackedProcess(pid, resolved, "SIGKILL");
    }
    await Promise.all(
      remainingTargets.map((pid) => resolved.waitForExitImpl(pid, 2000)),
    );
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
    (await resolveTrackedActiveRun(resolved))?.runId ||
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
  const processActive = isRuntimeProcessActive(runtimeStatus.pid, resolved);

  return {
    runId: runtimeStatus.runId,
    taskId: runtimeStatus.taskId,
    prompt: runtimeStatus.prompt,
    status: runtimeStatus.status,
    processActive,
    step: runtimeStatus.step,
    startedAt: runtimeStatus.startedAt,
    updatedAt: runtimeStatus.updatedAt,
    latestFrameUrl: `/api/evaluation/simpler/frame?runId=${encodeURIComponent(runtimeStatus.runId)}`,
    frameVersion: await resolveFrameVersion(runRoot, runtimeStatus),
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

export async function createSimplerFrameStream(
  runId: string,
  deps?: FrameStreamDeps,
): Promise<ReadableStream<Uint8Array>> {
  validateRunId(runId);
  const resolved = resolveDeps(deps);
  const runRoot = path.join(resolved.runtimeRoot, runId);
  const initialStatus = await readRuntimeStatus(runRoot);
  if (!initialStatus) {
    throw new SimplerLaunchError("SimplerEnv run not found", 404);
  }

  const encoder = new TextEncoder();
  const pollIntervalMs =
    deps?.framePollIntervalMs ?? DEFAULT_FRAME_STREAM_POLL_INTERVAL_MS;
  const sleepImpl = deps?.sleepImpl ?? sleep;
  let cancelled = false;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let lastFrameSignature: string | null = null;
      let lastFrameBuffer: Buffer | null = null;
      let lastActionCount = 0;

      while (!cancelled) {
        const runtimeStatus = await readRuntimeStatus(runRoot);
        if (!runtimeStatus) {
          break;
        }

        const framePath =
          runtimeStatus.latestFramePath ?? path.join(runRoot, "latest-frame.jpg");
        const snapshot = await readFrameSnapshot(framePath);
        const isFinalStatus = FINAL_STATUSES.has(runtimeStatus.status);
        const shouldEmitLiveFrame =
          !!snapshot && runtimeStatus.actionCount > lastActionCount;
        const shouldEmitFinalFrame =
          !!snapshot &&
          isFinalStatus &&
          (snapshot.signature !== lastFrameSignature ||
            !lastFrameBuffer?.equals(snapshot.buffer));

        if (shouldEmitLiveFrame || shouldEmitFinalFrame) {
          lastFrameSignature = snapshot.signature;
          lastFrameBuffer = snapshot.buffer;
          lastActionCount = Math.max(lastActionCount, runtimeStatus.actionCount);
          controller.enqueue(
            buildMjpegPart(snapshot.buffer, encoder, {
              step: runtimeStatus.step,
              actionCount: runtimeStatus.actionCount,
            }),
          );
        }

        if (isFinalStatus) {
          break;
        }

        await sleepImpl(pollIntervalMs);
      }

      controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
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
    readModelServerStatusImpl:
      deps?.readModelServerStatusImpl ?? getSimplerModelServerStatus,
    isProcessRunningImpl: deps?.isProcessRunningImpl ?? isProcessRunning,
    killProcessImpl: deps?.killProcessImpl ?? killProcess,
    readProcessGroupIdImpl: deps?.readProcessGroupIdImpl ?? readProcessGroupId,
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
    processActive: false,
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

async function resolveTrackedActiveRun(
  deps: LaunchDeps,
  requestedRunId?: string,
): Promise<ActiveRunRecord | null> {
  const activeRun = await readActiveRun(deps.runtimeRoot);
  if (activeRun?.pid && deps.isProcessRunningImpl(activeRun.pid)) {
    return activeRun;
  }

  const candidateRunIds = Array.from(
    new Set([requestedRunId, await readLatestRunId(deps.runtimeRoot)].filter(Boolean)),
  ) as string[];
  for (const runId of candidateRunIds) {
    const recovered = await recoverActiveRunFromRunId(runId, deps);
    if (recovered) {
      return recovered;
    }
  }

  return null;
}

async function recoverActiveRunFromRunId(runId: string, deps: LaunchDeps) {
  const runtimeStatus = await readRuntimeStatus(path.join(deps.runtimeRoot, runId));
  if (!runtimeStatus?.pid || !deps.isProcessRunningImpl(runtimeStatus.pid)) {
    return null;
  }

  const recovered = {
    runId,
    pid: runtimeStatus.pid,
  };
  await writeJsonAtomic(path.join(deps.runtimeRoot, ACTIVE_RUN_FILE), recovered);
  return recovered;
}

async function reconcileRun(runId: string, deps: LaunchDeps) {
  const runRoot = path.join(deps.runtimeRoot, runId);
  const runtimeStatus = await readRuntimeStatus(runRoot);
  if (!runtimeStatus) return;

  const stopRequested = await fileExists(path.join(runRoot, STOP_REQUEST_FILE));
  const processRunning =
    !!runtimeStatus.pid && deps.isProcessRunningImpl(runtimeStatus.pid);

  if (stopRequested && !processRunning) {
    if (runtimeStatus.status !== "stopped" || runtimeStatus.errorMessage !== null) {
      await updateRuntimeStatus(runRoot, {
        status: "stopped",
        updatedAt: deps.now().toISOString(),
        errorMessage: null,
      });
    }
    const activeRun = await readActiveRun(deps.runtimeRoot);
    if (activeRun?.runId === runId) {
      await removeFile(path.join(deps.runtimeRoot, ACTIVE_RUN_FILE));
    }
    await removeFile(path.join(runRoot, STOP_REQUEST_FILE));
    return;
  }

  if (processRunning) {
    const activeRun = await readActiveRun(deps.runtimeRoot);
    if (activeRun?.runId !== runId || activeRun.pid !== runtimeStatus.pid) {
      await writeJsonAtomic(path.join(deps.runtimeRoot, ACTIVE_RUN_FILE), {
        runId,
        pid: runtimeStatus.pid,
      });
    }
    return;
  }

  if (FINAL_STATUSES.has(runtimeStatus.status)) {
    const activeRun = await readActiveRun(deps.runtimeRoot);
    if (activeRun?.runId === runId) {
      await removeFile(path.join(deps.runtimeRoot, ACTIVE_RUN_FILE));
    }
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

async function readFrameSnapshot(filePath: string) {
  try {
    const fileStat = await stat(filePath);
    const buffer = await readFile(filePath);
    return {
      buffer,
      signature: `${fileStat.mtimeMs}:${fileStat.size}`,
    };
  } catch {
    return null;
  }
}

async function resolveFrameVersion(
  runRoot: string,
  runtimeStatus: SimplerLaunchRuntimeStatus,
) {
  if (!FINAL_STATUSES.has(runtimeStatus.status)) {
    return runtimeStatus.actionCount;
  }

  const framePath =
    runtimeStatus.latestFramePath ?? path.join(runRoot, "latest-frame.jpg");
  try {
    const fileStat = await stat(framePath);
    return Math.max(runtimeStatus.actionCount, Math.trunc(fileStat.mtimeMs));
  } catch {
    return runtimeStatus.actionCount;
  }
}

function buildMjpegPart(
  buffer: Buffer,
  encoder: TextEncoder,
  metadata: { step: number; actionCount: number },
) {
  const header = encoder.encode(
    `--${FRAME_STREAM_BOUNDARY}\r\n` +
      `Content-Type: image/jpeg\r\n` +
      `${FRAME_STREAM_STEP_HEADER}: ${metadata.step}\r\n` +
      `${FRAME_STREAM_ACTION_COUNT_HEADER}: ${metadata.actionCount}\r\n` +
      `Content-Length: ${buffer.length}\r\n\r\n`,
  );
  const footer = encoder.encode("\r\n");
  const part = new Uint8Array(header.length + buffer.length + footer.length);
  part.set(header, 0);
  part.set(buffer, header.length);
  part.set(footer, header.length + buffer.length);
  return part;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
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

function isProcessRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killProcess(pid: number, signal: NodeJS.Signals | number = "SIGTERM") {
  try {
    process.kill(pid, signal);
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

function isRuntimeProcessActive(pid: number | null, deps: LaunchDeps) {
  return typeof pid === "number" && pid > 0 && deps.isProcessRunningImpl(pid);
}

function collectStopTargetPids(
  activeRun: ActiveRunRecord,
  runtimeStatus: SimplerLaunchRuntimeStatus,
  deps: LaunchDeps,
) {
  const candidates = [runtimeStatus.pid, activeRun.pid].filter(
    (pid): pid is number => typeof pid === "number" && pid > 0,
  );
  return Array.from(new Set(candidates)).filter((pid) =>
    deps.isProcessRunningImpl(pid),
  );
}

function killTrackedProcess(
  pid: number,
  deps: LaunchDeps,
  signal: NodeJS.Signals | number,
) {
  deps.killProcessImpl(pid, signal);
}

async function readProcessGroupId(pid: number) {
  try {
    const statLine = await readFile(`/proc/${pid}/stat`, "utf8");
    const closingParenIndex = statLine.lastIndexOf(")");
    if (closingParenIndex === -1) {
      return null;
    }

    const fields = statLine.slice(closingParenIndex + 2).trim().split(/\s+/);
    const processGroupId = Number(fields[2]);
    return Number.isInteger(processGroupId) && processGroupId > 0
      ? processGroupId
      : null;
  } catch {
    return null;
  }
}
