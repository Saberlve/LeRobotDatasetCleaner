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
const multipartHeaderSeparator = new Uint8Array([13, 10, 13, 10]);
const multipartBoundaryLineBreak = new Uint8Array([13, 10]);
const multipartHeaderDecoder = new TextDecoder();

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
  const [visibleActionCount, setVisibleActionCount] = useState<number | null>(null);
  const mountedRef = useRef(true);
  const actionRequestKeyRef = useRef<string | null>(null);
  const actionRunIdRef = useRef<string | null>(null);
  const pendingVisualSyncRunIdRef = useRef<string | null>(null);
  const actionSeriesRef = useRef<RmbenchLaunchActionPoint[]>([]);

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
    actionSeriesRef.current = actionSeries;
  }, [actionSeries]);

  useEffect(() => {
    if (!status.runId) {
      actionRunIdRef.current = null;
      actionRequestKeyRef.current = null;
      pendingVisualSyncRunIdRef.current = null;
      setActionSeries([]);
      setVisibleActionCount(null);
      return;
    }

    if (actionRunIdRef.current !== status.runId) {
      actionRunIdRef.current = status.runId;
      actionRequestKeyRef.current = null;
      setActionSeries([]);
      setVisibleActionCount(null);
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
      !hasVisualSyncPayload(status, actionSeries);
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
  const isStreamingFrame = shouldStreamFrame(visualStatus);
  const thirdViewSrc = resolveFrameImageSrc(visualStatus, "third_view");
  const headViewSrc = resolveFrameImageSrc(visualStatus, "head_camera");
  const leftViewSrc = resolveFrameImageSrc(visualStatus, "left_camera");
  const rightViewSrc = resolveFrameImageSrc(visualStatus, "right_camera");
  const visibleActionSeries = resolveVisibleActionSeries(
    actionSeries,
    visibleActionCount,
    isStreamingFrame,
  );
  const isAwaitingInitialActionSync =
    visualSyncPending ||
    (isStreamingFrame && actionSeries.length > 0 && visibleActionCount === null);
  const deferredActionSeries = useDeferredValue(visibleActionSeries);
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

  function handleVisibleActionCountChange(nextActionCount: number | null) {
    if (!mountedRef.current) {
      return;
    }

    setVisibleActionCount((current) =>
      current === nextActionCount ? current : nextActionCount,
    );
    if (
      typeof nextActionCount === "number" &&
      status.runId &&
      nextActionCount > actionSeriesRef.current.length
    ) {
      const afterStep = actionSeriesRef.current.at(-1)?.step ?? 0;
      void refreshActionSeries(status.runId, afterStep);
    }
  }

  async function handleLaunch() {
    if (isTaskBusy) return;
    setTaskRequestState("launching");
    setPanelError(null);
    setActionSeries([]);
    setVisibleActionCount(null);
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
                isStreamingFrame ? (
                  <StreamingFrameImage
                    src={thirdViewSrc}
                    alt="swap_blocks third view"
                    onVisibleActionCountChange={handleVisibleActionCountChange}
                  />
                ) : (
                  <BufferedFrameImage src={thirdViewSrc} alt="swap_blocks third view" />
                )
              ) : visualSyncPending ? (
                <FramePlaceholder label="新任务缓冲中，等待主视角画面与动作同步" />
              ) : (
                <FramePlaceholder label="Third view 尚未生成" />
              )}
            </FrameCard>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <FrameCard title="Head Camera">
                {renderAuxiliaryFrame(
                  headViewSrc,
                  "swap_blocks head camera",
                  visualSyncPending,
                  isStreamingFrame,
                )}
              </FrameCard>
              <FrameCard title="Left Wrist">
                {renderAuxiliaryFrame(
                  leftViewSrc,
                  "swap_blocks left wrist",
                  visualSyncPending,
                  isStreamingFrame,
                )}
              </FrameCard>
              <FrameCard title="Right Wrist">
                {renderAuxiliaryFrame(
                  rightViewSrc,
                  "swap_blocks right wrist",
                  visualSyncPending,
                  isStreamingFrame,
                )}
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
            {!isAwaitingInitialActionSync && actionDimensions.length > 0 ? (
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
            ) : isAwaitingInitialActionSync ? (
              <div className="flex min-h-60 items-center justify-center px-6 py-10 text-sm text-[oklch(0.43_0.025_68)]">
                新任务缓冲中，等待首批动作与主视角同步
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
  streaming: boolean,
) {
  if (gated) {
    return <FramePlaceholder label="画面尚未生成" compact />;
  }

  if (!src) {
    return <FramePlaceholder label="画面尚未生成" compact />;
  }

  if (streaming) {
    return <StreamingFrameImage src={src} alt={alt} />;
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
        className={`flex items-center justify-center overflow-hidden bg-[oklch(0.95_0.02_72)] p-2 ${
          emphasize ? "min-h-[22rem]" : "min-h-[10rem]"
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

function StreamingFrameImage({
  src,
  alt,
  onVisibleActionCountChange,
}: {
  src: string;
  alt: string;
  onVisibleActionCountChange?: (nextActionCount: number | null) => void;
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
            onVisibleActionCountChangeRef.current?.(actionCount);
          }
        }
      } catch (error) {
        if (!isAbortError(error)) {
          onVisibleActionCountChangeRef.current?.(null);
        }
      }
    })();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [src]);

  return (
    <div className="relative h-full w-full">
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
    <div className="relative h-full w-full">
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

function resolveVisibleActionSeries(
  actionSeries: RmbenchLaunchActionPoint[],
  visibleActionCount: number | null,
  isStreamingFrame: boolean,
) {
  if (!isStreamingFrame) {
    return actionSeries;
  }

  if (visibleActionCount === null) {
    return [];
  }

  return actionSeries.slice(0, Math.max(0, visibleActionCount));
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
      "x-rmbench-action-count",
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
  if (!status.runId || status.frameVersions[cameraKey] <= 0) {
    return null;
  }

  if (shouldStreamFrame(status)) {
    return `/api/evaluation/rmbench/frame/stream?runId=${encodeURIComponent(status.runId)}&camera=${cameraKey}`;
  }

  const frameUrl = status.frameUrls[cameraKey];
  if (frameUrl) {
    return `${frameUrl}&v=${status.frameVersions[cameraKey]}`;
  }
  return null;
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

function hasVisualSyncPayload(
  status: RmbenchLaunchStatusResponse,
  actionSeries: RmbenchLaunchActionPoint[],
) {
  return !!status.runId && status.frameVersions.third_view > 0 && actionSeries.length > 0;
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

function shouldStreamFrame(taskStatus: RmbenchLaunchStatusResponse) {
  return taskStatus.processActive || pollingStatuses.has(taskStatus.status);
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
