"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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
  "rounded-2xl border border-[oklch(0.84_0.025_72)] bg-[oklch(0.985_0.012_76)] p-5 shadow-[0_12px_34px_rgba(42,33,28,0.06)] md:p-6";
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
const logSources: SimplerLaunchLogSource[] = ["server", "client"];

type LiveLogPanelState = {
  content: string;
  path: string | null;
  updatedAt: string | null;
  truncated: boolean;
  errorMessage: string | null;
};

type LiveLogState = Record<SimplerLaunchLogSource, LiveLogPanelState>;

export function SimplerLaunchPanel() {
  const [selectedTask, setSelectedTask] = useState<SimplerTaskId>("bridge_carrot");
  const [status, setStatus] = useState<SimplerLaunchStatusResponse>(idleStatus());
  const [requestState, setRequestState] = useState<"idle" | "launching" | "stopping">(
    "idle",
  );
  const [panelError, setPanelError] = useState<string | null>(null);
  const [liveLogs, setLiveLogs] = useState<LiveLogState>(createEmptyLogState());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    void refreshStatus();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!pollingStatuses.has(status.status)) {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshStatus();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [status.status]);

  const isBusy = requestState !== "idle";
  const isRunning = pollingStatuses.has(status.status);
  const frameSrc =
    status.latestFrameUrl && status.frameVersion >= 0
      ? `${status.latestFrameUrl}&v=${status.frameVersion}`
      : null;

  const actionDimensions = getActionDimensionKeys(status.actionSeries);
  async function refreshStatus() {
    try {
      const nextStatus = await fetchJson<SimplerLaunchStatusResponse>(
        "/api/evaluation/simpler/status",
      );
      if (!mountedRef.current) return;
      setPanelError(null);
      setStatus(nextStatus);
      if (!pollingStatuses.has(nextStatus.status)) {
        setRequestState("idle");
      }
      await refreshLogs(nextStatus);
    } catch (error) {
      if (!mountedRef.current) return;
      setPanelError(error instanceof Error ? error.message : "获取状态失败");
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

  async function handleLaunch() {
    setRequestState("launching");
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
      setStatus(nextStatus);
      await refreshLogs(nextStatus);
    } catch (error) {
      if (!mountedRef.current) return;
      setRequestState("idle");
      setPanelError(error instanceof Error ? error.message : "启动评测失败");
    }
  }

  async function handleStop() {
    setRequestState("stopping");
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
      setRequestState("idle");
      await refreshLogs(nextStatus);
    } catch (error) {
      if (!mountedRef.current) return;
      setRequestState("idle");
      setPanelError(error instanceof Error ? error.message : "停止评测失败");
    }
  }

  return (
    <div
      data-launch-layout="four-row"
      className="mx-auto flex max-w-7xl flex-col gap-6 py-6 md:py-8"
    >
      <section data-launch-row="controls" className={panelClass}>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,240px)_auto_minmax(0,180px)_minmax(0,1fr)] xl:items-end">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-[oklch(0.25_0.025_62)]">
              任务选择
            </span>
            <select
              aria-label="任务选择"
              value={selectedTask}
              onChange={(event) => setSelectedTask(event.target.value as SimplerTaskId)}
              disabled={isRunning || isBusy}
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
              disabled={isRunning || isBusy}
              className={primaryButtonClass}
            >
              启动评测
            </button>

            <button
              type="button"
              onClick={() => void handleStop()}
              disabled={!isRunning || isBusy}
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

      <section data-launch-row="logs" className={panelClass}>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[oklch(0.47_0.055_54)]">
          Live Logs
        </p>
        <div className="mt-2 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-[oklch(0.25_0.025_62)]">启动日志</h2>
            <p className="mt-1 text-sm text-[oklch(0.45_0.03_62)]">
              固定窗口显示完整日志，拖动右侧滚动条查看。
            </p>
          </div>
        </div>
        <div data-log-grid="paired" className="mt-5 grid gap-4 xl:grid-cols-2">
          <LogPanel source="server" title="模型 server 日志" state={liveLogs.server} />
          <LogPanel source="client" title="推理 client 日志" state={liveLogs.client} />
        </div>
      </section>

      <section data-launch-row="frame" className={panelClass}>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[oklch(0.47_0.055_54)]">
          Latest Frame
        </p>
        <h2 className="mt-2 text-xl font-semibold text-[oklch(0.25_0.025_62)]">
          最新渲染图
        </h2>
        <div className="mt-5 flex items-center justify-center overflow-hidden rounded-2xl border border-[oklch(0.84_0.025_72)] bg-[oklch(0.95_0.02_72)] p-4">
          {frameSrc ? (
            <img
              src={frameSrc}
              alt={`${status.taskId || "simpler"} latest frame`}
              className="max-h-[34rem] w-full object-contain"
            />
          ) : (
            <div className="flex min-h-[26rem] items-center justify-center px-6 py-10 text-sm text-[oklch(0.43_0.025_68)]">
              最新帧尚未生成
            </div>
          )}
        </div>
      </section>

      <section data-launch-row="actions" className={panelClass}>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[oklch(0.47_0.055_54)]">
          Raw Actions
        </p>
        <h2 className="mt-2 text-xl font-semibold text-[oklch(0.25_0.025_62)]">
          模型原始动作维度
        </h2>
        <div
          data-action-chart="simpler-actions"
          className="mt-5 rounded-2xl border border-[oklch(0.84_0.025_72)] bg-[oklch(0.99_0.01_76)] p-3"
        >
          {actionDimensions.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {actionDimensions.map((dimension) => (
                <article
                  key={dimension}
                  data-action-dimension-chart
                  className="overflow-hidden rounded-2xl border border-[oklch(0.84_0.025_72)] bg-[oklch(1_0_0)]"
                >
                  <div className="border-b border-[oklch(0.84_0.025_72)] bg-[oklch(0.965_0.012_74)] px-4 py-3">
                    <h3 className="text-sm font-semibold text-[oklch(0.25_0.025_62)]">
                      {dimension}
                    </h3>
                  </div>
                  <div className="overflow-x-auto p-2">
                    <LineChart
                      width={320}
                      height={220}
                      data={status.actionSeries}
                      margin={{ top: 16, right: 16, bottom: 8, left: 0 }}
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
          ) : (
            <div className="flex min-h-72 items-center justify-center px-6 py-10 text-sm text-[oklch(0.43_0.025_68)]">
              动作序列尚未生成
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[oklch(0.84_0.025_72)] bg-[oklch(0.96_0.018_75)] px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[oklch(0.47_0.055_54)]">
        {label}
      </p>
      <p className="mt-2 break-all text-sm font-medium text-[oklch(0.25_0.025_62)]">
        {value}
      </p>
    </div>
  );
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
}: {
  source: SimplerLaunchLogSource;
  title: string;
  state: LiveLogPanelState;
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-[oklch(0.84_0.025_72)] bg-[oklch(0.99_0.01_76)]">
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
            data-testid={"log-viewport-" + source}
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

function toLiveLogPanelState(log: SimplerLaunchLogResponse): LiveLogPanelState {
  return {
    content: log.content,
    path: log.path,
    updatedAt: log.updatedAt,
    truncated: log.truncated,
    errorMessage: null,
  };
}

function idleStatus(): SimplerLaunchStatusResponse {
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

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const body = (await response.json()) as T | { error?: string };
  if (!response.ok) {
    throw new Error(
      typeof body === "object" && body && "error" in body && body.error
        ? body.error
        : "Request failed",
    );
  }
  return body as T;
}
