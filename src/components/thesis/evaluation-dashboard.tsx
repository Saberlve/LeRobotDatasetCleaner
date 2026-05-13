"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { flushSync } from "react-dom";
import type { IconType } from "react-icons";
import {
  FiActivity,
  FiArrowUpRight,
  FiAward,
  FiBarChart2,
  FiCamera,
  FiCpu,
  FiDatabase,
  FiFileText,
  FiFilm,
  FiLayers,
  FiPlayCircle,
  FiSliders,
  FiTarget,
  FiTrendingUp,
} from "react-icons/fi";

import { TrainingCurves } from "./training-curves";
import type {
  EvaluationDashboard,
  EvaluationResultRow,
} from "@/server/eval-results/summary";
import type { TrainingConfigSummary } from "@/server/eval-results/training-config";

type WorkbenchMode = "overview" | "data" | "training" | "replay";
type EvaluationBenchmark = EvaluationResultRow["benchmark"];

type EvaluationDashboardProps = {
  dashboard: EvaluationDashboard;
  mode?: WorkbenchMode;
};

type TrainingEditValues = {
  batchSize: string;
  gradientAccumulationSteps: string;
  numTrainSteps: string;
  saveInterval: string;
  warmupSteps: string;
  peakLr: string;
  decaySteps: string;
  decayLr: string;
  baseLr: string;
  memoryLr: string;
  memory: {
    momentTokenCount: string;
    cacheSize: string;
    decisionStride: string;
  };
};

type WorkspaceFeatureItem = {
  id: string;
  title: string;
  caption: string;
  icon: IconType;
};

const panelClass =
  "rounded-2xl border border-[oklch(0.84_0.025_72)] bg-[oklch(0.985_0.012_76)] p-5 shadow-[0_12px_34px_rgba(42,33,28,0.06)] md:p-6";
const insetClass =
  "rounded-xl border border-[oklch(0.86_0.023_72)] bg-[oklch(0.96_0.018_75)]";
const fieldClass =
  "w-full rounded-lg border border-[oklch(0.84_0.025_72)] bg-[oklch(0.99_0.01_76)] px-3 py-2 text-sm font-medium text-[oklch(0.25_0.025_62)] outline-none transition focus:border-[oklch(0.56_0.11_42)] focus:ring-2 focus:ring-[oklch(0.76_0.08_50_/_0.22)]";
const selectClass =
  "rounded-xl border border-[oklch(0.84_0.025_72)] bg-[oklch(0.96_0.018_75)] px-3 py-2 text-sm text-[oklch(0.25_0.025_62)] outline-none transition focus:border-[oklch(0.56_0.11_42)]";
const primaryButtonClass =
  "rounded-xl bg-[oklch(0.25_0.025_62)] px-4 py-2 text-sm font-medium text-[oklch(0.98_0.012_76)] transition hover:bg-[oklch(0.31_0.03_62)] disabled:cursor-wait disabled:bg-[oklch(0.61_0.025_65)]";
const RMBENCH_VIDEO_SIDE_CROP_PERCENT = 1;
const RMBENCH_VIDEO_VISIBLE_WIDTH_PERCENT =
  100 - RMBENCH_VIDEO_SIDE_CROP_PERCENT * 2;
const RMBENCH_VIDEO_WIDTH_PERCENT = 10000 / RMBENCH_VIDEO_VISIBLE_WIDTH_PERCENT;
const RMBENCH_VIDEO_OFFSET_PERCENT =
  (RMBENCH_VIDEO_SIDE_CROP_PERCENT * 100) / RMBENCH_VIDEO_VISIBLE_WIDTH_PERCENT;
const BASELINE_CONFIG_NAMES = [
  "pi05_rmbench",
  "pi05_rmbench_lora",
  "pi05_simpler",
  "pi05_simpler_lora_pytorch_baseline",
];

function croppedRmbenchAspectRatio(width: number, height: number) {
  return `${width * RMBENCH_VIDEO_VISIBLE_WIDTH_PERCENT} / ${height * 100}`;
}

const workbenchNav: Array<{
  mode: WorkbenchMode;
  href: string;
  label: string;
  caption: string;
  icon: IconType;
}> = [
  {
    mode: "overview",
    href: "/evaluation",
    label: "总览",
    caption: "一体化平台入口",
    icon: FiBarChart2,
  },
  {
    mode: "data",
    href: "/evaluation/data",
    label: "数据查看",
    caption: "数据集与样本浏览",
    icon: FiDatabase,
  },
  {
    mode: "training",
    href: "/evaluation/training",
    label: "训练配置和曲线",
    caption: "训练参数与曲线",
    icon: FiBarChart2,
  },
  {
    mode: "replay",
    href: "/evaluation/replay",
    label: "评测查看和回放",
    caption: "SimplerEnv 与 RMBench",
    icon: FiPlayCircle,
  },
];

function trainingEditValues(
  config?: TrainingConfigSummary,
): TrainingEditValues {
  return {
    batchSize: config?.batchSize ?? "",
    gradientAccumulationSteps: config?.gradientAccumulationSteps ?? "",
    numTrainSteps: config?.numTrainSteps ?? "",
    saveInterval: config?.saveInterval ?? "",
    warmupSteps: config?.warmupSteps ?? "",
    peakLr: config?.peakLr ?? "",
    decaySteps: config?.decaySteps ?? "",
    decayLr: config?.decayLr ?? "",
    baseLr: config?.baseLr ?? "",
    memoryLr: config?.memoryLr ?? "",
    memory: {
      momentTokenCount: config?.memory.momentTokenCount ?? "",
      cacheSize: config?.memory.cacheSize ?? "",
      decisionStride: config?.memory.decisionStride ?? "",
    },
  };
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function mediaUrl(relativePath: string) {
  return `/api/eval-results/media?path=${encodeURIComponent(relativePath)}`;
}

export function EvaluationDashboardView({
  dashboard,
  mode = "overview",
}: EvaluationDashboardProps) {
  const [trainingConfigs, setTrainingConfigs] = useState(
    dashboard.training.configs,
  );
  const [simplerRunIndex, setSimplerRunIndex] = useState(0);
  const selectedSimplerRun = dashboard.simpler.runs[simplerRunIndex];
  const latestSimplerStep = selectedSimplerRun?.steps.at(-1);
  const [simplerStepIndex, setSimplerStepIndex] = useState(
    Math.max(0, (selectedSimplerRun?.steps.length ?? 1) - 1),
  );
  const selectedSimplerStep =
    selectedSimplerRun?.steps[simplerStepIndex] ?? latestSimplerStep;
  const [simplerVideoIndex, setSimplerVideoIndex] = useState(0);
  const selectedSimplerVideo = selectedSimplerStep?.videos[simplerVideoIndex];

  const [trainingConfigIndex, setTrainingConfigIndex] = useState(0);
  const selectedTrainingConfig = trainingConfigs[trainingConfigIndex];
  const [baselineConfigIndex, setBaselineConfigIndex] = useState(0);
  const baselineConfigs = BASELINE_CONFIG_NAMES.map((name) =>
    trainingConfigs.find(
      (config) => config.name === name && !config.memory.enabled,
    ),
  ).filter((config): config is TrainingConfigSummary => Boolean(config));
  const selectedBaselineConfig =
    baselineConfigs[baselineConfigIndex] ?? baselineConfigs[0];
  const [trainingEdit, setTrainingEdit] = useState(() =>
    trainingEditValues(selectedTrainingConfig),
  );
  const [trainingSaveState, setTrainingSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [trainingSaveMessage, setTrainingSaveMessage] = useState("");

  const [rmbenchRunIndex, setRmbenchRunIndex] = useState(0);
  const selectedRmbenchRun = dashboard.rmbench.runs[rmbenchRunIndex];
  const [timestampIndex, setTimestampIndex] = useState(0);
  const selectedTimestamp = selectedRmbenchRun?.timestamps[timestampIndex];
  const [rmbenchVideoIndex, setRmbenchVideoIndex] = useState(0);
  const selectedRmbenchVideo =
    selectedTimestamp?.videos[rmbenchVideoIndex] ??
    selectedTimestamp?.videos[0];
  const [rmbenchVideoRatio, setRmbenchVideoRatio] = useState(() =>
    croppedRmbenchAspectRatio(16, 9),
  );
  const [dataEpisodeInput, setDataEpisodeInput] = useState("0");
  const [dataCopyState, setDataCopyState] = useState<
    "idle" | "copied" | "error"
  >("idle");
  const bestSimplerStep = useMemo(() => {
    if (!selectedSimplerRun) return null;
    return selectedSimplerRun.steps.reduce((best, current) => {
      if ((current.averageEntire ?? -1) > (best.averageEntire ?? -1)) {
        return current;
      }
      return best;
    }, selectedSimplerRun.steps[0]);
  }, [selectedSimplerRun]);

  const platformStats = useMemo(() => {
    const simplerCheckpoints = dashboard.simpler.runs.reduce(
      (sum, run) => sum + run.steps.length,
      0,
    );
    const simplerVideos = dashboard.simpler.runs.reduce(
      (sum, run) =>
        sum +
        run.steps.reduce((stepSum, step) => stepSum + step.videos.length, 0),
      0,
    );
    const rmbenchVideos = dashboard.rmbench.runs.reduce(
      (sum, run) =>
        sum +
        run.timestamps.reduce(
          (timestampSum, timestamp) => timestampSum + timestamp.videos.length,
          0,
        ),
      0,
    );

    return {
      trainingConfigs: trainingConfigs.length,
      simplerRuns: dashboard.simpler.runs.length,
      simplerCheckpoints,
      replayVideos: simplerVideos + rmbenchVideos,
    };
  }, [dashboard.rmbench.runs, dashboard.simpler.runs, trainingConfigs.length]);

  const showOverview = mode === "overview";
  const showData = mode === "data";
  const showTraining = mode === "training";
  const showReplay = mode === "replay";
  const resultRows = dashboard.results.rows;
  const [selectedResultBenchmark, setSelectedResultBenchmark] =
    useState<EvaluationBenchmark>("SimplerEnv");

  useEffect(() => {
    setTrainingEdit(trainingEditValues(selectedTrainingConfig));
    setTrainingSaveState("idle");
    setTrainingSaveMessage("");
  }, [selectedTrainingConfig]);

  useEffect(() => {
    if (baselineConfigIndex >= baselineConfigs.length) {
      setBaselineConfigIndex(0);
    }
  }, [baselineConfigIndex, baselineConfigs.length]);

  useEffect(() => {
    setSimplerStepIndex(
      Math.max(0, (selectedSimplerRun?.steps.length ?? 1) - 1),
    );
    setSimplerVideoIndex(0);
  }, [selectedSimplerRun]);

  useEffect(() => {
    setSimplerVideoIndex(0);
  }, [selectedSimplerStep]);

  useEffect(() => {
    setRmbenchVideoRatio(croppedRmbenchAspectRatio(16, 9));
  }, [selectedRmbenchVideo]);

  useEffect(() => {
    setRmbenchVideoIndex(0);
  }, [selectedTimestamp]);

  function updateTrainingEdit(key: keyof TrainingEditValues, value: string) {
    setTrainingEdit((current) => ({ ...current, [key]: value }));
    setTrainingSaveState("idle");
  }

  function updateMemoryEdit(
    key: keyof TrainingEditValues["memory"],
    value: string,
  ) {
    setTrainingEdit((current) => ({
      ...current,
      memory: { ...current.memory, [key]: value },
    }));
    setTrainingSaveState("idle");
  }

  function preserveWindowScroll(update: () => void) {
    if (typeof window === "undefined") {
      update();
      return;
    }

    const scrollPosition = { x: window.scrollX, y: window.scrollY };
    const root = document.documentElement;
    const body = document.body;
    const previousRootScrollBehavior = root.style.scrollBehavior;
    const previousBodyScrollBehavior = body.style.scrollBehavior;

    root.style.scrollBehavior = "auto";
    body.style.scrollBehavior = "auto";
    try {
      flushSync(update);
      window.scrollTo({
        left: scrollPosition.x,
        top: scrollPosition.y,
        behavior: "instant",
      });
    } finally {
      root.style.scrollBehavior = previousRootScrollBehavior;
      body.style.scrollBehavior = previousBodyScrollBehavior;
    }
  }

  function selectTrainingConfig(index: number) {
    preserveWindowScroll(() => setTrainingConfigIndex(index));
  }

  function selectBaselineConfig(index: number) {
    preserveWindowScroll(() => setBaselineConfigIndex(index));
  }

  function selectSimplerRun(index: number) {
    preserveWindowScroll(() => setSimplerRunIndex(index));
  }

  function selectSimplerStep(index: number) {
    preserveWindowScroll(() => {
      setSimplerStepIndex(index);
      setSimplerVideoIndex(0);
    });
  }

  function selectSimplerVideo(index: number) {
    preserveWindowScroll(() => setSimplerVideoIndex(index));
  }

  function selectRmbenchRun(index: number) {
    preserveWindowScroll(() => {
      setRmbenchRunIndex(index);
      setTimestampIndex(0);
      setRmbenchVideoIndex(0);
    });
  }

  function selectRmbenchTimestamp(index: number) {
    preserveWindowScroll(() => {
      setTimestampIndex(index);
      setRmbenchVideoIndex(0);
    });
  }

  function selectRmbenchVideo(index: number) {
    preserveWindowScroll(() => setRmbenchVideoIndex(index));
  }

  function selectResultBenchmark(benchmark: EvaluationBenchmark) {
    preserveWindowScroll(() => setSelectedResultBenchmark(benchmark));
  }

  async function saveTrainingConfig() {
    if (!selectedTrainingConfig) return;
    setTrainingSaveState("saving");
    setTrainingSaveMessage("正在写入 config.py...");

    const response = await fetch("/api/eval-results/training-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: selectedTrainingConfig.name,
        ...trainingEdit,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setTrainingSaveState("error");
      setTrainingSaveMessage(payload.error ?? "保存失败");
      return;
    }

    setTrainingConfigs(payload.configs);
    const nextIndex = payload.configs.findIndex(
      (config: TrainingConfigSummary) => config.name === payload.config.name,
    );
    if (nextIndex >= 0) setTrainingConfigIndex(nextIndex);
    setTrainingEdit(trainingEditValues(payload.config));
    setTrainingSaveState("saved");
    setTrainingSaveMessage("已保存到 config.py");
  }

  function normalizedEpisodeIndex(rawValue = dataEpisodeInput) {
    const parsed = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.min(dashboard.acone.episodes - 1, parsed));
  }

  function aconeEpisodeRoute(index: number) {
    const safeIndex = Math.max(
      0,
      Math.min(dashboard.acone.episodes - 1, index),
    );
    if (/\/episode_\d+$/.test(dashboard.acone.datasetRoute)) {
      return dashboard.acone.datasetRoute.replace(
        /\/episode_\d+$/,
        `/episode_${safeIndex}`,
      );
    }
    return `${dashboard.acone.datasetRoute}/episode_${safeIndex}`;
  }

  async function copyDataSummary() {
    const episodeIndex = normalizedEpisodeIndex();
    const summary = [
      `dataset: ${dashboard.acone.datasetName}`,
      `episodes: ${dashboard.acone.episodes}`,
      `frames: ${dashboard.acone.frames}`,
      `avg frames/episode: ${Math.round(dashboard.acone.frames / Math.max(1, dashboard.acone.episodes))}`,
      `current episode: episode_${episodeIndex}`,
      `route: ${aconeEpisodeRoute(episodeIndex)}`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(summary);
      setDataCopyState("copied");
    } catch {
      setDataCopyState("error");
    }
  }

  function WorkspaceHeader() {
    return (
      <section className="mx-auto max-w-7xl py-6 md:py-8">
        <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[oklch(0.47_0.055_54)]">
              Evaluation System
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-[oklch(0.25_0.025_62)] md:text-3xl">
              训练-评测-回放一体化平台
            </h1>
          </div>
          <Link
            href="/results"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-[oklch(0.78_0.045_58)] bg-[oklch(0.985_0.012_76)] px-4 text-sm font-medium text-[oklch(0.28_0.04_52)] transition hover:border-[oklch(0.56_0.11_42)] hover:text-[oklch(0.41_0.095_42)]"
          >
            返回展示页
          </Link>
        </div>

        <nav className="mt-5 grid gap-2 md:grid-cols-4">
          {workbenchNav.map((item) => {
            const active = item.mode === mode;
            const NavIcon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-start gap-3 rounded-2xl border px-4 py-3 transition ${
                  active
                    ? "border-[oklch(0.59_0.105_43)] bg-[oklch(0.93_0.045_62)] text-[oklch(0.26_0.035_52)]"
                    : "border-[oklch(0.84_0.025_72)] bg-[oklch(0.985_0.012_76)] text-[oklch(0.43_0.025_68)] hover:border-[oklch(0.68_0.06_55)] hover:text-[oklch(0.25_0.025_62)]"
                }`}
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[oklch(0.82_0.035_66)] bg-[oklch(0.985_0.012_76)]">
                  <NavIcon aria-hidden="true" className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">
                    {item.label}
                  </span>
                  <span className="mt-1 block text-xs opacity-75">
                    {item.caption}
                  </span>
                </span>
              </Link>
            );
          })}
        </nav>
      </section>
    );
  }

  function OverviewEntryPanel() {
    const entries: Array<{
      href: string;
      label: string;
      title: string;
      caption: string;
      meta: string;
      action: string;
      icon: IconType;
    }> = [
      {
        href: "/evaluation/data",
        label: "Data",
        title: "数据查看",
        caption: "查看 ACONE 数据集，定位 episode 并核对采集质量。",
        meta: `${formatInteger(dashboard.acone.episodes)} episodes / ${formatInteger(dashboard.acone.frames)} frames`,
        action: "进入数据查看",
        icon: FiDatabase,
      },
      {
        href: "/evaluation/training",
        label: "Training",
        title: "训练配置和曲线",
        caption: "编辑训练参数，对照 baseline 并打开训练曲线。",
        meta: `${formatInteger(platformStats.trainingConfigs)} configs`,
        action: "进入训练工作区",
        icon: FiBarChart2,
      },
      {
        href: "/evaluation/replay",
        label: "Replay",
        title: "评测查看和回放",
        caption: "查看 SimplerEnv 与 RMBench 评测结果及回放视频。",
        meta: `${formatInteger(platformStats.simplerCheckpoints)} checkpoints / ${formatInteger(platformStats.replayVideos)} videos`,
        action: "进入评测回放",
        icon: FiPlayCircle,
      },
    ];

    return (
      <section className={panelClass}>
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[oklch(0.47_0.055_54)]">
              Entry Hub
            </p>
            <h2 className="mt-2 text-xl font-semibold">选择工作区</h2>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {entries.map((entry) => {
            const EntryIcon = entry.icon;
            return (
              <Link
                key={entry.href}
                href={entry.href}
                className="group flex min-h-60 flex-col justify-between rounded-2xl border border-[oklch(0.84_0.025_72)] bg-[oklch(0.965_0.018_75)] p-5 transition hover:border-[oklch(0.59_0.105_43)] hover:bg-[oklch(0.985_0.012_76)] hover:shadow-[0_14px_34px_rgba(42,33,28,0.07)]"
              >
                <span>
                  <span className="flex items-center justify-between gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[oklch(0.82_0.035_66)] bg-[oklch(0.985_0.012_76)] text-[oklch(0.41_0.095_42)]">
                      <EntryIcon aria-hidden="true" className="h-5 w-5" />
                    </span>
                    <span className="rounded-full border border-[oklch(0.84_0.025_72)] px-2.5 py-1 text-xs font-semibold text-[oklch(0.49_0.02_68)]">
                      {entry.label}
                    </span>
                  </span>
                  <span className="mt-5 block text-lg font-semibold text-[oklch(0.25_0.025_62)]">
                    {entry.title}
                  </span>
                  <span className="mt-2 block text-sm leading-6 text-[oklch(0.43_0.025_68)]">
                    {entry.caption}
                  </span>
                </span>

                <span>
                  <span className="mt-6 block border-t border-[oklch(0.84_0.025_72)] pt-4 text-sm font-medium text-[oklch(0.34_0.035_58)]">
                    {entry.meta}
                  </span>
                  <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[oklch(0.42_0.09_42)] transition group-hover:text-[oklch(0.31_0.07_42)]">
                    {entry.action}
                    <FiArrowUpRight aria-hidden="true" className="h-4 w-4" />
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    );
  }

  function WorkspaceFeatureStrip({
    workspace,
    eyebrow,
    title,
    caption,
    items,
    image,
  }: {
    workspace: WorkbenchMode;
    eyebrow: string;
    title: string;
    caption: string;
    items: WorkspaceFeatureItem[];
    image?: {
      src: string;
      alt: string;
      label: string;
    };
  }) {
    return (
      <section className={panelClass} data-workspace-cue={workspace}>
        <div
          className={`grid gap-5 lg:items-stretch ${
            image ? "lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.38fr)]" : ""
          }`}
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[oklch(0.47_0.055_54)]">
              {eyebrow}
            </p>
            <h2 className="mt-2 text-xl font-semibold">{title}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[oklch(0.43_0.025_68)]">
              {caption}
            </p>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {items.map((item) => {
                const ItemIcon = item.icon;
                return (
                  <div
                    key={item.id}
                    data-workspace-icon={item.id}
                    className="rounded-xl border border-[oklch(0.84_0.025_72)] bg-[oklch(0.965_0.018_75)] p-4"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[oklch(0.82_0.035_66)] bg-[oklch(0.985_0.012_76)] text-[oklch(0.41_0.095_42)]">
                      <ItemIcon aria-hidden="true" className="h-5 w-5" />
                    </span>
                    <h3 className="mt-4 text-sm font-semibold text-[oklch(0.25_0.025_62)]">
                      {item.title}
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-[oklch(0.43_0.025_68)]">
                      {item.caption}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {image ? (
            <div className="overflow-hidden rounded-xl border border-[oklch(0.82_0.028_72)] bg-[oklch(0.18_0.015_60)]">
              <div className="relative h-full min-h-44">
                <Image
                  src={image.src}
                  alt={image.alt}
                  width={480}
                  height={320}
                  className="h-full w-full object-cover"
                />
                <div className="absolute bottom-3 left-3 rounded-lg border border-[oklch(0.95_0.01_75_/_0.28)] bg-[oklch(0.2_0.015_60_/_0.82)] px-3 py-2 text-xs font-medium text-[oklch(0.96_0.012_76)]">
                  {image.label}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  function DataWorkspaceCue() {
    return (
      <WorkspaceFeatureStrip
        workspace="data"
        eyebrow="Data Workspace"
        title="数据查看工作区"
        caption="查看 ACONE 数据集，浏览同步视频、动作曲线与 URDF 回放。"
        items={[
          {
            id: "data-video",
            title: "同步视频",
            caption: "从多相机画面确认每段 episode 的采集状态。",
            icon: FiCamera,
          },
          {
            id: "data-actions",
            title: "动作曲线",
            caption: "快速定位动作尖峰、静止段和异常幅度。",
            icon: FiActivity,
          },
          {
            id: "data-urdf",
            title: "URDF 回放",
            caption: "用机器人姿态验证动作轨迹是否合理。",
            icon: FiCpu,
          },
        ]}
      />
    );
  }

  function TrainingWorkspaceCue() {
    return (
      <WorkspaceFeatureStrip
        workspace="training"
        eyebrow="Training Workspace"
        title="训练配置和曲线工作区"
        caption="查看训练配置、对照 baseline，并打开训练曲线。"
        items={[
          {
            id: "training-baseline",
            title: "Baseline 对照",
            caption: "对照不带 memory 的训练配置。",
            icon: FiTarget,
          },
          {
            id: "training-config",
            title: "参数编辑",
            caption: "编辑 batch、学习率与 memory 参数。",
            icon: FiSliders,
          },
          {
            id: "training-curves",
            title: "W&B 曲线",
            caption: "打开训练 loss、learning rate 和 checkpoint 状态。",
            icon: FiTrendingUp,
          },
        ]}
      />
    );
  }

  function ReplayWorkspaceCue() {
    return (
      <WorkspaceFeatureStrip
        workspace="replay"
        eyebrow="Replay Workspace"
        title="评测查看和回放工作区"
        caption="查看评测结果表格，并回放 SimplerEnv 与 RMBench 视频。"
        items={[
          {
            id: "replay-table",
            title: "最高分表格",
            caption: "自动汇总 CSV/TXT，并高亮当前最高结果。",
            icon: FiAward,
          },
          {
            id: "replay-video",
            title: "视频回放",
            caption: "对照 rollout 视频核查策略行为。",
            icon: FiFilm,
          },
          {
            id: "replay-text",
            title: "结果文本",
            caption: "查看 RMBench 原始 result 文本。",
            icon: FiFileText,
          },
        ]}
      />
    );
  }

  function WandbPanel() {
    return (
      <article className={panelClass}>
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[oklch(0.47_0.055_54)]">
              Weights & Biases
            </p>
            <h2 className="mt-2 text-xl font-semibold">训练曲线监控</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[oklch(0.43_0.025_68)]">
              查看训练 loss、learning rate 与 checkpoint 状态。
            </p>
          </div>
          <Link
            href={dashboard.wandbUrl}
            target="_blank"
            className={primaryButtonClass}
          >
            打开 W&B 控制台
          </Link>
        </div>
      </article>
    );
  }

  function TrainingConfigPanel() {
    const fieldGroups: Array<{
      title: string;
      caption: string;
      icon: React.ReactNode;
      fields: Array<{
        label: string;
        key: Exclude<keyof TrainingEditValues, "memory">;
        value: string;
      }>;
    }> = [
      {
        title: "训练规模",
        caption:
          "控制 batch size、梯度累积步数、总训练步数和 checkpoint 保存频率。",
        icon: <FiLayers aria-hidden="true" className="h-3.5 w-3.5" />,
        fields: [
          {
            label: "Batch Size",
            key: "batchSize",
            value: trainingEdit.batchSize,
          },
          {
            label: "Gradient Accum",
            key: "gradientAccumulationSteps",
            value: trainingEdit.gradientAccumulationSteps,
          },
          {
            label: "Train Steps",
            key: "numTrainSteps",
            value: trainingEdit.numTrainSteps,
          },
          {
            label: "Save Interval",
            key: "saveInterval",
            value: trainingEdit.saveInterval,
          },
        ],
      },
      {
        title: "学习率 Schedule",
        caption: "warmup、peak、decay 阶段与分组学习率。",
        icon: <FiTrendingUp aria-hidden="true" className="h-3.5 w-3.5" />,
        fields: [
          {
            label: "Warmup Steps",
            key: "warmupSteps",
            value: trainingEdit.warmupSteps,
          },
          { label: "Peak LR", key: "peakLr", value: trainingEdit.peakLr },
          {
            label: "Decay Steps",
            key: "decaySteps",
            value: trainingEdit.decaySteps,
          },
          { label: "Decay LR", key: "decayLr", value: trainingEdit.decayLr },
          { label: "Base LR", key: "baseLr", value: trainingEdit.baseLr },
          { label: "Memory LR", key: "memoryLr", value: trainingEdit.memoryLr },
        ],
      },
    ];

    const memoryFields: Array<{
      label: string;
      key: keyof TrainingEditValues["memory"];
      value: string;
    }> = [
      {
        label: "Moment Tokens",
        key: "momentTokenCount",
        value: trainingEdit.memory.momentTokenCount,
      },
      {
        label: "Cache Size",
        key: "cacheSize",
        value: trainingEdit.memory.cacheSize,
      },
      {
        label: "Decision Stride",
        key: "decisionStride",
        value: trainingEdit.memory.decisionStride,
      },
    ];

    function BaselineConfigModule() {
      function baselineSummary(config: TrainingConfigSummary) {
        return `batch ${config.batchSize} / peak lr ${config.peakLr} / memory off`;
      }

      return (
        <section className={`${insetClass} overflow-hidden`}>
          <div className="border-b border-[oklch(0.88_0.02_72)] bg-[oklch(0.975_0.016_75)] px-5 py-3.5">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-[oklch(0.82_0.035_66)] bg-[oklch(0.985_0.012_76)] text-[oklch(0.41_0.095_42)]">
                <FiTarget aria-hidden="true" className="h-3.5 w-3.5" />
              </span>
              <h3 className="text-sm font-semibold text-[oklch(0.25_0.025_62)]">
                Baseline 对照
              </h3>
            </div>
            <p className="mt-1 text-xs leading-5 text-[oklch(0.47_0.03_65)]">
              选择基线配置，与启用 memory 的版本对照。
            </p>
          </div>

          <div className="p-5">
            {baselineConfigs.length > 0 && selectedBaselineConfig ? (
              <div className="grid gap-4">
                <label className="block">
                  <span className="text-xs font-medium uppercase tracking-[0.08em] text-[oklch(0.49_0.02_68)]">
                    选择 Baseline
                  </span>
                  <select
                    value={baselineConfigs.indexOf(selectedBaselineConfig)}
                    onChange={(event) =>
                      selectBaselineConfig(Number(event.target.value))
                    }
                    data-baseline-selector="training-baseline"
                    className={`${selectClass} mt-1.5 w-full`}
                  >
                    {baselineConfigs.map((config, index) => (
                      <option
                        key={config.name}
                        value={index}
                        data-baseline-option={config.name}
                      >
                        {config.name} - {baselineSummary(config)}
                      </option>
                    ))}
                  </select>
                </label>

                <div
                  data-baseline-config={selectedBaselineConfig.name}
                  className="rounded-lg border border-[oklch(0.86_0.023_72)] bg-[oklch(0.985_0.012_76)] p-4"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[oklch(0.47_0.055_54)]">
                    完整配置
                  </p>
                  <p className="mt-1 text-xs text-[oklch(0.43_0.025_68)]">
                    {selectedBaselineConfig.name}
                  </p>
                  <dl className="mt-3 grid gap-x-5 gap-y-3 text-xs text-[oklch(0.43_0.025_68)] lg:grid-cols-2">
                    {[
                      ["config", selectedBaselineConfig.name],
                      ["project", selectedBaselineConfig.projectName],
                      ["exp", selectedBaselineConfig.expName],
                      ["data", selectedBaselineConfig.dataFactory],
                      ["repo", selectedBaselineConfig.repoId],
                      ["model", selectedBaselineConfig.model],
                      ["action horizon", selectedBaselineConfig.actionHorizon],
                      [
                        "discrete state",
                        selectedBaselineConfig.discreteStateInput,
                      ],
                      ["batch", selectedBaselineConfig.batchSize],
                      [
                        "gradient accum",
                        selectedBaselineConfig.gradientAccumulationSteps,
                      ],
                      ["steps", selectedBaselineConfig.numTrainSteps],
                      ["save interval", selectedBaselineConfig.saveInterval],
                      ["warmup", selectedBaselineConfig.warmupSteps],
                      ["peak lr", selectedBaselineConfig.peakLr],
                      ["decay steps", selectedBaselineConfig.decaySteps],
                      ["decay lr", selectedBaselineConfig.decayLr],
                      ["base lr", selectedBaselineConfig.baseLr],
                      ["memory lr", selectedBaselineConfig.memoryLr],
                      ["ema", selectedBaselineConfig.emaDecay],
                      ["wandb", selectedBaselineConfig.wandbEnabled],
                      [
                        "train vision",
                        selectedBaselineConfig.trainVisionEncoder,
                      ],
                      [
                        "lora",
                        selectedBaselineConfig.loraEnabled ? "on" : "off",
                      ],
                      ["memory", "off"],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-[10px] font-medium uppercase tracking-[0.06em] text-[oklch(0.52_0.02_68)]">
                          {label}
                        </dt>
                        <dd className="mt-0.5 break-words font-medium text-[oklch(0.25_0.025_62)]">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            ) : (
              <p className="rounded-lg border border-[oklch(0.84_0.025_72)] bg-[oklch(0.985_0.012_76)] px-4 py-3 text-sm text-[oklch(0.43_0.025_68)]">
                暂未发现指定的 baseline 配置。
              </p>
            )}
          </div>
        </section>
      );
    }

    function ConfigSummaryModule() {
      return (
        <section className={`${insetClass} overflow-hidden`}>
          <div className="border-b border-[oklch(0.88_0.02_72)] bg-[oklch(0.975_0.016_75)] px-5 py-3.5">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-[oklch(0.82_0.035_66)] bg-[oklch(0.985_0.012_76)] text-[oklch(0.41_0.095_42)]">
                <FiFileText aria-hidden="true" className="h-3.5 w-3.5" />
              </span>
              <h3 className="text-sm font-semibold text-[oklch(0.25_0.025_62)]">
                配置摘要
              </h3>
            </div>
          </div>
          <div className="p-5">
            <dl className="grid gap-x-4 gap-y-3 text-sm text-[oklch(0.43_0.025_68)]">
              {[
                ["Config", selectedTrainingConfig?.name],
                ["Project", selectedTrainingConfig?.projectName],
                ["Exp", selectedTrainingConfig?.expName],
                ["Data Factory", selectedTrainingConfig?.dataFactory],
                ["Repo", selectedTrainingConfig?.repoId],
                ["Model", selectedTrainingConfig?.model],
                ["Action Horizon", selectedTrainingConfig?.actionHorizon],
                ["Discrete State", selectedTrainingConfig?.discreteStateInput],
                ["EMA Decay", selectedTrainingConfig?.emaDecay],
                ["W&B", selectedTrainingConfig?.wandbEnabled],
                ["Train Vision", selectedTrainingConfig?.trainVisionEncoder],
                ["LoRA", selectedTrainingConfig?.loraEnabled ? "on" : "off"],
                [
                  "Memory",
                  selectedTrainingConfig?.memory.enabled ? "on" : "off",
                ],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-baseline justify-between gap-3 border-b border-[oklch(0.9_0.018_74)] pb-2 last:border-b-0 last:pb-0"
                >
                  <dt className="text-xs font-medium uppercase tracking-[0.06em] text-[oklch(0.52_0.02_68)]">
                    {label}
                  </dt>
                  <dd className="break-words text-right font-medium text-[oklch(0.25_0.025_62)]">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 border-t border-[oklch(0.88_0.02_72)] pt-4">
              <p className="text-xs font-medium uppercase tracking-[0.06em] text-[oklch(0.52_0.02_68)]">
                Memory 详情
              </p>
              <dl className="mt-2 grid gap-x-4 gap-y-2 text-xs text-[oklch(0.43_0.025_68)]">
                {[
                  ["Layers", selectedTrainingConfig?.memory.layerIndices],
                  [
                    "Initialization",
                    selectedTrainingConfig?.memory.initialization,
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-baseline justify-between gap-3 border-b border-[oklch(0.9_0.018_74)] pb-2 last:border-b-0 last:pb-0"
                  >
                    <dt className="text-[10px] font-medium uppercase tracking-[0.06em] text-[oklch(0.52_0.02_68)]">
                      {label}
                    </dt>
                    <dd className="break-words text-right font-medium text-[oklch(0.25_0.025_62)]">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>
      );
    }

    const paramGroupClass =
      "rounded-xl border border-[oklch(0.84_0.025_72)] bg-[oklch(0.98_0.014_76)] overflow-hidden";
    const paramFieldClass =
      "w-full rounded-lg border border-[oklch(0.82_0.02_72)] bg-[oklch(0.995_0.008_76)] px-3 py-2.5 text-sm text-[oklch(0.25_0.025_62)] outline-none transition hover:border-[oklch(0.68_0.05_55)] focus:border-[oklch(0.56_0.11_42)] focus:ring-[3px] focus:ring-[oklch(0.76_0.08_50_/_0.18)]";

    return (
      <section className={panelClass}>
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[oklch(0.47_0.055_54)]">
              OpenPI Training Config
            </p>
            <h2 className="mt-2 text-xl font-semibold text-[oklch(0.25_0.025_62)]">
              训练超参数配置
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[oklch(0.43_0.025_68)]">
              查看并编辑当前训练配置，保存后写回配置文件。
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <select
              value={trainingConfigIndex}
              onChange={(event) =>
                selectTrainingConfig(Number(event.target.value))
              }
              data-training-config-selector="preserve-scroll"
              className={`${selectClass} min-w-0 md:min-w-72`}
            >
              {trainingConfigs.map((config, index) => (
                <option key={config.name} value={index}>
                  {config.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={saveTrainingConfig}
              disabled={trainingSaveState === "saving"}
              className={primaryButtonClass}
            >
              {trainingSaveState === "saving" ? "保存中..." : "保存配置"}
            </button>
          </div>
        </div>

        {selectedTrainingConfig ? (
          <div className="mt-6 grid gap-5 xl:grid-cols-[1.2fr_1fr]">
            <div className="grid gap-4">
              {fieldGroups.map((group) => (
                <div key={group.title} className={paramGroupClass}>
                  <div className="border-b border-[oklch(0.88_0.02_72)] bg-[oklch(0.975_0.016_75)] px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-[oklch(0.82_0.035_66)] bg-[oklch(0.985_0.012_76)] text-[oklch(0.41_0.095_42)]">
                        {group.icon}
                      </span>
                      <h3 className="text-sm font-semibold text-[oklch(0.25_0.025_62)]">
                        {group.title}
                      </h3>
                    </div>
                    <p className="mt-1.5 text-xs leading-5 text-[oklch(0.47_0.03_65)]">
                      {group.caption}
                    </p>
                  </div>
                  <div className="p-5">
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {group.fields.map((field) => (
                        <label key={field.key} className="block">
                          <span className="text-xs font-medium uppercase tracking-[0.06em] text-[oklch(0.52_0.02_68)]">
                            {field.label}
                          </span>
                          <input
                            value={field.value}
                            onChange={(event) =>
                              updateTrainingEdit(field.key, event.target.value)
                            }
                            className={`${paramFieldClass} mt-1.5`}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              ))}

              <div className={paramGroupClass}>
                <div className="border-b border-[oklch(0.88_0.02_72)] bg-[oklch(0.975_0.016_75)] px-5 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-[oklch(0.82_0.035_66)] bg-[oklch(0.985_0.012_76)] text-[oklch(0.41_0.095_42)]">
                      <FiCpu aria-hidden="true" className="h-3.5 w-3.5" />
                    </span>
                    <h3 className="text-sm font-semibold text-[oklch(0.25_0.025_62)]">
                      Memory 参数
                    </h3>
                    <span
                      className={`ml-auto rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${
                        selectedTrainingConfig.memory.enabled
                          ? "bg-[oklch(0.93_0.04_62)] text-[oklch(0.35_0.06_52)]"
                          : "bg-[oklch(0.9_0.02_72)] text-[oklch(0.47_0.03_65)]"
                      }`}
                    >
                      {selectedTrainingConfig.memory.enabled
                        ? "已启用"
                        : "已禁用"}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-5 text-[oklch(0.47_0.03_65)]">
                    Memory 模块的 token 数量、缓存大小和决策步幅。
                  </p>
                </div>
                <div className="p-5">
                  <div className="grid gap-4 md:grid-cols-3">
                    {memoryFields.map((field) => (
                      <label key={field.key} className="block">
                        <span className="text-xs font-medium uppercase tracking-[0.06em] text-[oklch(0.52_0.02_68)]">
                          {field.label}
                        </span>
                        <input
                          value={field.value}
                          onChange={(event) =>
                            updateMemoryEdit(field.key, event.target.value)
                          }
                          className={`${paramFieldClass} mt-1.5`}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {trainingSaveMessage ? (
                <div
                  className={`rounded-xl border px-4 py-3 text-sm ${
                    trainingSaveState === "error"
                      ? "border-[oklch(0.62_0.14_32)] bg-[oklch(0.96_0.035_32)] text-[oklch(0.43_0.12_32)]"
                      : "border-[oklch(0.76_0.065_55)] bg-[oklch(0.94_0.045_62)] text-[oklch(0.29_0.045_52)]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        trainingSaveState === "error"
                          ? "bg-[oklch(0.62_0.14_32)]"
                          : "bg-[oklch(0.56_0.11_42)]"
                      }`}
                    />
                    {trainingSaveMessage}
                  </div>
                </div>
              ) : null}
            </div>

            <aside className="grid gap-5 content-start">
              <BaselineConfigModule />
              <ConfigSummaryModule />
            </aside>
          </div>
        ) : (
          <div className={`${insetClass} mt-6 overflow-hidden rounded-xl p-5`}>
            <p className="text-sm text-[oklch(0.43_0.025_68)]">
              未读取到训练配置。检查 OPENPI_TRAINING_CONFIG_PATH 或
              openpi-simpler 本地路径。
            </p>
          </div>
        )}
      </section>
    );
  }

  function SimplerPanel() {
    const simplerTrendSteps = selectedSimplerRun?.steps ?? [];
    const trendColumnCount = Math.max(1, simplerTrendSteps.length);

    return (
      <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <article className={panelClass}>
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="text-lg font-black tracking-[0.01em] text-[oklch(0.34_0.085_42)]">
                SimplerEnv
              </p>
              <h2 className="mt-2 text-xl font-semibold">仿真评测趋势</h2>
            </div>
            <select
              value={simplerRunIndex}
              onChange={(event) => selectSimplerRun(Number(event.target.value))}
              data-simpler-run-selector="preserve-scroll"
              className={selectClass}
            >
              {dashboard.simpler.runs.map((run, index) => (
                <option key={`${run.configName}-${run.expName}`} value={index}>
                  {run.configName}
                  {run.expName ? ` / ${run.expName}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className={`${insetClass} p-4`}>
              <p className="text-sm text-[oklch(0.43_0.025_68)]">
                Best Avg Entire
              </p>
              <p className="mt-2 text-2xl font-semibold text-[oklch(0.25_0.025_62)]">
                {formatPercent(bestSimplerStep?.averageEntire)}
              </p>
              <p className="mt-1 text-sm text-[oklch(0.43_0.025_68)]">
                checkpoint {bestSimplerStep?.step ?? "-"}
              </p>
            </div>
            <div className={`${insetClass} p-4`}>
              <p className="text-sm text-[oklch(0.43_0.025_68)]">
                Latest Avg Entire
              </p>
              <p className="mt-2 text-2xl font-semibold text-[oklch(0.46_0.1_42)]">
                {formatPercent(latestSimplerStep?.averageEntire)}
              </p>
              <p className="mt-1 text-sm text-[oklch(0.43_0.025_68)]">
                checkpoint {latestSimplerStep?.step ?? "-"}
              </p>
            </div>
          </div>

          <div
            data-simpler-trend-chart="avg-entire"
            className="mt-5 overflow-x-auto border-y border-[oklch(0.86_0.023_72)] py-5"
          >
            <div className="min-w-[420px]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-[oklch(0.25_0.025_62)]">
                    Avg Entire by checkpoint
                  </p>
                  <p className="mt-1 text-xs text-[oklch(0.43_0.025_68)]">
                    最高 checkpoint 使用深色柱标出。
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs text-[oklch(0.43_0.025_68)]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-[oklch(0.56_0.11_42)]" />
                    avg
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-[oklch(0.25_0.025_62)]" />
                    best
                  </span>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-[34px_minmax(0,1fr)] gap-3">
                <div className="flex h-52 flex-col justify-between text-right text-[10px] font-medium text-[oklch(0.49_0.02_68)]">
                  <span>100%</span>
                  <span>75%</span>
                  <span>50%</span>
                  <span>25%</span>
                  <span>0%</span>
                </div>
                <div className="relative h-52 border-l border-b border-[oklch(0.8_0.03_70)]">
                  <div className="absolute inset-0 grid grid-rows-4">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <span
                        key={index}
                        className="border-t border-[oklch(0.9_0.026_72)]"
                      />
                    ))}
                  </div>
                  <div
                    className="relative grid h-full items-end gap-2 px-3"
                    style={{
                      gridTemplateColumns: `repeat(${trendColumnCount}, minmax(28px, 1fr))`,
                    }}
                  >
                    {simplerTrendSteps.map((step) => {
                      const score = Math.max(
                        0,
                        Math.min(1, step.averageEntire ?? 0),
                      );
                      const isBest = bestSimplerStep?.step === step.step;
                      return (
                        <div
                          key={step.step}
                          className="flex h-full min-w-0 flex-col justify-end gap-2"
                        >
                          <div className="flex flex-1 items-end justify-center">
                            <div
                              data-simpler-trend-bar={step.step}
                              title={`checkpoint ${step.step}: ${formatPercent(step.averageEntire)}`}
                              className={`w-full max-w-10 rounded-t-md transition ${
                                isBest
                                  ? "bg-[oklch(0.25_0.025_62)]"
                                  : "bg-[oklch(0.56_0.11_42)]"
                              }`}
                              style={{
                                height: `${Math.max(4, score * 100)}%`,
                              }}
                            />
                          </div>
                          <span className="truncate text-center text-[10px] font-medium text-[oklch(0.43_0.025_68)]">
                            {step.step}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {selectedSimplerRun?.steps.map((step) => (
              <div
                key={step.step}
                className="grid gap-3 md:grid-cols-[86px_1fr_70px] md:items-center"
              >
                <p className="text-sm font-medium text-[oklch(0.25_0.025_62)]">
                  {step.step}
                </p>
                <div className="h-2.5 overflow-hidden rounded-full bg-[oklch(0.9_0.026_72)]">
                  <div
                    className="h-full rounded-full bg-[oklch(0.56_0.11_42)]"
                    style={{
                      width: `${Math.max(0, Math.min(100, (step.averageEntire ?? 0) * 100))}%`,
                    }}
                  />
                </div>
                <p className="text-sm text-[oklch(0.43_0.025_68)]">
                  {formatPercent(step.averageEntire)}
                </p>
              </div>
            ))}
          </div>
        </article>

        <article className={panelClass}>
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[oklch(0.47_0.055_54)]">
                当前 checkpoint
              </p>
              <h2 className="mt-2 text-xl font-semibold">四任务结果</h2>
            </div>
            <select
              value={simplerStepIndex}
              onChange={(event) =>
                selectSimplerStep(Number(event.target.value))
              }
              data-simpler-step-selector="preserve-scroll"
              className={selectClass}
            >
              {selectedSimplerRun?.steps.map((step, index) => (
                <option key={step.step} value={index}>
                  checkpoint {step.step} / avg{" "}
                  {formatPercent(step.averageEntire)}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {selectedSimplerStep?.tasks.map((task) => (
              <div key={task.name} className={`${insetClass} p-4`}>
                <p className="font-semibold text-[oklch(0.25_0.025_62)]">
                  {task.name}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-[oklch(0.43_0.025_68)]">
                  <span>partial {formatPercent(task.partial)}</span>
                  <span>entire {formatPercent(task.entire)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 border-t border-[oklch(0.84_0.025_72)] pt-5">
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[oklch(0.47_0.055_54)]">
                  SimplerEnv 回放
                </p>
                <h3 className="mt-2 text-lg font-semibold">Rollout 视频</h3>
              </div>
              <select
                value={simplerVideoIndex}
                onChange={(event) =>
                  selectSimplerVideo(Number(event.target.value))
                }
                data-simpler-video-selector="preserve-scroll"
                className={`${selectClass} min-w-0 md:min-w-72`}
              >
                {selectedSimplerStep?.videos.map((video, index) => (
                  <option key={video.relativePath} value={index}>
                    {video.label}
                  </option>
                ))}
              </select>
            </div>
            {selectedSimplerVideo ? (
              <>
                <div className="mx-auto mt-5 aspect-video w-full max-w-xl overflow-hidden rounded-2xl bg-[oklch(0.18_0.015_60)]">
                  <video
                    data-simpler-video-player="stable"
                    controls
                    preload="metadata"
                    className="h-full w-full object-contain"
                    src={mediaUrl(selectedSimplerVideo.relativePath)}
                  />
                </div>
                <div className="mt-4 grid max-h-40 gap-2 overflow-y-auto md:grid-cols-2">
                  {selectedSimplerStep?.videos.map((video, index) => (
                    <button
                      key={video.relativePath}
                      type="button"
                      onClick={() => selectSimplerVideo(index)}
                      data-simpler-video-option={index}
                      className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                        index === simplerVideoIndex
                          ? "border-[oklch(0.59_0.105_43)] bg-[oklch(0.94_0.045_62)] text-[oklch(0.25_0.025_62)]"
                          : "border-[oklch(0.84_0.025_72)] bg-[oklch(0.96_0.018_75)] text-[oklch(0.43_0.025_68)] hover:border-[oklch(0.59_0.105_43)] hover:text-[oklch(0.25_0.025_62)]"
                      }`}
                    >
                      <span className="block font-medium">{video.label}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p
                className={`${insetClass} mt-5 p-4 text-sm text-[oklch(0.43_0.025_68)]`}
              >
                当前 checkpoint 未发现 SimplerEnv 视频文件。
              </p>
            )}
          </div>
        </article>
      </section>
    );
  }

  function ResultTablePanel() {
    const benchmarkSections: Array<{
      benchmark: EvaluationBenchmark;
      title: string;
      caption: string;
      rows: EvaluationResultRow[];
    }> = [
      {
        benchmark: "SimplerEnv",
        title: "SimplerEnv 结果",
        caption: "CSV 汇总的 checkpoint avg-entire 和任务指标。",
        rows: resultRows.filter((row) => row.benchmark === "SimplerEnv"),
      },
      {
        benchmark: "RMBench",
        title: "RMBench 结果",
        caption: "TXT 结果文本解析出的 timestamp score。",
        rows: resultRows.filter((row) => row.benchmark === "RMBench"),
      },
    ];

    function bestRowFor(rows: EvaluationResultRow[]) {
      return rows.reduce<EvaluationResultRow | null>((best, row) => {
        if (row.score === null) return best;
        if (best?.score === null || best === null) return row;
        return row.score > best.score ? row : best;
      }, null);
    }

    const selectedSection =
      benchmarkSections.find(
        (section) => section.benchmark === selectedResultBenchmark,
      ) ?? benchmarkSections[0];
    const selectedRows = selectedSection.rows;
    const bestRow = bestRowFor(selectedRows);

    return (
      <section className={panelClass}>
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[oklch(0.47_0.055_54)]">
              Evaluation Results
            </p>
            <h2 className="mt-2 text-xl font-semibold">评测结果表格</h2>
          </div>
          <div className="inline-flex rounded-xl border border-[oklch(0.84_0.025_72)] bg-[oklch(0.96_0.018_75)] p-1">
            {benchmarkSections.map((section) => (
              <button
                key={section.benchmark}
                type="button"
                onClick={() => selectResultBenchmark(section.benchmark)}
                data-result-benchmark-tab={section.benchmark}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  section.benchmark === selectedResultBenchmark
                    ? "bg-[oklch(0.25_0.025_62)] text-[oklch(0.98_0.012_76)]"
                    : "text-[oklch(0.43_0.025_68)] hover:text-[oklch(0.25_0.025_62)]"
                }`}
              >
                {section.benchmark}
              </button>
            ))}
          </div>
        </div>

        <section
          data-result-table="switchable"
          data-selected-benchmark={selectedSection.benchmark}
          className="mt-5 overflow-hidden rounded-xl border border-[oklch(0.84_0.025_72)] bg-[oklch(0.98_0.014_76)]"
        >
          <div className="flex flex-col justify-between gap-3 border-b border-[oklch(0.84_0.025_72)] bg-[oklch(0.965_0.018_75)] px-4 py-3 md:flex-row md:items-center">
            <div>
              <h3 className="text-base font-semibold">
                {selectedSection.title}
              </h3>
              <p className="mt-1 text-sm text-[oklch(0.43_0.025_68)]">
                {selectedSection.caption}
              </p>
            </div>
            <div
              data-benchmark-best="selected"
              className="rounded-xl border border-[oklch(0.76_0.065_55)] bg-[oklch(0.94_0.045_62)] px-4 py-2 text-sm text-[oklch(0.29_0.045_52)]"
            >
              <span className="block text-xs font-semibold uppercase tracking-[0.12em] text-[oklch(0.47_0.055_54)]">
                当前最高
              </span>
              <span className="mt-1 block font-semibold">
                {bestRow
                  ? `${bestRow.configName} / ${formatPercent(bestRow.score)}`
                  : "暂无可比较分数"}
              </span>
            </div>
          </div>

          <div className="max-h-80 overflow-auto">
            <table className="w-full min-w-[820px] border-collapse text-left text-sm">
              <thead className="sticky top-0 bg-[oklch(0.92_0.028_72)] text-xs font-semibold uppercase tracking-[0.08em] text-[oklch(0.47_0.055_54)]">
                <tr>
                  <th className="px-4 py-3">Config</th>
                  <th className="px-4 py-3">Exp</th>
                  <th className="px-4 py-3">Step / Time</th>
                  <th className="px-4 py-3">Task</th>
                  <th className="px-4 py-3">Metric</th>
                  <th className="px-4 py-3 text-right">Partial</th>
                  <th className="px-4 py-3 text-right">Score</th>
                  <th className="px-4 py-3">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[oklch(0.86_0.023_72)] bg-[oklch(0.985_0.012_76)]">
                {selectedRows.map((row) => {
                  const isBest = bestRow?.id === row.id;
                  return (
                    <tr
                      key={row.id}
                      className={
                        isBest
                          ? "best-result-row bg-[oklch(0.95_0.055_68)]"
                          : "bg-[oklch(0.985_0.012_76)]"
                      }
                    >
                      <td className="px-4 py-3 font-medium text-[oklch(0.25_0.025_62)]">
                        {row.configName}
                      </td>
                      <td className="px-4 py-3 text-[oklch(0.43_0.025_68)]">
                        {row.expName || "-"}
                      </td>
                      <td className="px-4 py-3 text-[oklch(0.43_0.025_68)]">
                        {row.checkpoint
                          ? `checkpoint ${row.checkpoint}`
                          : row.timestamp}
                      </td>
                      <td className="px-4 py-3 text-[oklch(0.43_0.025_68)]">
                        {row.taskName}
                      </td>
                      <td className="px-4 py-3 text-[oklch(0.43_0.025_68)]">
                        {row.metricName}
                      </td>
                      <td className="px-4 py-3 text-right text-[oklch(0.43_0.025_68)]">
                        {formatPercent(row.partial)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-[oklch(0.25_0.025_62)]">
                        {formatPercent(row.score)}
                      </td>
                      <td className="px-4 py-3 text-[oklch(0.43_0.025_68)]">
                        {row.source}
                      </td>
                    </tr>
                  );
                })}
                {selectedRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-5 text-sm text-[oklch(0.43_0.025_68)]"
                    >
                      暂无 {selectedSection.benchmark} 结果。
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    );
  }

  function RmbenchPanel() {
    return (
      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <article className={panelClass}>
          <p className="text-lg font-black tracking-[0.01em] text-[oklch(0.34_0.08_252)]">
            RMBench
          </p>
          <h2 className="mt-2 text-xl font-semibold">Swap Blocks 回放</h2>
          <div className="mt-5 grid gap-3">
            <select
              value={rmbenchRunIndex}
              onChange={(event) => selectRmbenchRun(Number(event.target.value))}
              data-rmbench-run-selector="preserve-scroll"
              className={selectClass}
            >
              {dashboard.rmbench.runs.map((run, index) => (
                <option
                  key={`${run.configName}-${run.taskName}-${run.expName}`}
                  value={index}
                >
                  {run.configName} / {run.taskName} / {run.expName}
                </option>
              ))}
            </select>
            <select
              value={timestampIndex}
              onChange={(event) => {
                selectRmbenchTimestamp(Number(event.target.value));
              }}
              data-rmbench-timestamp-selector="preserve-scroll"
              className={selectClass}
            >
              {selectedRmbenchRun?.timestamps.map((item, index) => (
                <option key={item.timestamp} value={index}>
                  {item.timestamp}
                </option>
              ))}
            </select>
          </div>
          <div className={`${insetClass} mt-5 p-4`}>
            <p className="text-sm text-[oklch(0.43_0.025_68)]">result</p>
            <p className="mt-2 text-2xl font-semibold text-[oklch(0.46_0.1_42)]">
              {formatPercent(selectedTimestamp?.score)}
            </p>
            <pre className="mt-4 max-h-56 overflow-y-auto whitespace-pre-wrap text-xs leading-6 text-[oklch(0.43_0.025_68)]">
              {selectedTimestamp?.resultText}
            </pre>
          </div>
        </article>

        <article className={panelClass}>
          <h2 className="text-xl font-semibold">Episode 视频</h2>
          {selectedRmbenchVideo ? (
            <div
              data-video-frame="compact"
              data-video-crop="horizontal"
              data-rmbench-video-frame="inline"
              className="mx-auto mt-5 w-full max-w-md overflow-hidden rounded-2xl bg-[oklch(0.18_0.015_60)]"
              style={{ aspectRatio: rmbenchVideoRatio }}
            >
              <video
                data-rmbench-video-player="stable"
                controls
                preload="metadata"
                className="block h-full max-w-none object-contain"
                src={mediaUrl(selectedRmbenchVideo.relativePath)}
                style={{
                  width: `${RMBENCH_VIDEO_WIDTH_PERCENT}%`,
                  marginLeft: `-${RMBENCH_VIDEO_OFFSET_PERCENT}%`,
                }}
                onLoadedMetadata={(event) => {
                  const video = event.currentTarget;
                  if (video.videoWidth > 0 && video.videoHeight > 0) {
                    setRmbenchVideoRatio(
                      croppedRmbenchAspectRatio(
                        video.videoWidth,
                        video.videoHeight,
                      ),
                    );
                  }
                }}
              />
            </div>
          ) : null}
          <div className="mt-5 grid max-h-64 gap-2 overflow-y-auto md:grid-cols-3">
            {selectedTimestamp?.videos.map((video, index) => (
              <button
                key={video.relativePath}
                type="button"
                onClick={() => selectRmbenchVideo(index)}
                data-rmbench-video-option={index}
                className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                  index === rmbenchVideoIndex
                    ? "border-[oklch(0.59_0.105_43)] bg-[oklch(0.94_0.045_62)] text-[oklch(0.25_0.025_62)]"
                    : "border-[oklch(0.84_0.025_72)] bg-[oklch(0.96_0.018_75)] text-[oklch(0.43_0.025_68)] hover:border-[oklch(0.59_0.105_43)] hover:text-[oklch(0.25_0.025_62)]"
                }`}
              >
                {video.name}
              </button>
            ))}
          </div>
        </article>
      </section>
    );
  }

  function DataPanel() {
    const selectedEpisodeIndex = normalizedEpisodeIndex();
    const middleEpisodeIndex = Math.max(
      0,
      Math.floor((dashboard.acone.episodes - 1) / 2),
    );
    const lastEpisodeIndex = Math.max(0, dashboard.acone.episodes - 1);
    const averageFrames = Math.round(
      dashboard.acone.frames / Math.max(1, dashboard.acone.episodes),
    );
    const representativeSamples: Array<{
      label: string;
      index: number;
      caption: string;
    }> = [
      {
        label: "首条样本",
        index: 0,
        caption: "快速确认数据起点和命名结构",
      },
      {
        label: "中位样本",
        index: middleEpisodeIndex,
        caption: "抽查中段采集状态和动作分布",
      },
      {
        label: "末条样本",
        index: lastEpisodeIndex,
        caption: "确认末段 episode 可正常打开",
      },
    ];

    return (
      <section className={panelClass}>
        <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[oklch(0.47_0.055_54)]">
              ACONE
            </p>
            <h2 className="mt-2 text-xl font-semibold">数据查看</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[oklch(0.43_0.025_68)]">
              {dashboard.acone.datasetName} 包含{" "}
              {formatInteger(dashboard.acone.episodes)} 条轨迹、
              {formatInteger(dashboard.acone.frames)} 帧。
            </p>
          </div>
          <Link
            href={dashboard.acone.datasetRoute}
            className={primaryButtonClass}
          >
            打开 ACONE 数据集
          </Link>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <div className="overflow-hidden rounded-2xl border border-[oklch(0.82_0.028_72)] bg-[oklch(0.18_0.015_60)]">
            <div className="relative">
              <Image
                src="/images/acone-data-preview.jpg"
                alt="ACONE 三路相机数据预览图"
                width={960}
                height={480}
                priority={mode === "data"}
                className="aspect-[2/1] h-full w-full object-cover"
              />
              <div className="absolute bottom-3 left-3 rounded-lg border border-[oklch(0.95_0.01_75_/_0.28)] bg-[oklch(0.2_0.015_60_/_0.82)] px-3 py-2 text-xs font-medium text-[oklch(0.96_0.012_76)]">
                episode_{selectedEpisodeIndex}
              </div>
            </div>
          </div>

          <aside className="grid gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[oklch(0.47_0.055_54)]">
                ACONE 数据概览
              </p>
              <h3 className="mt-2 text-lg font-semibold text-[oklch(0.25_0.025_62)]">
                ACONE 三路相机预览
              </h3>
              <p className="mt-2 text-sm leading-6 text-[oklch(0.43_0.025_68)]">
                head、left_wrist 与 right_wrist
                三路视角的同步预览，搭配动作曲线和 URDF 回放检查。
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl border border-[oklch(0.86_0.023_72)] bg-[oklch(0.96_0.018_75)] p-4">
              {[
                ["dataset", dashboard.acone.datasetName],
                ["episodes", formatInteger(dashboard.acone.episodes)],
                ["frames", formatInteger(dashboard.acone.frames)],
                ["avg frames", formatInteger(averageFrames)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs uppercase text-[oklch(0.49_0.02_68)]">
                    {label}
                  </dt>
                  <dd className="mt-1 truncate text-sm font-semibold text-[oklch(0.25_0.025_62)]">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="grid gap-2">
              <Link
                href={aconeEpisodeRoute(selectedEpisodeIndex)}
                className={primaryButtonClass}
              >
                从当前 episode 预览进入
              </Link>
              <button
                type="button"
                onClick={copyDataSummary}
                className="rounded-xl border border-[oklch(0.78_0.045_58)] bg-[oklch(0.985_0.012_76)] px-4 py-2 text-sm font-medium text-[oklch(0.28_0.04_52)] transition hover:border-[oklch(0.56_0.11_42)]"
              >
                复制数据摘要
              </button>
            </div>
          </aside>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_0.85fr]">
          <div className="rounded-2xl border border-[oklch(0.86_0.023_72)] bg-[oklch(0.96_0.018_75)] p-4">
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
              <div>
                <h3 className="text-base font-semibold text-[oklch(0.25_0.025_62)]">
                  Episode 快速定位
                </h3>
                <p className="mt-1 text-sm text-[oklch(0.43_0.025_68)]">
                  输入 episode 序号后直接进入数据清洗视图。
                </p>
              </div>
              <Link
                href={aconeEpisodeRoute(selectedEpisodeIndex)}
                className={primaryButtonClass}
              >
                打开 episode
              </Link>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
              <label className="block">
                <span className="text-xs uppercase text-[oklch(0.49_0.02_68)]">
                  episode index
                </span>
                <input
                  type="number"
                  min={0}
                  max={Math.max(0, dashboard.acone.episodes - 1)}
                  value={dataEpisodeInput}
                  onChange={(event) => {
                    setDataEpisodeInput(event.target.value);
                    setDataCopyState("idle");
                  }}
                  className={`${fieldClass} mt-1`}
                />
              </label>
              <p className="rounded-xl border border-[oklch(0.84_0.025_72)] bg-[oklch(0.985_0.012_76)] px-3 py-2 text-sm text-[oklch(0.43_0.025_68)]">
                将打开 episode_{selectedEpisodeIndex}
              </p>
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-3">
              {[
                ["首条", 0],
                ["中位", middleEpisodeIndex],
                ["末条", lastEpisodeIndex],
              ].map(([label, index]) => (
                <Link
                  key={label}
                  href={aconeEpisodeRoute(Number(index))}
                  className="rounded-xl border border-[oklch(0.84_0.025_72)] bg-[oklch(0.985_0.012_76)] px-3 py-2 text-sm text-[oklch(0.43_0.025_68)] transition hover:border-[oklch(0.59_0.105_43)] hover:text-[oklch(0.25_0.025_62)]"
                >
                  {label} episode_{index}
                </Link>
              ))}
            </div>

            {dataCopyState !== "idle" ? (
              <p
                className={`mt-4 rounded-xl border px-3 py-2 text-sm ${
                  dataCopyState === "copied"
                    ? "border-[oklch(0.78_0.045_58)] bg-[oklch(0.985_0.012_76)] text-[oklch(0.43_0.025_68)]"
                    : "border-[oklch(0.62_0.14_32)] bg-[oklch(0.96_0.035_32)] text-[oklch(0.43_0.12_32)]"
                }`}
              >
                {dataCopyState === "copied"
                  ? "数据摘要已复制"
                  : "复制失败，请检查浏览器剪贴板权限"}
              </p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-[oklch(0.86_0.023_72)] bg-[oklch(0.96_0.018_75)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-[oklch(0.25_0.025_62)]">
                  代表样本抽查
                </h3>
                <p className="mt-1 text-sm text-[oklch(0.43_0.025_68)]">
                  打开首条、中位和末条 episode，快速判断数据集是否完整可用。
                </p>
              </div>
              <span className="rounded-lg border border-[oklch(0.84_0.025_72)] bg-[oklch(0.985_0.012_76)] px-2.5 py-1 text-xs font-semibold text-[oklch(0.43_0.025_68)]">
                {formatInteger(dashboard.acone.episodes)} 条
              </span>
            </div>
            <div className="mt-4 grid gap-2">
              {representativeSamples.map((sample) => (
                <Link
                  key={sample.label}
                  href={aconeEpisodeRoute(sample.index)}
                  className="rounded-xl border border-[oklch(0.84_0.025_72)] bg-[oklch(0.985_0.012_76)] p-3 transition hover:border-[oklch(0.59_0.105_43)] hover:bg-[oklch(0.99_0.012_76)]"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span>
                      <span className="block text-sm font-semibold text-[oklch(0.25_0.025_62)]">
                        {sample.label}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-[oklch(0.43_0.025_68)]">
                        {sample.caption}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-lg border border-[oklch(0.84_0.025_72)] px-2.5 py-1 text-xs font-semibold text-[oklch(0.43_0.025_68)]">
                      episode_{sample.index}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <main className="min-h-screen bg-[oklch(0.96_0.018_75)] px-4 pb-10 text-[oklch(0.25_0.025_62)] md:px-6">
      <WorkspaceHeader />
      <div className="mx-auto grid max-w-7xl gap-5">
        {showOverview ? <OverviewEntryPanel /> : null}
        {showData ? (
          <>
            <DataWorkspaceCue />
            <DataPanel />
          </>
        ) : null}
        {showTraining ? (
          <>
            <TrainingWorkspaceCue />
            <article className={panelClass}>
              <TrainingCurves />
            </article>
            <WandbPanel />
            <TrainingConfigPanel />
          </>
        ) : null}
        {showReplay ? (
          <>
            <ReplayWorkspaceCue />
            <ResultTablePanel />
            <SimplerPanel />
            <RmbenchPanel />
          </>
        ) : null}
      </div>
    </main>
  );
}
