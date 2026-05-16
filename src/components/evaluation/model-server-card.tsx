"use client";

import React from "react";

import type {
  EvaluationBenchmark,
  EvaluationModelServerState,
  EvaluationModelServerStatus,
} from "@/types/evaluation-model-server";

const compactPrimaryButtonClass =
  "inline-flex h-9 items-center justify-center rounded-lg bg-[oklch(0.25_0.025_62)] px-3 text-xs font-semibold text-[oklch(0.98_0.012_76)] transition hover:bg-[oklch(0.31_0.03_62)] disabled:cursor-not-allowed disabled:bg-[oklch(0.7_0.025_65)]";
const compactSecondaryButtonClass =
  "inline-flex h-9 items-center justify-center rounded-lg border border-[oklch(0.78_0.045_58)] bg-[oklch(0.985_0.012_76)] px-3 text-xs font-semibold text-[oklch(0.28_0.04_52)] transition hover:border-[oklch(0.56_0.11_42)] disabled:cursor-not-allowed disabled:opacity-50";
const pollingStatuses = new Set(["starting", "running", "stopping"]);

export type ModelServerRequestState = "idle" | "starting" | "stopping";

export function ModelServerCard({
  benchmark,
  status,
  requestState,
  onStart,
  onStop,
}: {
  benchmark: EvaluationBenchmark;
  status: EvaluationModelServerStatus;
  requestState: ModelServerRequestState;
  onStart: () => void;
  onStop: () => void;
}) {
  const isBusy = requestState !== "idle";
  const isRunning = pollingStatuses.has(status.status);
  const startLabel = benchmark === "simpler" ? "启动 Simpler 服务" : "启动 RMBench 服务";
  const stopLabel = benchmark === "simpler" ? "停止 Simpler 服务" : "停止 RMBench 服务";

  return (
    <article className="flex w-full min-w-0 flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-[oklch(0.84_0.025_72)] bg-[oklch(0.96_0.018_75)] px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden
          className={`h-2 w-2 shrink-0 rounded-full ${getServerStatusDotClass(status.status)}`}
        />
        <h3 className="truncate text-sm font-semibold text-[oklch(0.25_0.025_62)]">
          {status.label}
        </h3>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className="text-[oklch(0.61_0.04_65)]" aria-hidden>
          ·
        </span>
        <span className="font-mono tabular-nums text-[oklch(0.34_0.03_60)]">
          :{status.port}
        </span>
        <span className="text-[oklch(0.61_0.04_65)]" aria-hidden>
          ·
        </span>
        <span className="text-[oklch(0.34_0.03_60)]">{status.status}</span>
      </div>

      <div className="ml-auto flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onStart}
          disabled={isBusy || isRunning}
          className={compactPrimaryButtonClass}
        >
          {startLabel}
        </button>
        <button
          type="button"
          onClick={onStop}
          disabled={isBusy || !isRunning}
          className={compactSecondaryButtonClass}
        >
          {stopLabel}
        </button>
      </div>

      {status.errorMessage ? (
        <p className="basis-full text-xs text-[oklch(0.45_0.14_28)]">
          {status.errorMessage}
        </p>
      ) : null}
    </article>
  );
}

function getServerStatusDotClass(state: EvaluationModelServerState): string {
  switch (state) {
    case "running":
      return "bg-[oklch(0.62_0.13_145)]";
    case "starting":
    case "stopping":
      return "bg-[oklch(0.72_0.14_75)] animate-pulse";
    case "failed":
      return "bg-[oklch(0.55_0.16_28)]";
    default:
      return "bg-[oklch(0.7_0.025_65)]";
  }
}
