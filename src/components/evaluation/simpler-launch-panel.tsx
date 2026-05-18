"use client";

import React, { useDeferredValue, useEffect, useRef, useState } from "react";
import {
  ModelServerCard,
  type ModelServerRequestState,
} from "@/components/evaluation/model-server-card";
import { RmbenchLaunchWorkspace } from "@/components/evaluation/rmbench-launch-workspace";
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type {
  EvaluationBenchmark,
  EvaluationModelServerLogResponse,
  EvaluationModelServerStatus,
} from "@/types/evaluation-model-server";
import type {
  SimplerLaunchLogResponse,
  SimplerLaunchLogSource,
  SimplerLaunchStatusResponse,
  SimplerTaskId,
} from "@/types/simpler-launch";

const taskOptions: Array<{ value: SimplerTaskId; label: string }> = [
  { value: "bridge_carrot", label: "bridge_carrot" },
  { value: "bridge_stack", label: "bridge_stack" },
  { value: "bridge_spoon", label: "bridge_spoon" },
  { value: "eggplant", label: "eggplant" },
];

const panelClass =
  "w-full min-w-0 rounded-2xl border border-[oklch(0.86_0.022_72)] bg-[oklch(0.99_0.012_76)] p-5 shadow-[0_1px_0_oklch(0.91_0.018_72),0_18px_42px_-30px_rgba(42,33,28,0.18)] md:p-6";
const fieldClass =
  "w-full rounded-xl border border-[oklch(0.84_0.025_72)] bg-[oklch(0.99_0.01_76)] px-3 py-2 text-sm font-medium text-[oklch(0.25_0.025_62)] outline-none transition focus:border-[oklch(0.56_0.11_42)]";
const primaryButtonClass =
  "inline-flex h-11 items-center justify-center rounded-xl bg-[oklch(0.25_0.025_62)] px-4 text-sm font-semibold text-[oklch(0.98_0.012_76)] transition hover:bg-[oklch(0.31_0.03_62)] disabled:cursor-not-allowed disabled:bg-[oklch(0.61_0.025_65)]";
const secondaryButtonClass =
  "inline-flex h-11 items-center justify-center rounded-xl border border-[oklch(0.78_0.045_58)] bg-[oklch(0.985_0.012_76)] px-4 text-sm font-semibold text-[oklch(0.28_0.04_52)] transition hover:border-[oklch(0.56_0.11_42)] disabled:cursor-not-allowed disabled:opacity-60";
const lineColors = {
  x: "#7f5539",
  y: "#4f772d",
  z: "#386641",
  roll: "#1d3557",
  pitch: "#457b9d",
  yaw: "#b56576",
  gripper: "#e76f51",
};
const pollingStatuses = new Set(["starting", "running", "stopping"]);
const terminalRefreshStatuses = new Set(["succeeded", "failed", "stopped"]);
const TASK_POLL_INTERVAL_MS = 90;
const TASK_LOG_POLL_INTERVAL_MS = 1200;
const SERVER_POLL_INTERVAL_MS = 1000;
const TERMINAL_FRAME_REFRESH_INTERVAL_MS = 150;
const TERMINAL_FRAME_REFRESH_ATTEMPTS = 8;
const FRAME_FADE_DURATION_MS = 140;
const ACTIVE_ACTION_WINDOW_SIZE = 72;
const logSources: SimplerLaunchLogSource[] = ["server", "client"];
const serverBenchmarks: EvaluationBenchmark[] = ["simpler", "rmbench"];
const multipartHeaderSeparator = new Uint8Array([13, 10, 13, 10]);
const multipartBoundaryLineBreak = new Uint8Array([13, 10]);
const multipartHeaderDecoder = new TextDecoder();

type ServerKey = (typeof serverBenchmarks)[number];
type LiveLogPanelState = {
  content: string;
  path: string | null;
  updatedAt: string | null;
  truncated: boolean;
  errorMessage: string | null;
};

type LiveLogState = Record<SimplerLaunchLogSource, LiveLogPanelState>;
type ServerStatusState = Record<ServerKey, EvaluationModelServerStatus>;
type ServerRequestState = Record<ServerKey, ModelServerRequestState>;
type ServerLogState = Record<ServerKey, LiveLogPanelState>;

export function SimplerLaunchPanel({
  showRmbenchLiveWorkspace = true,
}: {
  showRmbenchLiveWorkspace?: boolean;
} = {}) {
  const [selectedTask, setSelectedTask] = useState<SimplerTaskId>("bridge_carrot");
  const [status, setStatus] = useState<SimplerLaunchStatusResponse>(idleStatus());
  const [visualStatus, setVisualStatus] = useState<SimplerLaunchStatusResponse>(idleStatus());
  const [visualSyncPending, setVisualSyncPending] = useState(false);
  const [taskRequestState, setTaskRequestState] = useState<
    "idle" | "launching" | "stopping"
  >("idle");
  const [panelError, setPanelError] = useState<string | null>(null);
  const [liveLogs, setLiveLogs] = useState<LiveLogState>(createEmptyLogState());
  const [serverStatuses, setServerStatuses] = useState<ServerStatusState>({
    simpler: idleServerStatus("simpler"),
    rmbench: idleServerStatus("rmbench"),
  });
  const [serverRequestState, setServerRequestState] = useState<ServerRequestState>({
    simpler: "idle",
    rmbench: "idle",
  });
  const [serverLogs, setServerLogs] = useState<ServerLogState>({
    simpler: createEmptyLogPanelState(null),
    rmbench: createEmptyLogPanelState(null),
  });
  const [visibleActionCount, setVisibleActionCount] = useState<number | null>(null);
  const mountedRef = useRef(true);
  const pendingVisualSyncRunIdRef = useRef<string | null>(null);
  const streamingRunIdRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    void refreshAll();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!shouldPollTask(status)) {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshTaskStatus();
    }, TASK_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [status.status]);

  useEffect(() => {
    if (!shouldRefreshTerminalFrame(status)) {
      return;
    }

    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      void refreshTaskStatus();
      if (attempts >= TERMINAL_FRAME_REFRESH_ATTEMPTS) {
        window.clearInterval(timer);
      }
    }, TERMINAL_FRAME_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [status.runId, status.status, status.updatedAt, status.frameVersion]);

  useEffect(() => {
    if (!shouldPollServers(serverStatuses)) {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshServerState("simpler");
    }, SERVER_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [serverStatuses]);

  useEffect(() => {
    void refreshPersistentServerLog("simpler");
  }, []);

  useEffect(() => {
    if (!status.runId || !status.logFiles) {
      return;
    }

    void refreshLogs(status);
  }, [status.runId]);

  useEffect(() => {
    if (shouldPollTaskLogs(status)) {
      const timer = window.setInterval(() => {
        void refreshLogs(status);
      }, TASK_LOG_POLL_INTERVAL_MS);
      return () => window.clearInterval(timer);
    }
  }, [status.logFiles, status.processActive, status.runId, status.status]);

  useEffect(() => {
    if (!status.runId) {
      pendingVisualSyncRunIdRef.current = null;
      setVisualSyncPending(false);
      setVisualStatus(status);
      return;
    }

    const awaitingInitialPayload =
      status.runId === pendingVisualSyncRunIdRef.current &&
      shouldGateVisualSync(status) &&
      !hasVisualSyncPayload(status);
    if (awaitingInitialPayload) {
      setVisualSyncPending(true);
      setVisualStatus(createVisualPendingStatus(status));
      return;
    }

    if (status.runId === pendingVisualSyncRunIdRef.current) {
      pendingVisualSyncRunIdRef.current = null;
    }

    setVisualSyncPending(false);
    setVisualStatus(status);
  }, [status]);

  useEffect(() => {
    if (!visualStatus.runId || !shouldStreamFrame(visualStatus)) {
      streamingRunIdRef.current = null;
      setVisibleActionCount(null);
      return;
    }

    if (streamingRunIdRef.current !== visualStatus.runId) {
      streamingRunIdRef.current = visualStatus.runId;
      setVisibleActionCount(null);
    }
  }, [visualStatus.processActive, visualStatus.runId, visualStatus.status]);

  const isTaskBusy = taskRequestState !== "idle";
  const hasActiveTaskProcess = status.processActive;
  const isTaskRunning = hasActiveTaskProcess || pollingStatuses.has(status.status);
  const isStreamingFrame = shouldStreamFrame(visualStatus);
  const isAwaitingStreamActionSync =
    isStreamingFrame && visualStatus.actionSeries.length > 0 && visibleActionCount === null;
  const frameImageSrc = resolveFrameImageSrc(visualStatus);
  const visibleActionSeries = resolveVisibleActionSeries(
    visualStatus,
    visibleActionCount,
    isStreamingFrame,
  );
  const deferredActionSeries = useDeferredValue(visibleActionSeries);
  const plottedActionSeries = shouldWindowActionSeries(visualStatus)
    ? deferredActionSeries.slice(-ACTIVE_ACTION_WINDOW_SIZE)
    : deferredActionSeries;
  const actionDimensions = getActionDimensionKeys(plottedActionSeries);
  async function refreshAll() {
    await Promise.all([refreshTaskStatus(), refreshServerStatuses()]);
  }

  async function refreshServerState(benchmark: ServerKey) {
    const nextServerStatuses = await refreshServerStatuses();
    await refreshPersistentServerLog(benchmark, nextServerStatuses?.[benchmark]);
  }

  async function refreshTaskStatus() {
    try {
      const nextStatus = await fetchJson<SimplerLaunchStatusResponse>(
        "/api/evaluation/simpler/status",
      );
      if (!mountedRef.current) return;
      setPanelError(null);
      setStatus(nextStatus);
      if (!nextStatus.processActive && !pollingStatuses.has(nextStatus.status)) {
        setTaskRequestState("idle");
      }
    } catch (error) {
      if (!mountedRef.current) return;
      setPanelError(error instanceof Error ? error.message : "获取状态失败");
    }
  }

  function handleVisibleActionCountChange(nextActionCount: number | null) {
    if (!mountedRef.current) {
      return;
    }

    setVisibleActionCount((current) =>
      current === nextActionCount ? current : nextActionCount,
    );
    if (
      typeof nextActionCount === "number" &&
      nextActionCount > status.actionSeries.length
    ) {
      void refreshTaskStatus();
    }
  }

  async function refreshServerStatuses() {
    try {
      const [simpler, rmbench] = await Promise.all([
        fetchJson<EvaluationModelServerStatus>(
          "/api/evaluation/simpler/server/status",
        ),
        fetchJson<EvaluationModelServerStatus>(
          "/api/evaluation/rmbench/server/status",
        ),
      ]);
      if (!mountedRef.current) return;
      const nextStatuses = { simpler, rmbench };
      setServerStatuses(nextStatuses);
      setServerRequestState((current) => ({
        simpler: pollingStatuses.has(simpler.status) ? current.simpler : "idle",
        rmbench: pollingStatuses.has(rmbench.status) ? current.rmbench : "idle",
      }));
      return nextStatuses;
    } catch (error) {
      if (!mountedRef.current) return;
      setPanelError(error instanceof Error ? error.message : "获取模型服务状态失败");
    }
  }

  async function refreshLogs(nextStatus: SimplerLaunchStatusResponse) {
    if (!nextStatus.runId || !nextStatus.logFiles) {
      if (!mountedRef.current) return;
      setLiveLogs(createEmptyLogState());
      return;
    }

    const entries = await Promise.all(
      logSources.map(async (source) => {
        try {
          const log = await fetchJson<SimplerLaunchLogResponse>(
            `/api/evaluation/simpler/logs?runId=${nextStatus.runId}&source=${source}`,
          );
          return [source, toLiveLogPanelState(log)] as const;
        } catch (error) {
          return [
            source,
            {
              ...createEmptyLogPanelState(nextStatus.logFiles?.[source] ?? null),
              errorMessage: error instanceof Error ? error.message : `读取${source}日志失败`,
            },
          ] as const;
        }
      }),
    );

    if (!mountedRef.current) return;
    setLiveLogs(Object.fromEntries(entries) as LiveLogState);
  }

  async function refreshPersistentServerLog(
    benchmark: ServerKey,
    statusOverride?: EvaluationModelServerStatus,
  ) {
    const serverStatus = statusOverride ?? serverStatuses[benchmark];
    try {
      const log = await fetchJson<EvaluationModelServerLogResponse>(
        `/api/evaluation/${benchmark}/server/logs?source=server`,
      );
      if (!mountedRef.current) return;
      setServerLogs((current) => ({
        ...current,
        [benchmark]: toLiveLogPanelState(log),
      }));
    } catch (error) {
      if (!mountedRef.current) return;
      setServerLogs((current) => ({
        ...current,
        [benchmark]: {
          ...createEmptyLogPanelState(serverStatus.logFiles.server),
          errorMessage:
            error instanceof Error ? error.message : `读取${benchmark}模型日志失败`,
        },
      }));
    }
  }

  async function handleLaunch() {
    setTaskRequestState("launching");
    setPanelError(null);
    try {
      const nextStatus = await fetchJson<SimplerLaunchStatusResponse>(
        "/api/evaluation/simpler/launch",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ taskId: selectedTask }),
        },
      );
      if (!mountedRef.current) return;
      pendingVisualSyncRunIdRef.current = nextStatus.runId;
      setStatus(nextStatus);
      setTaskRequestState("idle");
      await refreshLogs(nextStatus);
    } catch (error) {
      if (!mountedRef.current) return;
      setTaskRequestState("idle");
      setPanelError(error instanceof Error ? error.message : "启动评测失败");
    }
  }

  async function handleStop() {
    setTaskRequestState("stopping");
    setPanelError(null);
    try {
      const nextStatus = await fetchJson<SimplerLaunchStatusResponse>(
        "/api/evaluation/simpler/stop",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ runId: status.runId }),
        },
      );
      if (!mountedRef.current) return;
      setStatus(nextStatus);
      setTaskRequestState("idle");
      await refreshLogs(nextStatus);
    } catch (error) {
      if (!mountedRef.current) return;
      setTaskRequestState("idle");
      setPanelError(error instanceof Error ? error.message : "停止评测失败");
    }
  }

  async function handleServerStart(benchmark: ServerKey) {
    setServerRequestState((current) => ({ ...current, [benchmark]: "starting" }));
    setPanelError(null);
    const startingStatus: EvaluationModelServerStatus = {
      ...serverStatuses[benchmark],
      status: "starting",
      errorMessage: null,
    };
    setServerStatuses((current) => ({
      ...current,
      [benchmark]: startingStatus,
    }));
    setServerLogs((current) => ({
      ...current,
      [benchmark]: createEmptyLogPanelState(serverStatuses[benchmark].logFiles.server),
    }));
    void refreshPersistentServerLog(benchmark, startingStatus);
    try {
      const nextStatus = await fetchJson<EvaluationModelServerStatus>(
        `/api/evaluation/${benchmark}/server/start`,
        {
          method: "POST",
        },
      );
      if (!mountedRef.current) return;
      setServerStatuses((current) => ({ ...current, [benchmark]: nextStatus }));
      setServerRequestState((current) => ({ ...current, [benchmark]: "idle" }));
      await refreshPersistentServerLog(benchmark, nextStatus);
    } catch (error) {
      if (!mountedRef.current) return;
      setServerRequestState((current) => ({ ...current, [benchmark]: "idle" }));
      setPanelError(error instanceof Error ? error.message : `启动${benchmark}模型服务失败`);
    }
  }

  async function handleServerStop(benchmark: ServerKey) {
    setServerRequestState((current) => ({ ...current, [benchmark]: "stopping" }));
    setPanelError(null);
    const stoppingStatus: EvaluationModelServerStatus = {
      ...serverStatuses[benchmark],
      status: "stopping",
      errorMessage: null,
    };
    setServerStatuses((current) => ({
      ...current,
      [benchmark]: stoppingStatus,
    }));
    try {
      const nextStatus = await fetchJson<EvaluationModelServerStatus>(
        `/api/evaluation/${benchmark}/server/stop`,
        {
          method: "POST",
        },
      );
      if (!mountedRef.current) return;
      setServerStatuses((current) => ({ ...current, [benchmark]: nextStatus }));
      setServerRequestState((current) => ({ ...current, [benchmark]: "idle" }));
      await refreshPersistentServerLog(benchmark, nextStatus);
    } catch (error) {
      if (!mountedRef.current) return;
      setServerRequestState((current) => ({ ...current, [benchmark]: "idle" }));
      setPanelError(error instanceof Error ? error.message : `停止${benchmark}模型服务失败`);
    }
  }

  return (
    <div
      data-launch-layout="three-row"
      className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-6 py-6 md:py-8"
      style={{ scrollbarGutter: "stable both-edges" }}
    >
      <section data-launch-row="controls" className={panelClass}>
        <div>
          <div className="flex flex-col gap-3">
            <div>
              <h2 className="text-xl font-semibold text-[oklch(0.25_0.025_62)]">
                Simpler 模型服务
              </h2>
            </div>
          </div>
          <div className="mt-4">
            <ModelServerCard
              benchmark="simpler"
              status={serverStatuses.simpler}
              requestState={serverRequestState.simpler}
              onStart={() => void handleServerStart("simpler")}
              onStop={() => void handleServerStop("simpler")}
            />
          </div>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,240px)_auto_minmax(0,180px)_minmax(0,1fr)] xl:items-end">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-[oklch(0.25_0.025_62)]">
              任务选择
            </span>
            <select
              aria-label="任务选择"
              value={selectedTask}
              onChange={(event) => setSelectedTask(event.target.value as SimplerTaskId)}
              disabled={isTaskRunning || isTaskBusy}
              className={fieldClass}
            >
              {taskOptions.map((task) => (
                <option key={task.value} value={task.value}>
                  {task.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap gap-3 xl:justify-start">
            <button
              type="button"
              onClick={() => void handleLaunch()}
              disabled={isTaskRunning || isTaskBusy}
              className={primaryButtonClass}
            >
              启动评测
            </button>

            <button
              type="button"
              onClick={() => void handleStop()}
              disabled={!hasActiveTaskProcess || isTaskBusy}
              className={secondaryButtonClass}
            >
              停止评测
            </button>
          </div>

          <InfoCard label="运行状态" value={status.status} />
          <InfoCard label="当前提示词" value={status.prompt || "-"} />
        </div>

        {panelError ? (
          <p className="mt-4 rounded-xl border border-[oklch(0.76_0.08_35)] bg-[oklch(0.97_0.03_35)] px-4 py-3 text-sm text-[oklch(0.38_0.12_28)]">
            {panelError}
          </p>
        ) : null}
      </section>

      <div className="grid w-full min-w-0 gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:items-start">
        <section data-launch-row="frame" className={panelClass}>
          <h2 className="text-xl font-semibold text-[oklch(0.25_0.025_62)]">
            最新渲染图
          </h2>
          <div className="mt-4 flex min-h-[18rem] items-center justify-center overflow-hidden rounded-xl border border-[oklch(0.84_0.025_72)] bg-[oklch(0.95_0.02_72)] p-2">
            {frameImageSrc ? (
              isStreamingFrame ? (
                <StreamingFrameImage
                  src={frameImageSrc}
                  alt={`${visualStatus.taskId || "simpler"} latest frame`}
                  onVisibleActionCountChange={handleVisibleActionCountChange}
                />
              ) : (
                <BufferedFrameImage
                  src={frameImageSrc}
                  alt={`${visualStatus.taskId || "simpler"} latest frame`}
                />
              )
            ) : visualSyncPending ? (
              <div className="flex items-center justify-center px-6 py-10 text-sm text-[oklch(0.43_0.025_68)]">
                新任务缓冲中，等待画面与动作同步
              </div>
            ) : (
              <div className="flex items-center justify-center px-6 py-10 text-sm text-[oklch(0.43_0.025_68)]">
                最新帧尚未生成
              </div>
            )}
          </div>
        </section>

        <section data-launch-row="actions" className={panelClass}>
          <h2 className="text-xl font-semibold text-[oklch(0.25_0.025_62)]">
            模型原始动作维度
          </h2>
          <div
            data-action-chart="simpler-actions"
            className="mt-4 rounded-xl border border-[oklch(0.84_0.025_72)] bg-[oklch(0.99_0.01_76)] p-2"
          >
            {actionDimensions.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {actionDimensions.map((dimension) => (
                  <article
                    key={dimension}
                    data-action-dimension-chart
                    className="overflow-hidden rounded-xl border border-[oklch(0.84_0.025_72)] bg-[oklch(1_0_0)]"
                  >
                    <div className="border-b border-[oklch(0.84_0.025_72)] bg-[oklch(0.965_0.012_74)] px-3 py-2">
                      <h3 className="text-xs font-semibold text-[oklch(0.25_0.025_62)]">
                        {dimension}
                      </h3>
                    </div>
                    <div className="overflow-x-auto p-1.5">
                      <LineChart
                        width={260}
                        height={170}
                        data={plottedActionSeries}
                        margin={{ top: 12, right: 12, bottom: 4, left: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#d9d3ca" />
                        <XAxis dataKey="step" stroke="#6d6257" />
                        <YAxis stroke="#6d6257" />
                        <Tooltip />
                        <Line
                          type="monotone"
                          dataKey={dimension}
                          stroke={getActionLineColor(dimension)}
                          dot={false}
                        />
                      </LineChart>
                    </div>
                  </article>
                ))}
              </div>
            ) : visualSyncPending || isAwaitingStreamActionSync ? (
              <div className="flex min-h-60 items-center justify-center px-6 py-10 text-sm text-[oklch(0.43_0.025_68)]">
                新任务缓冲中，等待首批动作与画面同步
              </div>
            ) : (
              <div className="flex min-h-60 items-center justify-center px-6 py-10 text-sm text-[oklch(0.43_0.025_68)]">
                动作序列尚未生成
              </div>
            )}
          </div>
        </section>
      </div>

      {showRmbenchLiveWorkspace ? (
        <RmbenchLaunchWorkspace
          serverStatus={serverStatuses.rmbench}
          serverRequestState={serverRequestState.rmbench}
          onStartServer={() => void handleServerStart("rmbench")}
          onStopServer={() => void handleServerStop("rmbench")}
        />
      ) : null}
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="w-full min-w-0 rounded-xl border border-[oklch(0.86_0.023_72)] bg-[oklch(0.965_0.018_75)] px-4 py-3">
      <p className="text-xs font-medium text-[oklch(0.49_0.025_66)]">
        {label}
      </p>
      <p className="mt-1.5 break-all text-sm font-semibold text-[oklch(0.25_0.025_62)]">
        {value}
      </p>
    </div>
  );
}

function StreamingFrameImage({
  src,
  alt,
  onVisibleActionCountChange,
}: {
  src: string;
  alt: string;
  onVisibleActionCountChange: (nextActionCount: number | null) => void;
}) {
  const onVisibleActionCountChangeRef = useRef(onVisibleActionCountChange);

  useEffect(() => {
    onVisibleActionCountChangeRef.current = onVisibleActionCountChange;
  }, [onVisibleActionCountChange]);

  useEffect(() => {
    const abortController = new AbortController();
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(src, {
          cache: "no-store",
          signal: abortController.signal,
        });
        if (!response.ok || !response.body) {
          return;
        }

        const boundary = resolveMultipartBoundary(response.headers.get("content-type"));
        if (!boundary) {
          return;
        }

        const reader = response.body.getReader();
        let buffered: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
        while (!cancelled) {
          const chunk = await reader.read();
          if (chunk.done) {
            break;
          }
          if (!chunk.value) {
            continue;
          }

          buffered = concatUint8Arrays(buffered, Uint8Array.from(chunk.value));
          const parsed = extractMultipartActionCounts(buffered, boundary);
          buffered = parsed.remainder;
          for (const actionCount of parsed.actionCounts) {
            onVisibleActionCountChangeRef.current(actionCount);
          }
        }
      } catch (error) {
        if (!isAbortError(error)) {
          onVisibleActionCountChangeRef.current(null);
        }
      }
    })();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [src]);

  return (
    <div className="relative h-full min-h-[18rem] w-full">
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
      />
    </div>
  );
}

function BufferedFrameImage({ src, alt }: { src: string; alt: string }) {
  const [currentSrc, setCurrentSrc] = useState<string | null>(null);
  const [incomingSrc, setIncomingSrc] = useState<string | null>(null);
  const [incomingVisible, setIncomingVisible] = useState(false);
  const transitionTimerRef = useRef<number | null>(null);
  const loadTokenRef = useRef(0);

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current !== null) {
        window.clearTimeout(transitionTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!src) {
      setCurrentSrc(null);
      setIncomingSrc(null);
      setIncomingVisible(false);
      return;
    }

    if (src === currentSrc || src === incomingSrc) {
      return;
    }

    const loadToken = loadTokenRef.current + 1;
    loadTokenRef.current = loadToken;
    const image = new window.Image();
    image.decoding = "async";
    let settled = false;
    const commitLoadedFrame = () => {
      if (settled || loadTokenRef.current !== loadToken) {
        return;
      }
      settled = true;
      window.clearTimeout(fallbackTimer);

      if (loadTokenRef.current !== loadToken) {
        return;
      }

      if (!currentSrc) {
        setCurrentSrc(src);
        return;
      }

      if (transitionTimerRef.current !== null) {
        window.clearTimeout(transitionTimerRef.current);
      }

      setIncomingSrc(src);
      setIncomingVisible(false);
      window.setTimeout(() => {
        if (loadTokenRef.current !== loadToken) {
          return;
        }
        setIncomingVisible(true);
      }, 0);
      transitionTimerRef.current = window.setTimeout(() => {
        setCurrentSrc(src);
        setIncomingSrc(null);
        setIncomingVisible(false);
        transitionTimerRef.current = null;
      }, FRAME_FADE_DURATION_MS);
    };
    image.onload = commitLoadedFrame;
    image.onerror = commitLoadedFrame;
    const fallbackTimer = window.setTimeout(commitLoadedFrame, 32);
    image.src = src;
  }, [currentSrc, incomingSrc, src]);

  const sharedClass =
    "pointer-events-none absolute inset-0 h-full w-full select-none object-contain";

  return (
    <div className="relative h-full min-h-[18rem] w-full">
      {currentSrc ? (
        <img
          src={currentSrc}
          alt={alt}
          draggable={false}
          decoding="async"
          className={`${sharedClass} ${incomingSrc ? "opacity-0" : "opacity-100"}`}
          style={{
            transition: `opacity ${FRAME_FADE_DURATION_MS}ms ease-out`,
          }}
        />
      ) : null}
      {incomingSrc ? (
        <img
          src={incomingSrc}
          alt=""
          aria-hidden="true"
          draggable={false}
          decoding="async"
          className={`${sharedClass} ${incomingVisible ? "opacity-100" : "opacity-0"}`}
          style={{
            transition: `opacity ${FRAME_FADE_DURATION_MS}ms ease-out`,
          }}
        />
      ) : null}
    </div>
  );
}

function resolveVisibleActionSeries(
  status: SimplerLaunchStatusResponse,
  visibleActionCount: number | null,
  isStreamingFrame: boolean,
) {
  if (!isStreamingFrame) {
    return status.actionSeries;
  }

  if (visibleActionCount === null) {
    return [];
  }

  return status.actionSeries.slice(0, Math.max(0, visibleActionCount));
}

function resolveMultipartBoundary(contentType: string | null) {
  const match = /boundary=([^;]+)/i.exec(contentType ?? "");
  return match?.[1]?.trim().replace(/^"|"$/g, "") ?? null;
}

function extractMultipartActionCounts(buffer: Uint8Array, boundary: string) {
  const boundaryBytes = new TextEncoder().encode(`--${boundary}`);
  const actionCounts: number[] = [];
  let remainder = buffer;

  while (remainder.length > 0) {
    const boundaryIndex = findByteSequence(remainder, boundaryBytes);
    if (boundaryIndex === -1) {
      return {
        actionCounts,
        remainder: remainder.slice(
          Math.max(0, remainder.length - boundaryBytes.length - multipartHeaderSeparator.length),
        ),
      };
    }

    if (boundaryIndex > 0) {
      remainder = remainder.slice(boundaryIndex);
    }

    const afterBoundaryIndex = boundaryBytes.length;
    if (remainder.length < afterBoundaryIndex + 2) {
      break;
    }

    if (
      remainder[afterBoundaryIndex] === 45 &&
      remainder[afterBoundaryIndex + 1] === 45
    ) {
      return { actionCounts, remainder: new Uint8Array(0) };
    }

    if (
      remainder[afterBoundaryIndex] !== multipartBoundaryLineBreak[0] ||
      remainder[afterBoundaryIndex + 1] !== multipartBoundaryLineBreak[1]
    ) {
      remainder = remainder.slice(afterBoundaryIndex);
      continue;
    }

    const headerStart = afterBoundaryIndex + multipartBoundaryLineBreak.length;
    const headerEnd = findByteSequence(remainder, multipartHeaderSeparator, headerStart);
    if (headerEnd === -1) {
      break;
    }

    const headerText = multipartHeaderDecoder.decode(
      remainder.slice(headerStart, headerEnd),
    );
    const contentLength = readMultipartIntegerHeader(headerText, "content-length");
    if (contentLength === null) {
      remainder = remainder.slice(headerEnd + multipartHeaderSeparator.length);
      continue;
    }

    const payloadStart = headerEnd + multipartHeaderSeparator.length;
    const payloadEnd = payloadStart + contentLength;
    const nextPartStart = payloadEnd + multipartBoundaryLineBreak.length;
    if (remainder.length < nextPartStart) {
      break;
    }

    const actionCount = readMultipartIntegerHeader(
      headerText,
      "x-simpler-action-count",
    );
    if (actionCount !== null) {
      actionCounts.push(actionCount);
    }

    remainder = remainder.slice(nextPartStart);
  }

  return { actionCounts, remainder };
}

function readMultipartIntegerHeader(headerText: string, headerName: string) {
  const match = new RegExp(`^${headerName}:\\s*(\\d+)$`, "im").exec(headerText);
  if (!match) {
    return null;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function concatUint8Arrays(left: Uint8Array, right: Uint8Array) {
  const joined = new Uint8Array(left.length + right.length);
  joined.set(left, 0);
  joined.set(right, left.length);
  return joined;
}

function findByteSequence(buffer: Uint8Array, sequence: Uint8Array, from = 0) {
  if (sequence.length === 0) {
    return from;
  }

  for (let index = from; index <= buffer.length - sequence.length; index += 1) {
    let matches = true;
    for (let offset = 0; offset < sequence.length; offset += 1) {
      if (buffer[index + offset] !== sequence[offset]) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return index;
    }
  }

  return -1;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function getActionDimensionKeys(actionSeries: SimplerLaunchStatusResponse["actionSeries"]) {
  const seen = new Set<string>();
  const dimensions: string[] = [];

  for (const point of actionSeries) {
    for (const [key, value] of Object.entries(point)) {
      if (key === "step" || key === "timestamp" || !Number.isFinite(value) || seen.has(key)) {
        continue;
      }
      seen.add(key);
      dimensions.push(key);
    }
  }

  return dimensions;
}

function getActionLineColor(dimension: string) {
  if (dimension in lineColors) {
    return lineColors[dimension as keyof typeof lineColors];
  }

  const palette = ["#7c6a0a", "#8f2d56", "#006d77", "#6c584c", "#355070", "#bc6c25"];
  let hash = 0;
  for (const char of dimension) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return palette[hash % palette.length];
}

function LogPanel({
  source,
  title,
  state,
  viewportTestId,
}: {
  source: SimplerLaunchLogSource;
  title: string;
  state: LiveLogPanelState;
  viewportTestId?: string;
}) {
  return (
    <article className="w-full min-w-0 overflow-hidden rounded-2xl border border-[oklch(0.84_0.025_72)] bg-[oklch(0.99_0.01_76)]">
      <div className="border-b border-[oklch(0.84_0.025_72)] bg-[oklch(0.965_0.012_74)] px-4 py-3">
        <h3 className="text-sm font-semibold text-[oklch(0.25_0.025_62)]">{title}</h3>
      </div>
      <div className="h-72 bg-[oklch(0.18_0.01_70)]">
        {state.errorMessage ? (
          <div className="flex h-full items-center px-4 py-3 font-mono text-xs leading-6 text-[oklch(0.92_0.01_70)]">
            <p className="text-[oklch(0.82_0.08_35)]">{state.errorMessage}</p>
          </div>
        ) : state.content ? (
          <pre
            data-testid={viewportTestId ?? "log-viewport-" + source}
            className="h-full overflow-y-auto whitespace-pre-wrap break-words px-4 py-3 font-mono text-xs leading-6 text-[oklch(0.92_0.01_70)]"
          >
            {state.content}
          </pre>
        ) : (
          <div className="flex h-full items-center px-4 py-3 font-mono text-xs leading-6 text-[oklch(0.92_0.01_70)]">
            <p className="text-[oklch(0.78_0.02_70)]">日志尚未生成</p>
          </div>
        )}
      </div>
    </article>
  );
}

function createEmptyLogState(): LiveLogState {
  return {
    server: createEmptyLogPanelState(null),
    client: createEmptyLogPanelState(null),
  };
}

function createEmptyLogPanelState(path: string | null): LiveLogPanelState {
  return {
    content: "",
    path,
    updatedAt: null,
    truncated: false,
    errorMessage: null,
  };
}

function toLiveLogPanelState(log: Pick<
  SimplerLaunchLogResponse | EvaluationModelServerLogResponse,
  "content" | "path" | "updatedAt" | "truncated"
>): LiveLogPanelState {
  return {
    content: log.content,
    path: log.path,
    updatedAt: log.updatedAt,
    truncated: log.truncated,
    errorMessage: null,
  };
}

function formatLogSectionState(label: string, state: LiveLogPanelState): LiveLogPanelState {
  return {
    ...state,
    content: formatCombinedLogSection(label, state.content),
  };
}

function formatCombinedLogSection(label: string, content: string) {
  if (!content) {
    return "";
  }
  return `=== ${label} ===\n${content}`;
}

function idleStatus(): SimplerLaunchStatusResponse {
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

function idleServerStatus(benchmark: ServerKey): EvaluationModelServerStatus {
  return {
    benchmark,
    label: benchmark === "simpler" ? "Simpler 模型服务" : "RMBench 模型服务",
    status: "idle",
    pid: null,
    port: benchmark === "simpler" ? 8000 : 9999,
    startedAt: null,
    updatedAt: null,
    checkpointPath: "",
    logPath: "",
    logFiles: {
      launcher: "",
      server: "",
    },
    errorMessage: null,
  };
}

function resolveFrameImageSrc(status: SimplerLaunchStatusResponse) {
  if (!status.runId || status.frameVersion <= 0) {
    return null;
  }

  if (shouldStreamFrame(status)) {
    return `/api/evaluation/simpler/frame/stream?runId=${encodeURIComponent(status.runId)}`;
  }

  if (status.latestFrameUrl) {
    return `${status.latestFrameUrl}&v=${status.frameVersion}`;
  }
  return null;
}

function shouldPollTask(taskStatus: SimplerLaunchStatusResponse) {
  return taskStatus.processActive || pollingStatuses.has(taskStatus.status);
}

function shouldPollTaskLogs(taskStatus: SimplerLaunchStatusResponse) {
  return (
    !!taskStatus.runId &&
    !!taskStatus.logFiles &&
    (taskStatus.processActive || pollingStatuses.has(taskStatus.status))
  );
}

function shouldGateVisualSync(status: SimplerLaunchStatusResponse) {
  return !!status.runId && (status.status === "starting" || status.status === "running");
}

function hasVisualSyncPayload(status: SimplerLaunchStatusResponse) {
  return (
    !!status.runId &&
    status.frameVersion > 0 &&
    status.actionSeries.length > 0
  );
}

function createVisualPendingStatus(
  status: SimplerLaunchStatusResponse,
): SimplerLaunchStatusResponse {
  return {
    ...status,
    latestFrameUrl: null,
    frameVersion: 0,
    actionSeries: [],
  };
}

function shouldRefreshTerminalFrame(taskStatus: SimplerLaunchStatusResponse) {
  return (
    !!taskStatus.runId &&
    !!taskStatus.latestFrameUrl &&
    terminalRefreshStatuses.has(taskStatus.status)
  );
}

function shouldWindowActionSeries(taskStatus: SimplerLaunchStatusResponse) {
  return taskStatus.processActive || pollingStatuses.has(taskStatus.status);
}

function shouldStreamFrame(taskStatus: SimplerLaunchStatusResponse) {
  return taskStatus.processActive || pollingStatuses.has(taskStatus.status);
}

function shouldPollServers(statuses: ServerStatusState) {
  return serverBenchmarks.some((benchmark) => pollingStatuses.has(statuses[benchmark].status));
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const rawBody = await response.text();
  const trimmedBody = rawBody.trim();
  const hasBody = trimmedBody.length > 0;
  let body: T | { error?: string } | null = null;

  if (hasBody) {
    try {
      body = JSON.parse(trimmedBody) as T | { error?: string };
    } catch {
      throw new Error(
        response.ok
          ? "接口返回了非 JSON 响应。"
          : trimmedBody || "请求失败，接口返回了无效响应。",
      );
    }
  }

  if (!response.ok) {
    throw new Error(
      typeof body === "object" && body && "error" in body && body.error
        ? body.error
        : trimmedBody || "Request failed",
    );
  }

  if (!hasBody || body === null) {
    throw new Error("接口返回空响应。");
  }

  return body as T;
}
