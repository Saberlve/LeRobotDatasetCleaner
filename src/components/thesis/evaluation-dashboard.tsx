"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
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
  FiPlayCircle,
  FiSliders,
  FiTarget,
  FiTrendingUp,
} from "react-icons/fi";

import type { EvaluationDashboard } from "@/server/eval-results/summary";
import type { TrainingConfigSummary } from "@/server/eval-results/training-config";

type WorkbenchMode = "overview" | "data" | "training" | "replay";

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
const RMBENCH_VIDEO_WIDTH_PERCENT =
  10000 / RMBENCH_VIDEO_VISIBLE_WIDTH_PERCENT;
const RMBENCH_VIDEO_OFFSET_PERCENT =
  (RMBENCH_VIDEO_SIDE_CROP_PERCENT * 100) /
  RMBENCH_VIDEO_VISIBLE_WIDTH_PERCENT;

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
    caption: "平台入口",
    icon: FiBarChart2,
  },
  {
    mode: "data",
    href: "/evaluation/data",
    label: "数据查看",
    caption: "ACONE 与清洗工具",
    icon: FiDatabase,
  },
  {
    mode: "training",
    href: "/evaluation/training",
    label: "训练配置和曲线",
    caption: "config.py 与 W&B",
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
  const baselineConfigs = trainingConfigs.filter((config) => config.isBaseline);
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
  const firstVideo = selectedTimestamp?.videos[0];
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
  const bestResultRow = dashboard.results.bestRow;

  useEffect(() => {
    setTrainingEdit(trainingEditValues(selectedTrainingConfig));
    setTrainingSaveState("idle");
    setTrainingSaveMessage("");
  }, [selectedTrainingConfig]);

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
  }, [firstVideo]);

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
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[oklch(0.43_0.025_68)]">
              将数据入口、训练配置、W&B 曲线、SimplerEnv checkpoint 和 RMBench
              rollout 放在同一套工作台里。
            </p>
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
        caption: "进入 ACONE 真实数据、episode 定位、视频同步和清洗检查。",
        meta: `${formatInteger(dashboard.acone.episodes)} episodes / ${formatInteger(dashboard.acone.frames)} frames`,
        action: "进入数据查看",
        icon: FiDatabase,
      },
      {
        href: "/evaluation/training",
        label: "Training",
        title: "训练配置和曲线",
        caption: "编辑 OpenPI config.py，打开 W&B，并对齐训练参数。",
        meta: `${formatInteger(platformStats.trainingConfigs)} configs`,
        action: "进入训练工作区",
        icon: FiBarChart2,
      },
      {
        href: "/evaluation/replay",
        label: "Replay",
        title: "评测查看和回放",
        caption: "查看 SimplerEnv checkpoint、RMBench 分数和 rollout 视频。",
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
          <p className="max-w-xl text-sm leading-6 text-[oklch(0.43_0.025_68)]">
            总览只保留入口。具体控件、视频和配置表单放在对应工作区里，减少首屏负担。
          </p>
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
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.38fr)] lg:items-stretch">
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
        caption="把真实数据入口、同步视频、动作曲线和 URDF 回放放在同一页，减少抽查 episode 时的跳转成本。"
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
        image={{
          src: "/images/acone-data-preview.jpg",
          alt: "ACONE 预览图",
          label: "ACONE 预览图",
        }}
      />
    );
  }

  function TrainingWorkspaceCue() {
    return (
      <WorkspaceFeatureStrip
        workspace="training"
        eyebrow="Training Workspace"
        title="训练配置和曲线工作区"
        caption="固定 baseline，对齐 memory 配置，并把训练曲线入口留在配置编辑附近。"
        items={[
          {
            id: "training-baseline",
            title: "Baseline 对照",
            caption: "不带 memory 的配置固定归入 baseline。",
            icon: FiTarget,
          },
          {
            id: "training-config",
            title: "参数编辑",
            caption: "集中编辑 batch、学习率和 memory 参数。",
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
        caption="把 CSV/TXT 结果、最高分识别、SimplerEnv 和 RMBench 视频回放放在同一条证据链上。"
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
            caption: "保留 RMBench 原始 result 文本，方便复核。",
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
              外接 W&B 项目页面，用于查看 loss、learning rate、checkpoint
              保存和实验运行状态。若浏览器限制嵌入，可直接打开控制台。
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
      fields: Array<{
        label: string;
        key: Exclude<keyof TrainingEditValues, "memory">;
        value: string;
      }>;
    }> = [
      {
        title: "训练规模",
        caption: "控制 batch、梯度累积、训练步数和 checkpoint 保存频率。",
        fields: [
          { label: "batch", key: "batchSize", value: trainingEdit.batchSize },
          {
            label: "accum",
            key: "gradientAccumulationSteps",
            value: trainingEdit.gradientAccumulationSteps,
          },
          {
            label: "steps",
            key: "numTrainSteps",
            value: trainingEdit.numTrainSteps,
          },
          {
            label: "save",
            key: "saveInterval",
            value: trainingEdit.saveInterval,
          },
        ],
      },
      {
        title: "学习率 schedule",
        caption: "把 warmup、peak、decay 和分组学习率放在同一处对齐。",
        fields: [
          {
            label: "warmup",
            key: "warmupSteps",
            value: trainingEdit.warmupSteps,
          },
          { label: "peak lr", key: "peakLr", value: trainingEdit.peakLr },
          {
            label: "decay steps",
            key: "decaySteps",
            value: trainingEdit.decaySteps,
          },
          { label: "decay lr", key: "decayLr", value: trainingEdit.decayLr },
          { label: "base lr", key: "baseLr", value: trainingEdit.baseLr },
          { label: "memory lr", key: "memoryLr", value: trainingEdit.memoryLr },
        ],
      },
    ];
    const memoryFields: Array<{
      label: string;
      key: keyof TrainingEditValues["memory"];
      value: string;
    }> = [
      {
        label: "moment tokens",
        key: "momentTokenCount",
        value: trainingEdit.memory.momentTokenCount,
      },
      {
        label: "cache",
        key: "cacheSize",
        value: trainingEdit.memory.cacheSize,
      },
      {
        label: "stride",
        key: "decisionStride",
        value: trainingEdit.memory.decisionStride,
      },
    ];

    function BaselineConfigModule() {
      return (
        <section className={`${insetClass} p-4`}>
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[oklch(0.47_0.055_54)]">
              Fixed Baseline
            </p>
            <h3 className="text-base font-semibold text-[oklch(0.25_0.025_62)]">
              Baseline 配置
            </h3>
            <p className="text-sm leading-6 text-[oklch(0.43_0.025_68)]">
              不带 memory 的配置会固定归入 baseline，用来和 memory
              版本对照训练曲线。
            </p>
          </div>

          <div className="mt-4 grid gap-2">
            {baselineConfigs.length > 0 ? (
              baselineConfigs.map((config) => (
                <div
                  key={config.name}
                  data-baseline-config={config.name}
                  className="rounded-xl border border-[oklch(0.82_0.035_66)] bg-[oklch(0.985_0.012_76)] px-3 py-2"
                >
                  <p className="text-sm font-semibold text-[oklch(0.25_0.025_62)]">
                    {config.name}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[oklch(0.43_0.025_68)]">
                    batch {config.batchSize} / peak lr {config.peakLr} / memory
                    off
                  </p>
                </div>
              ))
            ) : (
              <p className="rounded-xl border border-[oklch(0.84_0.025_72)] bg-[oklch(0.985_0.012_76)] px-3 py-2 text-sm text-[oklch(0.43_0.025_68)]">
                暂未发现不带 memory 的配置。
              </p>
            )}
          </div>
        </section>
      );
    }

    return (
      <section className={panelClass}>
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[oklch(0.47_0.055_54)]">
              OpenPI Training Config
            </p>
            <h2 className="mt-2 text-xl font-semibold">训练超参数配置</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[oklch(0.43_0.025_68)]">
              从 ~/code/openpi-simpler/src/openpi/training/config.py
              同步。保存时写回当前配置块。
            </p>
          </div>
          <select
            value={trainingConfigIndex}
            onChange={(event) =>
              setTrainingConfigIndex(Number(event.target.value))
            }
            className={`${selectClass} min-w-0 md:min-w-96`}
          >
            {trainingConfigs.map((config, index) => (
              <option key={config.name} value={index}>
                {config.name}
              </option>
            ))}
          </select>
        </div>

        {selectedTrainingConfig ? (
          <div className="mt-5 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="grid gap-4">
              {fieldGroups.map((group) => (
                <section key={group.title} className={`${insetClass} p-4`}>
                  <div className="flex flex-col gap-1">
                    <h3 className="text-base font-semibold text-[oklch(0.25_0.025_62)]">
                      {group.title}
                    </h3>
                    <p className="text-sm leading-6 text-[oklch(0.43_0.025_68)]">
                      {group.caption}
                    </p>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {group.fields.map((field) => (
                      <label key={field.key} className="block">
                        <span className="text-xs uppercase text-[oklch(0.49_0.02_68)]">
                          {field.label}
                        </span>
                        <input
                          value={field.value}
                          onChange={(event) =>
                            updateTrainingEdit(field.key, event.target.value)
                          }
                          className={`${fieldClass} mt-1`}
                        />
                      </label>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <div className="grid gap-4">
              <BaselineConfigModule />
              <div className={`${insetClass} p-4`}>
                <div className="grid gap-x-4 gap-y-2 text-sm text-[oklch(0.43_0.025_68)] md:grid-cols-2">
                  <span>config: {selectedTrainingConfig.name}</span>
                  <span>data: {selectedTrainingConfig.dataFactory}</span>
                  <span>repo: {selectedTrainingConfig.repoId}</span>
                  <span>model: {selectedTrainingConfig.model}</span>
                  <span>
                    discrete state: {selectedTrainingConfig.discreteStateInput}
                  </span>
                  <span>wandb: {selectedTrainingConfig.wandbEnabled}</span>
                  <span>ema: {selectedTrainingConfig.emaDecay}</span>
                  <span>
                    train vision: {selectedTrainingConfig.trainVisionEncoder}
                  </span>
                </div>

                <section className="mt-4 border-t border-[oklch(0.84_0.025_72)] pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-[oklch(0.25_0.025_62)]">
                        Memory 参数
                      </h3>
                      <p className="mt-1 text-sm text-[oklch(0.43_0.025_68)]">
                        当前 memory{" "}
                        {selectedTrainingConfig.memory.enabled ? "on" : "off"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={saveTrainingConfig}
                      disabled={trainingSaveState === "saving"}
                      className={primaryButtonClass}
                    >
                      {trainingSaveState === "saving" ? "保存中" : "保存配置"}
                    </button>
                  </div>
                  <div className="mt-3 grid gap-3 text-sm md:grid-cols-3">
                    {memoryFields.map((field) => (
                      <label key={field.key} className="block">
                        <span className="text-xs uppercase text-[oklch(0.49_0.02_68)]">
                          {field.label}
                        </span>
                        <input
                          value={field.value}
                          onChange={(event) =>
                            updateMemoryEdit(field.key, event.target.value)
                          }
                          className={`${fieldClass} mt-1`}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="mt-4 grid gap-2 text-sm text-[oklch(0.43_0.025_68)] md:grid-cols-2">
                    <span>
                      layers: {selectedTrainingConfig.memory.layerIndices}
                    </span>
                    <span>
                      init: {selectedTrainingConfig.memory.initialization}
                    </span>
                    <span>
                      lora: {selectedTrainingConfig.loraEnabled ? "on" : "off"}
                    </span>
                  </div>
                  {trainingSaveMessage ? (
                    <p
                      className={`mt-4 rounded-xl border px-3 py-2 text-sm ${
                        trainingSaveState === "error"
                          ? "border-[oklch(0.62_0.14_32)] bg-[oklch(0.96_0.035_32)] text-[oklch(0.43_0.12_32)]"
                          : "border-[oklch(0.84_0.025_72)] bg-[oklch(0.985_0.012_76)] text-[oklch(0.43_0.025_68)]"
                      }`}
                    >
                      {trainingSaveMessage}
                    </p>
                  ) : null}
                </section>
              </div>
            </div>
          </div>
        ) : (
          <p
            className={`${insetClass} mt-5 p-4 text-sm text-[oklch(0.43_0.025_68)]`}
          >
            未读取到训练配置。检查 OPENPI_TRAINING_CONFIG_PATH 或 openpi-simpler
            本地路径。
          </p>
        )}
      </section>
    );
  }

  function SimplerPanel() {
    return (
      <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <article className={panelClass}>
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[oklch(0.47_0.055_54)]">
                SimplerEnv
              </p>
              <h2 className="mt-2 text-xl font-semibold">仿真评测趋势</h2>
            </div>
            <select
              value={simplerRunIndex}
              onChange={(event) => {
                setSimplerRunIndex(Number(event.target.value));
              }}
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
              onChange={(event) => {
                setSimplerStepIndex(Number(event.target.value));
                setSimplerVideoIndex(0);
              }}
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
                  setSimplerVideoIndex(Number(event.target.value))
                }
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
                    key={selectedSimplerVideo.relativePath}
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
                      onClick={() => setSimplerVideoIndex(index)}
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
    return (
      <section className={panelClass}>
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[oklch(0.47_0.055_54)]">
              Evaluation Results
            </p>
            <h2 className="mt-2 text-xl font-semibold">评测结果表格</h2>
          </div>
          <div className="rounded-xl border border-[oklch(0.76_0.065_55)] bg-[oklch(0.94_0.045_62)] px-4 py-3 text-sm text-[oklch(0.29_0.045_52)]">
            <span className="block text-xs font-semibold uppercase tracking-[0.12em] text-[oklch(0.47_0.055_54)]">
              当前最高
            </span>
            <span className="mt-1 block font-semibold">
              {bestResultRow
                ? `${bestResultRow.benchmark} / ${bestResultRow.configName} / ${formatPercent(bestResultRow.score)}`
                : "暂无可比较分数"}
            </span>
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-xl border border-[oklch(0.84_0.025_72)]">
          <div className="max-h-80 overflow-auto">
            <table className="w-full min-w-[860px] border-collapse text-left text-sm">
              <thead className="sticky top-0 bg-[oklch(0.92_0.028_72)] text-xs font-semibold uppercase tracking-[0.08em] text-[oklch(0.47_0.055_54)]">
                <tr>
                  <th className="px-4 py-3">Benchmark</th>
                  <th className="px-4 py-3">Config</th>
                  <th className="px-4 py-3">Exp</th>
                  <th className="px-4 py-3">Step / Time</th>
                  <th className="px-4 py-3">Metric</th>
                  <th className="px-4 py-3 text-right">Score</th>
                  <th className="px-4 py-3">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[oklch(0.86_0.023_72)] bg-[oklch(0.985_0.012_76)]">
                {resultRows.map((row) => {
                  const isBest = bestResultRow?.id === row.id;
                  return (
                    <tr
                      key={row.id}
                      className={
                        isBest
                          ? "best-result-row bg-[oklch(0.95_0.055_68)]"
                          : "bg-[oklch(0.985_0.012_76)]"
                      }
                    >
                      <td className="px-4 py-3">
                        <span
                          data-benchmark={row.benchmark}
                          className={`benchmark-label inline-flex rounded-lg border px-2.5 py-1 text-base font-black tracking-[0.01em] ${
                            row.benchmark === "SimplerEnv"
                              ? "border-[oklch(0.66_0.09_44)] bg-[oklch(0.93_0.05_62)] text-[oklch(0.32_0.085_42)]"
                              : "border-[oklch(0.58_0.075_255)] bg-[oklch(0.93_0.035_252)] text-[oklch(0.34_0.08_252)]"
                          }`}
                        >
                          {row.benchmark}
                        </span>
                      </td>
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
                        {row.taskName} / {row.metricName}
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
              </tbody>
            </table>
          </div>
        </div>
      </section>
    );
  }

  function RmbenchPanel() {
    return (
      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <article className={panelClass}>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[oklch(0.47_0.055_54)]">
            RMBench
          </p>
          <h2 className="mt-2 text-xl font-semibold">Swap Blocks 回放</h2>
          <div className="mt-5 grid gap-3">
            <select
              value={rmbenchRunIndex}
              onChange={(event) => {
                setRmbenchRunIndex(Number(event.target.value));
                setTimestampIndex(0);
              }}
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
              onChange={(event) =>
                setTimestampIndex(Number(event.target.value))
              }
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
          {firstVideo ? (
            <div
              data-video-frame="compact"
              data-video-crop="horizontal"
              className="mx-auto mt-5 w-full max-w-md overflow-hidden rounded-2xl bg-[oklch(0.18_0.015_60)]"
              style={{ aspectRatio: rmbenchVideoRatio }}
            >
              <video
                key={firstVideo.relativePath}
                controls
                preload="metadata"
                className="block h-full max-w-none object-contain"
                src={mediaUrl(firstVideo.relativePath)}
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
            {selectedTimestamp?.videos.map((video) => (
              <a
                key={video.relativePath}
                href={mediaUrl(video.relativePath)}
                target="_blank"
                className="rounded-xl border border-[oklch(0.84_0.025_72)] bg-[oklch(0.96_0.018_75)] px-3 py-2 text-sm text-[oklch(0.43_0.025_68)] transition hover:border-[oklch(0.59_0.105_43)] hover:text-[oklch(0.25_0.025_62)]"
              >
                {video.name}
              </a>
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
              {formatInteger(dashboard.acone.episodes)} 条高质量轨迹、
              {formatInteger(dashboard.acone.frames)} 帧，用于真实 ARX Acone
              记忆任务的开环验证。
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

          <aside className="flex flex-col gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[oklch(0.47_0.055_54)]">
                Data Preview
              </p>
              <h3 className="mt-2 text-lg font-semibold text-[oklch(0.25_0.025_62)]">
                ACONE 三路相机预览
              </h3>
              <p className="mt-2 text-sm leading-6 text-[oklch(0.43_0.025_68)]">
                来自 /mnt/d/share/pick_X_times_filterd_twice 的 head、left_wrist
                和 right_wrist 视角，再进入同步视频、动作曲线和 URDF
                回放逐条检查。
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
