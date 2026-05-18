"use client";

import React, { useDeferredValue, useEffect, useRef, useState } from "react";
import {
  ModelServerCard,
  type ModelServerRequestState,
} from "@/components/evaluation/model-server-card";
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type {
  RmbenchCameraKey,
  RmbenchLaunchActionPoint,
  RmbenchLaunchActionResponse,
  RmbenchLaunchStatusResponse,
} from "@/types/rmbench-launch";
import type { EvaluationModelServerStatus } from "@/types/evaluation-model-server";

const panelClass =
  "w-full min-w-0 rounded-2xl border border-[oklch(0.86_0.022_72)] bg-[oklch(0.99_0.012_76)] p-5 shadow-[0_1px_0_oklch(0.91_0.018_72),0_18px_42px_-30px_rgba(42,33,28,0.18)] md:p-6";
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
const TERMINAL_FRAME_REFRESH_INTERVAL_MS = 150;
const TERMINAL_FRAME_REFRESH_ATTEMPTS = 8;
const FRAME_FADE_DURATION_MS = 140;
const ACTIVE_ACTION_WINDOW_SIZE = 72;

type RequestState = "idle" | "launching" | "stopping";

export function RmbenchLaunchWorkspace({
  serverStatus = null,
  serverRequestState = "idle",
  onStartServer,
  onStopServer,
}: {
  serverStatus?: EvaluationModelServerStatus | null;
  serverRequestState?: ModelServerRequestState;
  onStartServer?: () => void;
  onStopServer?: () => void;
} = {}) {
  const [status, setStatus] = useState<RmbenchLaunchStatusResponse>(idleStatus());
  const [actionSeries, setActionSeries] = useState<RmbenchLaunchActionPoint[]>([]);
  const [taskRequestState, setTaskRequestState] = useState<RequestState>("idle");
  const [panelError, setPanelError] = useState<string | null>(null);
  const [visualSyncPending, setVisualSyncPending] = useState(false);
  const mountedRef = useRef(true);
  const actionRequestKeyRef = useRef<string | null>(null);
  const actionRunIdRef = useRef<string | null>(null);
  const pendingVisualSyncRunIdRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    void refreshTaskStatus();
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
  }, [status.processActive, status.status]);

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
  }, [status.frameVersions.third_view, status.runId, status.status, status.updatedAt]);

  useEffect(() => {
    if (!status.runId) {
      actionRunIdRef.current = null;
      actionRequestKeyRef.current = null;
      pendingVisualSyncRunIdRef.current = null;
      setActionSeries([]);
      return;
    }

    if (actionRunIdRef.current !== status.runId) {
      actionRunIdRef.current = status.runId;
      actionRequestKeyRef.current = null;
      setActionSeries([]);
    }
  }, [status.runId]);

  useEffect(() => {
    if (!status.runId || status.actionCount <= 0) {
      return;
    }

    if (actionSeries.length >= status.actionCount) {
      return;
    }

    const afterStep = actionSeries.at(-1)?.step ?? 0;
    void refreshActionSeries(status.runId, afterStep);
  }, [actionSeries, status.actionCount, status.runId]);

  useEffect(() => {
    if (!status.runId) {
      pendingVisualSyncRunIdRef.current = null;
      setVisualSyncPending(false);
      return;
    }

    const awaitingInitialPayload =
      status.runId === pendingVisualSyncRunIdRef.current &&
      shouldGateVisualSync(status) &&
      !hasVisualSyncPayload(status);
    if (awaitingInitialPayload) {
      setVisualSyncPending(true);
      return;
    }

    if (status.runId === pendingVisualSyncRunIdRef.current) {
      pendingVisualSyncRunIdRef.current = null;
    }

    setVisualSyncPending(false);
  }, [actionSeries, status]);

  const isTaskBusy = taskRequestState !== "idle";
  const hasActiveTaskProcess = status.processActive;
  const isTaskRunning = hasActiveTaskProcess || pollingStatuses.has(status.status);
  const visualStatus = visualSyncPending ? createVisualPendingStatus(status) : status;
  const thirdViewSrc = resolveFrameImageSrc(visualStatus, "third_view");
  const headViewSrc = resolveFrameImageSrc(visualStatus, "head_camera");
  const leftViewSrc = resolveFrameImageSrc(visualStatus, "left_camera");
  const rightViewSrc = resolveFrameImageSrc(visualStatus, "right_camera");
  const deferredActionSeries = useDeferredValue(actionSeries);
  const plottedActionSeries = shouldWindowActionSeries(visualStatus)
    ? deferredActionSeries.slice(-ACTIVE_ACTION_WINDOW_SIZE)
    : deferredActionSeries;
  const actionDimensions = getActionDimensionKeys(plottedActionSeries);

  async function refreshTaskStatus() {
    try {
      const nextStatus = await fetchJson<RmbenchLaunchStatusResponse>(
        "/api/evaluation/rmbench/status",
      );
      if (!mountedRef.current) return;
      setPanelError(null);
      setStatus(nextStatus);
      if (!nextStatus.processActive && !pollingStatuses.has(nextStatus.status)) {
        setTaskRequestState("idle");
      }
    } catch (error) {
      if (!mountedRef.current) return;
      setPanelError(error instanceof Error ? error.message : "获取 RMBench 状态失败");
    }
  }

  async function refreshActionSeries(runId: string, afterStep: number) {
    const requestKey = `${runId}:${afterStep}`;
    if (actionRequestKeyRef.current === requestKey) {
      return;
    }

    actionRequestKeyRef.current = requestKey;
    try {
      const nextActions = await fetchJson<RmbenchLaunchActionResponse>(
        `/api/evaluation/rmbench/actions?runId=${encodeURIComponent(runId)}&afterStep=${afterStep}`,
      );
      if (!mountedRef.current || nextActions.runId !== runId) {
        return;
      }
      setActionSeries((current) => mergeActionSeries(current, nextActions.actionSeries));
    } catch (error) {
      if (!mountedRef.current) return;
      setPanelError(error instanceof Error ? error.message : "获取 RMBench 动作失败");
    } finally {
      if (actionRequestKeyRef.current === requestKey) {
        actionRequestKeyRef.current = null;
      }
    }
  }

  async function handleLaunch() {
    if (isTaskBusy) return;
    setTaskRequestState("launching");
    setPanelError(null);
    setActionSeries([]);
    try {
      const nextStatus = await fetchJson<RmbenchLaunchStatusResponse>(
        "/api/evaluation/rmbench/launch",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ taskId: "swap_blocks" }),
        },
      );
      if (!mountedRef.current) return;
      pendingVisualSyncRunIdRef.current = nextStatus.runId;
      setStatus(nextStatus);
      setTaskRequestState(
        nextStatus.processActive || pollingStatuses.has(nextStatus.status)
          ? "idle"
          : "launching",
      );
    } catch (error) {
      if (!mountedRef.current) return;
      setTaskRequestState("idle");
      setPanelError(error instanceof Error ? error.message : "启动 RMBench 评测失败");
    }
  }

  async function handleStop() {
    if (isTaskBusy || !status.runId) return;
    setTaskRequestState("stopping");
    setPanelError(null);
    try {
      const nextStatus = await fetchJson<RmbenchLaunchStatusResponse>(
        "/api/evaluation/rmbench/stop",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ runId: status.runId }),
        },
      );
      if (!mountedRef.current) return;
      setStatus(nextStatus);
      setTaskRequestState(
        nextStatus.processActive || pollingStatuses.has(nextStatus.status)
          ? "stopping"
          : "idle",
      );
    } catch (error) {
      if (!mountedRef.current) return;
      setTaskRequestState("idle");
      setPanelError(error instanceof Error ? error.message : "停止 RMBench 评测失败");
    }
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <section className={panelClass}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-[oklch(0.25_0.025_62)]">
                RMBench Live 评测
              </h2>
              <p className="mt-1 text-sm text-[oklch(0.43_0.025_68)]">
                固定任务 `swap_blocks`，配置 `demo_clean`，依赖上方常驻 RMBench 模型服务。
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleLaunch()}
                disabled={isTaskRunning || isTaskBusy}
                className={primaryButtonClass}
              >
                启动 RMBench 评测
              </button>
              <button
                type="button"
                onClick={() => void handleStop()}
                disabled={!hasActiveTaskProcess || isTaskBusy}
                className={secondaryButtonClass}
              >
                停止 RMBench 评测
              </button>
            </div>
          </div>

          {serverStatus ? (
            <div className="rounded-2xl border border-[oklch(0.84_0.025_72)] bg-[oklch(0.985_0.01_76)] p-3">
              <p className="mb-3 text-sm font-semibold text-[oklch(0.25_0.025_62)]">
                RMBench 模型服务
              </p>
              <ModelServerCard
                benchmark="rmbench"
                status={serverStatus}
                requestState={serverRequestState}
                onStart={() => onStartServer?.()}
                onStop={() => onStopServer?.()}
              />
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,240px)_minmax(0,180px)_minmax(0,1fr)]">
            <InfoCard label="任务配置" value="swap_blocks / demo_clean" />
            <InfoCard label="运行状态" value={status.status} />
            <InfoCard label="当前提示词" value={status.prompt || "-"} />
          </div>
        </div>

        {panelError ? (
          <p className="mt-4 rounded-xl border border-[oklch(0.76_0.08_35)] bg-[oklch(0.97_0.03_35)] px-4 py-3 text-sm text-[oklch(0.38_0.12_28)]">
            {panelError}
          </p>
        ) : null}
      </section>

      <div className="grid w-full min-w-0 gap-6 xl:grid-cols-[minmax(0,6fr)_minmax(0,6fr)] xl:items-start">
        <section className={panelClass}>
          <h2 className="text-xl font-semibold text-[oklch(0.25_0.025_62)]">
            四路实时画面
          </h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(220px,1fr)]">
            <FrameCard title="Third View" emphasize>
              {thirdViewSrc ? (
                <BufferedFrameImage src={thirdViewSrc} alt="swap_blocks third view" />
              ) : visualSyncPending ? (
                <FramePlaceholder label="新任务缓冲中，等待主视角画面生成" />
              ) : (
                <FramePlaceholder label="Third view 尚未生成" />
              )}
            </FrameCard>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <FrameCard title="Head Camera">
                {renderAuxiliaryFrame(headViewSrc, "swap_blocks head camera", visualSyncPending)}
              </FrameCard>
              <FrameCard title="Left Wrist">
                {renderAuxiliaryFrame(leftViewSrc, "swap_blocks left wrist", visualSyncPending)}
              </FrameCard>
              <FrameCard title="Right Wrist">
                {renderAuxiliaryFrame(rightViewSrc, "swap_blocks right wrist", visualSyncPending)}
              </FrameCard>
            </div>
          </div>
        </section>

        <section className={panelClass}>
          <h2 className="text-xl font-semibold text-[oklch(0.25_0.025_62)]">
            RMBench 动作维度
          </h2>
          <div
            data-action-chart="rmbench-actions"
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
            ) : visualSyncPending ? (
              <div className="flex min-h-60 items-center justify-center px-6 py-10 text-sm text-[oklch(0.43_0.025_68)]">
                新任务缓冲中，等待首批动作写入
              </div>
            ) : (
              <div className="flex min-h-60 items-center justify-center px-6 py-10 text-sm text-[oklch(0.43_0.025_68)]">
                动作序列尚未生成
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function renderAuxiliaryFrame(
  src: string | null,
  alt: string,
  gated: boolean,
) {
  if (gated) {
    return <FramePlaceholder label="画面尚未生成" compact />;
  }

  if (!src) {
    return <FramePlaceholder label="画面尚未生成" compact />;
  }

  return <BufferedFrameImage src={src} alt={alt} />;
}

function FrameCard({
  title,
  emphasize = false,
  children,
}: {
  title: string;
  emphasize?: boolean;
  children: React.ReactNode;
}) {
  return (
    <article className="overflow-hidden rounded-xl border border-[oklch(0.84_0.025_72)] bg-[oklch(1_0_0)]">
      <div className="border-b border-[oklch(0.84_0.025_72)] bg-[oklch(0.965_0.012_74)] px-3 py-2">
        <h3 className="text-sm font-semibold text-[oklch(0.25_0.025_62)]">{title}</h3>
      </div>
      <div
        className={`flex items-stretch justify-center overflow-hidden bg-[oklch(0.95_0.02_72)] p-2 ${
          emphasize ? "h-[22rem]" : "h-[10rem]"
        }`}
      >
        {children}
      </div>
    </article>
  );
}

function FramePlaceholder({
  label,
  compact = false,
}: {
  label: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-center px-4 text-center text-sm text-[oklch(0.43_0.025_68)] ${
        compact ? "py-6" : "py-10"
      }`}
    >
      {label}
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="w-full min-w-0 rounded-xl border border-[oklch(0.86_0.023_72)] bg-[oklch(0.965_0.018_75)] px-4 py-3">
      <p className="text-xs font-medium text-[oklch(0.49_0.025_66)]">{label}</p>
      <p className="mt-1.5 break-all text-sm font-semibold text-[oklch(0.25_0.025_62)]">
        {value}
      </p>
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
    <div className="relative h-full w-full self-stretch">
      {currentSrc ? (
        <img
          src={currentSrc}
          alt={alt}
          draggable={false}
          decoding="async"
          className={`${sharedClass} ${incomingSrc ? "opacity-0" : "opacity-100"}`}
          style={{ transition: `opacity ${FRAME_FADE_DURATION_MS}ms ease-out` }}
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
          style={{ transition: `opacity ${FRAME_FADE_DURATION_MS}ms ease-out` }}
        />
      ) : null}
    </div>
  );
}

function getActionDimensionKeys(actionSeries: RmbenchLaunchActionPoint[]) {
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

function idleStatus(): RmbenchLaunchStatusResponse {
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
    frameUrls: {
      third_view: null,
      head_camera: null,
      left_camera: null,
      right_camera: null,
    },
    frameVersions: {
      third_view: 0,
      head_camera: 0,
      left_camera: 0,
      right_camera: 0,
    },
    actionSeries: [],
    errorMessage: null,
    logPath: null,
    logFiles: null,
  };
}

function resolveFrameImageSrc(
  status: RmbenchLaunchStatusResponse,
  cameraKey: RmbenchCameraKey,
) {
  const frameUrl = status.frameUrls[cameraKey];
  if (!status.runId || !frameUrl || status.frameVersions[cameraKey] <= 0) {
    return null;
  }

  return `${frameUrl}&v=${status.frameVersions[cameraKey]}`;
}

function shouldPollTask(taskStatus: RmbenchLaunchStatusResponse) {
  return taskStatus.processActive || pollingStatuses.has(taskStatus.status);
}

function shouldRefreshTerminalFrame(taskStatus: RmbenchLaunchStatusResponse) {
  return (
    !!taskStatus.runId &&
    !!taskStatus.frameUrls.third_view &&
    terminalRefreshStatuses.has(taskStatus.status)
  );
}

function shouldWindowActionSeries(taskStatus: RmbenchLaunchStatusResponse) {
  return taskStatus.processActive || pollingStatuses.has(taskStatus.status);
}

function shouldGateVisualSync(status: RmbenchLaunchStatusResponse) {
  return !!status.runId && (status.status === "starting" || status.status === "running");
}

function hasVisualSyncPayload(status: RmbenchLaunchStatusResponse) {
  return !!status.runId && status.frameVersions.third_view > 0;
}

function createVisualPendingStatus(
  status: RmbenchLaunchStatusResponse,
): RmbenchLaunchStatusResponse {
  return {
    ...status,
    frameUrls: {
      third_view: null,
      head_camera: null,
      left_camera: null,
      right_camera: null,
    },
    frameVersions: {
      third_view: 0,
      head_camera: 0,
      left_camera: 0,
      right_camera: 0,
    },
  };
}

function mergeActionSeries(
  current: RmbenchLaunchActionPoint[],
  incoming: RmbenchLaunchActionPoint[],
) {
  if (incoming.length === 0) {
    return current;
  }

  const byStep = new Map<number, RmbenchLaunchActionPoint>();
  for (const point of current) {
    byStep.set(point.step, point);
  }
  for (const point of incoming) {
    byStep.set(point.step, point);
  }
  return Array.from(byStep.values()).sort((left, right) => left.step - right.step);
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
