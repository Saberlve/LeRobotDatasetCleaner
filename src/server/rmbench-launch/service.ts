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

        import { getRmbenchModelServerStatus } from "@/server/evaluation-model-server/service";
        import type { EvaluationModelServerStatus } from "@/types/evaluation-model-server";
        import type {
          RmbenchLaunchActionResponse,
          RmbenchCameraKey,
          RmbenchFramePaths,
          RmbenchLaunchActionPoint,
          RmbenchLaunchLogFiles,
          RmbenchLaunchLogResponse,
          RmbenchLaunchLogSource,
          RmbenchLaunchMeta,
          RmbenchLaunchRuntimeStatus,
          RmbenchLaunchRunStatus,
          RmbenchLaunchStatusResponse,
          RmbenchTaskConfig,
          RmbenchTaskId,
        } from "@/types/rmbench-launch";

        const REPO_ROOT = process.env.NEXTJS_REPO_ROOT || process.cwd();
        const OPENPI_ROOT = process.env.OPENPI_CODE_ROOT || "/VLA/openpi";
        const DEFAULT_RUNTIME_ROOT =
          process.env.RMBENCH_LAUNCH_RUNTIME_ROOT ||
          path.join(OPENPI_ROOT, "third_party/RMBench/runtime/launch");
        const DEFAULT_SCRIPT_PATH =
          process.env.RMBENCH_LAUNCH_SCRIPT_PATH ||
          path.join(REPO_ROOT, "scripts/run_rmbench_launch.sh");
        const FIXED_CHECKPOINT_PATH =
          "/root/autodl-tmp/checkpoints/pi05_rmbench_memory_lora_pytorch/rmbench_mem_lora_h800/30000";
        const FIXED_POLICY_NAME = "pi05_mem";
        const FIXED_POLICY_CONFIG_NAME = "pi05_rmbench_memory_lora_pytorch";
        const FIXED_TASK_CONFIG: RmbenchTaskConfig = "demo_clean";
        const FIXED_PI0_STEP = 30;
        const ACTIVE_RUN_FILE = "active-run.json";
        const LATEST_RUN_FILE = "latest-run.json";
        const STOP_REQUEST_FILE = "stop-requested.json";
        const LOG_TAIL_BYTES = Math.max(
          4096,
          Number(process.env.RMBENCH_LAUNCH_LOG_TAIL_BYTES || 65536),
        );
        const DEFAULT_FRAME_STREAM_POLL_INTERVAL_MS = Math.max(
          30,
          Number(process.env.RMBENCH_FRAME_STREAM_POLL_INTERVAL_MS || 40),
        );
        const FINAL_STATUSES = new Set<RmbenchLaunchRunStatus>([
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
        const LOG_SOURCES: RmbenchLaunchLogSource[] = ["server", "client"];
        const CAMERA_KEYS: RmbenchCameraKey[] = [
          "third_view",
          "head_camera",
          "left_camera",
          "right_camera",
        ];
        const CAMERA_FILE_NAMES: Record<RmbenchCameraKey, string> = {
          third_view: "third_view.jpg",
          head_camera: "head_camera.jpg",
          left_camera: "left_camera.jpg",
          right_camera: "right_camera.jpg",
        };

        type ActiveRunRecord = {
          runId: string;
          pid: number;
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
        type GetStatusOptions = {
          includeActions?: boolean;
        };
        type FrameStreamDeps = ServiceDeps & {
          framePollIntervalMs?: number;
          sleepImpl?: (ms: number) => Promise<void>;
        };

        export const FRAME_STREAM_BOUNDARY = "frame";
        export const FRAME_STREAM_CONTENT_TYPE =
          `multipart/x-mixed-replace; boundary=${FRAME_STREAM_BOUNDARY}`;
        const FRAME_STREAM_STEP_HEADER = "X-RMBench-Step";
        const FRAME_STREAM_ACTION_COUNT_HEADER = "X-RMBench-Action-Count";

        export class RmbenchLaunchError extends Error {
          statusCode: number;

          constructor(message: string, statusCode = 500) {
            super(message);
            this.name = "RmbenchLaunchError";
            this.statusCode = statusCode;
          }
        }

        export async function launchRmbenchEvaluation(
          taskId: string,
          deps?: ServiceDeps,
        ): Promise<RmbenchLaunchStatusResponse> {
          if (!isRmbenchTaskId(taskId)) {
            throw new RmbenchLaunchError(`Unsupported RMBench task id: ${taskId}`, 400);
          }

          const resolved = resolveDeps(deps);
          await mkdir(resolved.runtimeRoot, { recursive: true });
          await reconcileActiveRun(resolved);

          const activeRun = await resolveTrackedActiveRun(resolved);
          if (activeRun && resolved.isProcessRunningImpl(activeRun.pid)) {
            throw new RmbenchLaunchError("A RMBench evaluation is already running", 409);
          }

          const runId = createRunId(taskId, resolved.now());
          const runRoot = path.join(resolved.runtimeRoot, runId);
          const logFiles = buildLogFiles(runRoot);
          const framePaths = buildFramePaths(runRoot);
          const modelServerStatus = await resolved.readModelServerStatusImpl();
          if (modelServerStatus.status !== "running") {
            throw new RmbenchLaunchError(
              "RMBench 模型服务未运行，请先启动 RMBench 模型服务。",
              409,
            );
          }

          const serverPort = modelServerStatus.port;
          const timestamp = resolved.now().toISOString();
          const meta: RmbenchLaunchMeta = {
            taskId,
            taskConfig: FIXED_TASK_CONFIG,
            checkpointPath: FIXED_CHECKPOINT_PATH,
            policyName: FIXED_POLICY_NAME,
            policyConfigName: FIXED_POLICY_CONFIG_NAME,
            serverPort,
            pi0Step: FIXED_PI0_STEP,
          };
          const status: RmbenchLaunchRuntimeStatus = {
            runId,
            taskId,
            taskConfig: FIXED_TASK_CONFIG,
            prompt: "",
            status: "starting",
            step: 0,
            startedAt: timestamp,
            updatedAt: timestamp,
            pid: null,
            latestFramePaths: framePaths,
            actionCount: 0,
            logPath: runRoot,
            logFiles,
            errorMessage: null,
          };

          await mkdir(path.join(runRoot, "frames"), { recursive: true });
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
                NEXTJS_REPO_ROOT: REPO_ROOT,
                OPENPI_CODE_ROOT: OPENPI_ROOT,
                RMBENCH_LAUNCH_RUNTIME_DIR: runRoot,
                RMBENCH_LAUNCH_RUN_ID: runId,
                RMBENCH_LAUNCH_TASK_ID: taskId,
                RMBENCH_LAUNCH_TASK_CONFIG: FIXED_TASK_CONFIG,
                RMBENCH_LAUNCH_SERVER_PORT: String(serverPort),
                RMBENCH_LAUNCH_CHECKPOINT_PATH: FIXED_CHECKPOINT_PATH,
                RMBENCH_LAUNCH_POLICY_NAME: FIXED_POLICY_NAME,
                RMBENCH_LAUNCH_POLICY_CONFIG_NAME: FIXED_POLICY_CONFIG_NAME,
                RMBENCH_LAUNCH_PI0_STEP: String(FIXED_PI0_STEP),
                RMBENCH_LAUNCH_LOG_LAUNCHER: logFiles.launcher,
                RMBENCH_LAUNCH_LOG_SERVER: logFiles.server,
                RMBENCH_LAUNCH_LOG_CLIENT: logFiles.client,
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
              errorMessage: "Failed to launch RMBench",
            });
            throw new RmbenchLaunchError("Failed to launch RMBench", 500);
          }

          return getRmbenchEvaluationStatus(resolved, runId);
        }

        export async function stopRmbenchEvaluation(
          requestedRunId?: string,
          deps?: ServiceDeps,
        ): Promise<RmbenchLaunchStatusResponse> {
          const resolved = resolveDeps(deps);
          await reconcileActiveRun(resolved);

          const activeRun = await resolveTrackedActiveRun(resolved, requestedRunId);
          if (!activeRun) {
            const latestRunId = await readLatestRunId(resolved.runtimeRoot);
            if (latestRunId) {
              return getRmbenchEvaluationStatus(resolved, latestRunId);
            }
            throw new RmbenchLaunchError("No active RMBench evaluation", 409);
          }

          if (requestedRunId && requestedRunId !== activeRun.runId) {
            throw new RmbenchLaunchError(
              "Requested runId does not match the active run",
              409,
            );
          }

          const runRoot = path.join(resolved.runtimeRoot, activeRun.runId);
          const current = await readRuntimeStatus(runRoot);
          if (!current) {
            await removeFile(path.join(resolved.runtimeRoot, ACTIVE_RUN_FILE));
            throw new RmbenchLaunchError("No active RMBench evaluation", 409);
          }

          if (!resolved.isProcessRunningImpl(activeRun.pid)) {
            await reconcileRun(activeRun.runId, resolved);
            return getRmbenchEvaluationStatus(resolved, activeRun.runId);
          }

          const stopTargets = collectStopTargetPids(activeRun, current, resolved);
          if (stopTargets.length === 0) {
            await reconcileRun(activeRun.runId, resolved);
            return getRmbenchEvaluationStatus(resolved, activeRun.runId);
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

          return getRmbenchEvaluationStatus(resolved, activeRun.runId);
        }

        export async function getRmbenchEvaluationStatus(
          deps?: ServiceDeps,
          requestedRunId?: string,
          options?: GetStatusOptions,
        ): Promise<RmbenchLaunchStatusResponse> {
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
            taskConfig: runtimeStatus.taskConfig,
            prompt: runtimeStatus.prompt,
            status: runtimeStatus.status,
            processActive,
            step: runtimeStatus.step,
            actionCount: runtimeStatus.actionCount,
            startedAt: runtimeStatus.startedAt,
            updatedAt: runtimeStatus.updatedAt,
            frameUrls: buildFrameUrls(runtimeStatus.runId),
            frameVersions: await resolveFrameVersions(runRoot, runtimeStatus),
            actionSeries: options?.includeActions ? await readActions(runRoot) : [],
            errorMessage: runtimeStatus.errorMessage,
            logPath: runtimeStatus.logPath,
            logFiles: resolveLogFiles(runRoot, runtimeStatus),
          };
        }

        export async function readRmbenchEvaluationActions(
          runId: string,
          deps?: ServiceDeps,
          afterStep = 0,
        ): Promise<RmbenchLaunchActionResponse> {
          validateRunId(runId);
          const resolved = resolveDeps(deps);
          const runRoot = path.join(resolved.runtimeRoot, runId);
          const runtimeStatus = await readRuntimeStatus(runRoot);
          if (!runtimeStatus) {
            throw new RmbenchLaunchError("RMBench run not found", 404);
          }

          const parsedAfterStep = Math.max(0, Math.trunc(afterStep));
          const actionSeries = (await readActions(runRoot)).filter(
            (point) => point.step > parsedAfterStep,
          );
          return {
            runId,
            actionCount: runtimeStatus.actionCount,
            actionSeries,
          };
        }

        export async function resolveRmbenchFramePath(
          runId: string,
          cameraKey: string,
          deps?: ServiceDeps,
        ): Promise<string> {
          validateRunId(runId);
          if (!isRmbenchCameraKey(cameraKey)) {
            throw new RmbenchLaunchError(`Unsupported RMBench camera: ${cameraKey}`, 400);
          }

          const resolved = resolveDeps(deps);
          const runtimeStatus = await readRuntimeStatus(
            path.join(resolved.runtimeRoot, runId),
          );
          if (!runtimeStatus) {
            throw new RmbenchLaunchError("RMBench run not found", 404);
          }

          const framePath =
            runtimeStatus.latestFramePaths[cameraKey] ??
            buildFramePaths(path.join(resolved.runtimeRoot, runId))[cameraKey];
          if (!framePath || !(await fileExists(framePath))) {
            throw new RmbenchLaunchError("RMBench frame not found", 404);
          }
          return framePath;
        }

        export async function createRmbenchFrameStream(
          runId: string,
          cameraKey: string,
          deps?: FrameStreamDeps,
        ): Promise<ReadableStream<Uint8Array>> {
          validateRunId(runId);
          if (!isRmbenchCameraKey(cameraKey)) {
            throw new RmbenchLaunchError(`Unsupported RMBench camera: ${cameraKey}`, 400);
          }

          const resolved = resolveDeps(deps);
          const runRoot = path.join(resolved.runtimeRoot, runId);
          const initialStatus = await readRuntimeStatus(runRoot);
          if (!initialStatus) {
            throw new RmbenchLaunchError("RMBench run not found", 404);
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
                  runtimeStatus.latestFramePaths[cameraKey] ??
                  buildFramePaths(runRoot)[cameraKey];
                if (!framePath) {
                  await sleepImpl(pollIntervalMs);
                  continue;
                }
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

        export async function readRmbenchEvaluationLog(
          runId: string,
          source: string,
          deps?: ServiceDeps,
        ): Promise<RmbenchLaunchLogResponse> {
          validateRunId(runId);
          if (!isRmbenchLogSource(source)) {
            throw new RmbenchLaunchError(`Unsupported RMBench log source: ${source}`, 400);
          }

          const resolved = resolveDeps(deps);
          const runRoot = path.join(resolved.runtimeRoot, runId);
          const runtimeStatus = await readRuntimeStatus(runRoot);
          if (!runtimeStatus) {
            throw new RmbenchLaunchError("RMBench run not found", 404);
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
              deps?.readModelServerStatusImpl ?? getRmbenchModelServerStatus,
            isProcessRunningImpl: deps?.isProcessRunningImpl ?? isProcessRunning,
            killProcessImpl: deps?.killProcessImpl ?? killProcess,
            readProcessGroupIdImpl: deps?.readProcessGroupIdImpl ?? readProcessGroupId,
            killProcessGroupImpl: deps?.killProcessGroupImpl ?? killProcessGroup,
            waitForExitImpl: deps?.waitForExitImpl ?? waitForExit,
          };
        }

        function isRmbenchTaskId(value: string): value is RmbenchTaskId {
          return value === "swap_blocks";
        }

        function isRmbenchCameraKey(value: string): value is RmbenchCameraKey {
          return CAMERA_KEYS.includes(value as RmbenchCameraKey);
        }

        function isRmbenchLogSource(value: string): value is RmbenchLaunchLogSource {
          return LOG_SOURCES.includes(value as RmbenchLaunchLogSource);
        }

        function createRunId(taskId: RmbenchTaskId, now: Date) {
          return `${now.toISOString().replace(/:/g, "-").replace(/\./g, "-")}_${taskId}`;
        }

        function validateRunId(runId: string) {
          if (!/^[A-Za-z0-9._-]+$/.test(runId)) {
            throw new RmbenchLaunchError("Invalid RMBench runId", 400);
          }
        }

        function buildIdleStatus(): RmbenchLaunchStatusResponse {
          return {
            runId: null,
            taskId: null,
            taskConfig: null,
            prompt: "",
            status: "idle",
            processActive: false,
            step: 0,
            actionCount: 0,
            startedAt: null,
            updatedAt: null,
            frameUrls: buildEmptyFrameUrls(),
            frameVersions: buildEmptyFrameVersions(),
            actionSeries: [],
            errorMessage: null,
            logPath: null,
            logFiles: null,
          };
        }

        function buildLogFiles(runRoot: string): RmbenchLaunchLogFiles {
          return {
            launcher: path.join(runRoot, LOG_FILE_NAMES.launcher),
            server: path.join(runRoot, LOG_FILE_NAMES.server),
            client: path.join(runRoot, LOG_FILE_NAMES.client),
          };
        }

        function buildFramePaths(runRoot: string): RmbenchFramePaths {
          const framesRoot = path.join(runRoot, "frames");
          return {
            third_view: path.join(framesRoot, CAMERA_FILE_NAMES.third_view),
            head_camera: path.join(framesRoot, CAMERA_FILE_NAMES.head_camera),
            left_camera: path.join(framesRoot, CAMERA_FILE_NAMES.left_camera),
            right_camera: path.join(framesRoot, CAMERA_FILE_NAMES.right_camera),
          };
        }

        function buildFrameUrls(runId: string) {
          return {
            third_view: buildFrameUrl(runId, "third_view"),
            head_camera: buildFrameUrl(runId, "head_camera"),
            left_camera: buildFrameUrl(runId, "left_camera"),
            right_camera: buildFrameUrl(runId, "right_camera"),
          };
        }

        function buildFrameUrl(runId: string, cameraKey: RmbenchCameraKey) {
          return `/api/evaluation/rmbench/frame?runId=${encodeURIComponent(runId)}&camera=${cameraKey}`;
        }

        function buildEmptyFrameUrls() {
          return {
            third_view: null,
            head_camera: null,
            left_camera: null,
            right_camera: null,
          };
        }

        function buildEmptyFrameVersions() {
          return {
            third_view: 0,
            head_camera: 0,
            left_camera: 0,
            right_camera: 0,
          };
        }

        function resolveLogFiles(
          runRoot: string,
          runtimeStatus?: RmbenchLaunchRuntimeStatus | null,
        ): RmbenchLaunchLogFiles {
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

          const recovered = { runId, pid: runtimeStatus.pid };
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
          return readJsonFile<RmbenchLaunchRuntimeStatus>(path.join(runRoot, "status.json"));
        }

        async function readActions(runRoot: string) {
          const actions =
            (await readJsonFile<RmbenchLaunchActionPoint[]>(
              path.join(runRoot, "actions.json"),
            )) ?? [];
          return Array.isArray(actions) ? actions : [];
        }

        async function updateRuntimeStatus(
          runRoot: string,
          patch: Partial<RmbenchLaunchRuntimeStatus>,
        ) {
          const current = await readRuntimeStatus(runRoot);
          if (!current) return;
          await writeJsonAtomic(path.join(runRoot, "status.json"), {
            ...current,
            ...patch,
          });
        }

        async function resolveFrameVersions(
          runRoot: string,
          runtimeStatus: RmbenchLaunchRuntimeStatus,
        ) {
          const frameVersions = buildEmptyFrameVersions();
          if (!FINAL_STATUSES.has(runtimeStatus.status)) {
            for (const cameraKey of CAMERA_KEYS) {
              frameVersions[cameraKey] = runtimeStatus.actionCount;
            }
            return frameVersions;
          }

          for (const cameraKey of CAMERA_KEYS) {
            const framePath =
              runtimeStatus.latestFramePaths[cameraKey] ?? buildFramePaths(runRoot)[cameraKey];
            if (!framePath) {
              frameVersions[cameraKey] = runtimeStatus.actionCount;
              continue;
            }
            try {
              const fileStat = await stat(framePath);
              frameVersions[cameraKey] = Math.max(
                runtimeStatus.actionCount,
                Math.trunc(fileStat.mtimeMs),
              );
            } catch {
              frameVersions[cameraKey] = runtimeStatus.actionCount;
            }
          }
          return frameVersions;
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
          await writeFile(tempPath, `${JSON.stringify(value, null, 2)}
`, "utf8");
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
          const chunk = new Uint8Array(header.length + buffer.length + footer.length);
          chunk.set(header, 0);
          chunk.set(buffer, header.length);
          chunk.set(footer, header.length + buffer.length);
          return chunk;
        }

        function isRuntimeProcessActive(pid: number | null, deps: LaunchDeps) {
          return !!pid && deps.isProcessRunningImpl(pid);
        }

        function collectStopTargetPids(
          activeRun: ActiveRunRecord,
          runtimeStatus: RmbenchLaunchRuntimeStatus,
          deps: LaunchDeps,
        ) {
          const candidates = Array.from(
            new Set([activeRun.pid, runtimeStatus.pid].filter((pid): pid is number => !!pid)),
          );
          return candidates.filter((pid) => deps.isProcessRunningImpl(pid));
        }

        function killTrackedProcess(
          pid: number,
          deps: LaunchDeps,
          signal?: NodeJS.Signals | number,
        ) {
          void deps
            .readProcessGroupIdImpl(pid)
            .then((pgid) => {
              if (pgid !== null) {
                deps.killProcessGroupImpl(pgid, signal);
                return;
              }
              deps.killProcessImpl(pid, signal);
            })
            .catch(() => {
              deps.killProcessImpl(pid, signal);
            });
        }

        async function waitForSpawn(
          child: ReturnType<typeof spawn>,
        ): Promise<number> {
          return new Promise<number>((resolve, reject) => {
            child.once("error", reject);
            child.once("spawn", () => {
              resolve(child.pid ?? 0);
            });
          });
        }

        async function readLogTail(filePath: string, maxBytes: number) {
          try {
            const handle = await openFile(filePath, "r");
            try {
              const fileStat = await handle.stat();
              const start = Math.max(0, fileStat.size - maxBytes);
              const length = fileStat.size - start;
              const buffer = Buffer.alloc(length);
              if (length > 0) {
                await handle.read(buffer, 0, length, start);
              }
              return {
                content: buffer.toString("utf8"),
                truncated: start > 0,
                updatedAt: fileStat.mtime.toISOString(),
              };
            } finally {
              await handle.close();
            }
          } catch {
            return {
              content: "",
              truncated: false,
              updatedAt: null,
            };
          }
        }

        async function fileExists(filePath: string) {
          try {
            await access(filePath);
            return true;
          } catch {
            return false;
          }
        }

        function isProcessRunning(pid: number) {
          try {
            process.kill(pid, 0);
            return true;
          } catch {
            return false;
          }
        }

        function killProcess(pid: number, signal?: NodeJS.Signals | number) {
          process.kill(pid, signal);
        }

        async function readProcessGroupId(pid: number) {
          try {
            const status = await readFile(`/proc/${pid}/stat`, "utf8");
            const parts = status.trim().split(" ");
            const pgid = Number(parts[4]);
            return Number.isFinite(pgid) ? pgid : null;
          } catch {
            return null;
          }
        }

        function killProcessGroup(pgid: number, signal?: NodeJS.Signals | number) {
          process.kill(-pgid, signal);
        }

        async function waitForExit(pid: number, timeoutMs: number) {
          const startedAt = Date.now();
          while (Date.now() - startedAt < timeoutMs) {
            if (!isProcessRunning(pid)) {
              return true;
            }
            await sleep(50);
          }
          return !isProcessRunning(pid);
        }

        function sleep(ms: number) {
          return new Promise<void>((resolve) => {
            setTimeout(resolve, ms);
          });
        }
