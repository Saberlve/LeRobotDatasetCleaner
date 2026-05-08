"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import type { EvaluationDashboard } from "@/server/eval-results/summary";
import type { TrainingConfigSummary } from "@/server/eval-results/training-config";

type EvaluationDashboardProps = {
  dashboard: EvaluationDashboard;
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

function formatPercent(value: number | null) {
  if (value === null) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

function mediaUrl(relativePath: string) {
  return `/api/eval-results/media?path=${encodeURIComponent(relativePath)}`;
}

export function EvaluationDashboardView({
  dashboard,
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
  const [rmbenchVideoRatio, setRmbenchVideoRatio] = useState("16 / 9");

  const bestSimplerStep = useMemo(() => {
    if (!selectedSimplerRun) return null;
    return selectedSimplerRun.steps.reduce((best, current) => {
      if ((current.averageEntire ?? -1) > (best.averageEntire ?? -1)) {
        return current;
      }
      return best;
    }, selectedSimplerRun.steps[0]);
  }, [selectedSimplerRun]);

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
    setRmbenchVideoRatio("16 / 9");
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

  return (
    <main className="bg-[#f8f3ea] px-4 py-10 text-[#2a211c] md:px-6">
      <section className="mx-auto max-w-7xl rounded-[2rem] bg-[#2a211c] p-8 text-white shadow-[0_22px_60px_rgba(42,33,28,0.20)] md:p-10">
        <p className="w-fit rounded-full border border-white/14 bg-white/8 px-3 py-1 text-sm font-medium text-[#f0cbb8]">
          Evaluation System
        </p>
        <h1 className="mt-5 max-w-5xl text-5xl font-semibold tracking-normal md:text-7xl">
          训练-评测-回放一体化平台
        </h1>
        <p className="mt-6 max-w-3xl text-xl leading-9 text-[#f4eee7]">
          统一查看 W&B 训练过程、SimplerEnv checkpoint 评测、RMBench rollout
          视频和 ACONE 真实数据入口。
        </p>
      </section>

      <section className="mx-auto mt-8 max-w-7xl">
        <article className="rounded-[2rem] border border-[#dfd4c5] bg-[#fffaf4] p-6 shadow-[0_16px_42px_rgba(42,33,28,0.07)] md:p-8">
          <p className="text-sm font-medium text-[#c15f3c]">Weights & Biases</p>
          <h2 className="mt-3 text-3xl font-semibold">训练曲线监控</h2>
          <p className="mt-4 text-sm leading-7 text-[#665c52]">
            外接 W&B 项目页面，用于查看 loss、learning rate、checkpoint
            保存和实验运行状态。若浏览器限制嵌入，可直接打开控制台。
          </p>
          <Link
            href={dashboard.wandbUrl}
            target="_blank"
            className="mt-6 inline-flex rounded-2xl bg-[#2a211c] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#3a3029]"
          >
            打开 W&B 控制台
          </Link>
        </article>
      </section>

      <section className="mx-auto mt-8 max-w-7xl rounded-[2rem] border border-[#dfd4c5] bg-[#fffaf4] p-6 shadow-[0_16px_42px_rgba(42,33,28,0.07)] md:p-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-medium text-[#c15f3c]">
              OpenPI Training Config
            </p>
            <h2 className="mt-3 text-3xl font-semibold">训练超参数配置</h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-[#665c52]">
              从 ~/code/openpi-simpler/src/openpi/training/config.py
              同步。没有显式写在 config 里的字段会连接到 TrainConfig /
              MemoryConfig 默认值，保存时会写回当前配置块。
            </p>
          </div>
          <select
            value={trainingConfigIndex}
            onChange={(event) =>
              setTrainingConfigIndex(Number(event.target.value))
            }
            className="min-w-0 rounded-2xl border border-[#dfd4c5] bg-[#f8f3ea] px-4 py-3 text-sm text-[#2a211c] md:min-w-96"
          >
            {trainingConfigs.map((config, index) => (
              <option key={config.name} value={index}>
                {config.name}
              </option>
            ))}
          </select>
        </div>

        {selectedTrainingConfig ? (
          <div className="mt-6 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="grid gap-3 md:grid-cols-4">
              {[
                ["batch", "batchSize", trainingEdit.batchSize],
                ["steps", "numTrainSteps", trainingEdit.numTrainSteps],
                ["peak lr", "peakLr", trainingEdit.peakLr],
                ["save", "saveInterval", trainingEdit.saveInterval],
                ["warmup", "warmupSteps", trainingEdit.warmupSteps],
                [
                  "accum",
                  "gradientAccumulationSteps",
                  trainingEdit.gradientAccumulationSteps,
                ],
                ["base lr", "baseLr", trainingEdit.baseLr],
                ["memory lr", "memoryLr", trainingEdit.memoryLr],
              ].map(([label, key, value]) => (
                <div
                  key={label}
                  className="rounded-2xl border border-[#dfd4c5] bg-[#f8f3ea] p-4"
                >
                  <p className="text-xs uppercase tracking-normal text-[#8a7d71]">
                    {label}
                  </p>
                  <input
                    value={value}
                    onChange={(event) =>
                      updateTrainingEdit(
                        key as keyof TrainingEditValues,
                        event.target.value,
                      )
                    }
                    className="mt-2 w-full rounded-xl border border-[#dfd4c5] bg-[#fffaf4] px-3 py-2 text-lg font-semibold text-[#2a211c] outline-none transition focus:border-[#c15f3c]"
                  />
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-[#dfd4c5] bg-[#f8f3ea] p-5">
              <div className="grid gap-3 text-sm text-[#665c52] md:grid-cols-2">
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
              <div className="mt-5 border-t border-[#dfd4c5] pt-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-[#2a211c]">
                    memory{" "}
                    {selectedTrainingConfig.memory.enabled ? "on" : "off"}
                  </p>
                  <button
                    type="button"
                    onClick={saveTrainingConfig}
                    disabled={trainingSaveState === "saving"}
                    className="rounded-xl bg-[#2a211c] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#3a3029] disabled:cursor-wait disabled:bg-[#8a7d71]"
                  >
                    {trainingSaveState === "saving" ? "保存中" : "保存配置"}
                  </button>
                </div>
                <div className="mt-3 grid gap-3 text-sm text-[#665c52] md:grid-cols-3">
                  {[
                    [
                      "moment tokens",
                      "momentTokenCount",
                      trainingEdit.memory.momentTokenCount,
                    ],
                    ["cache", "cacheSize", trainingEdit.memory.cacheSize],
                    [
                      "stride",
                      "decisionStride",
                      trainingEdit.memory.decisionStride,
                    ],
                  ].map(([label, key, value]) => (
                    <label key={key} className="block">
                      <span className="text-xs uppercase tracking-normal text-[#8a7d71]">
                        {label}
                      </span>
                      <input
                        value={value}
                        onChange={(event) =>
                          updateMemoryEdit(
                            key as keyof TrainingEditValues["memory"],
                            event.target.value,
                          )
                        }
                        className="mt-1 w-full rounded-xl border border-[#dfd4c5] bg-[#fffaf4] px-3 py-2 font-semibold text-[#2a211c] outline-none transition focus:border-[#c15f3c]"
                      />
                    </label>
                  ))}
                </div>
                <div className="mt-4 grid gap-2 text-sm text-[#665c52] md:grid-cols-2">
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
                        ? "border-[#d45b4d] bg-[#fff1ee] text-[#9b2f24]"
                        : "border-[#dfd4c5] bg-[#fffaf4] text-[#665c52]"
                    }`}
                  >
                    {trainingSaveMessage}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-6 rounded-2xl border border-[#dfd4c5] bg-[#f8f3ea] p-4 text-sm text-[#665c52]">
            未读取到训练配置。检查 OPENPI_TRAINING_CONFIG_PATH 或 openpi-simpler
            本地路径。
          </p>
        )}
      </section>

      <section className="mx-auto mt-8 grid max-w-7xl gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-[2rem] border border-[#dfd4c5] bg-[#fffaf4] p-6 shadow-[0_16px_42px_rgba(42,33,28,0.07)] md:p-8">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="text-sm font-medium text-[#c15f3c]">SimplerEnv</p>
              <h2 className="mt-3 text-3xl font-semibold">仿真评测趋势</h2>
            </div>
            <select
              value={simplerRunIndex}
              onChange={(event) => {
                setSimplerRunIndex(Number(event.target.value));
              }}
              className="rounded-2xl border border-[#dfd4c5] bg-[#f8f3ea] px-4 py-3 text-sm text-[#2a211c]"
            >
              {dashboard.simpler.runs.map((run, index) => (
                <option key={`${run.configName}-${run.expName}`} value={index}>
                  {run.configName}
                  {run.expName ? ` / ${run.expName}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-[#dfd4c5] bg-[#f8f3ea] p-4">
              <p className="text-sm text-[#665c52]">Best Avg Entire</p>
              <p className="mt-2 text-4xl font-semibold text-[#2a211c]">
                {formatPercent(bestSimplerStep?.averageEntire ?? null)}
              </p>
              <p className="mt-2 text-sm text-[#665c52]">
                checkpoint {bestSimplerStep?.step ?? "-"}
              </p>
            </div>
            <div className="rounded-2xl border border-[#dfd4c5] bg-[#f8f3ea] p-4">
              <p className="text-sm text-[#665c52]">Latest Avg Entire</p>
              <p className="mt-2 text-4xl font-semibold text-[#c15f3c]">
                {formatPercent(latestSimplerStep?.averageEntire ?? null)}
              </p>
              <p className="mt-2 text-sm text-[#665c52]">
                checkpoint {latestSimplerStep?.step ?? "-"}
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {selectedSimplerRun?.steps.map((step) => (
              <div
                key={step.step}
                className="grid gap-3 md:grid-cols-[90px_1fr_80px] md:items-center"
              >
                <p className="text-sm font-medium text-[#2a211c]">
                  {step.step}
                </p>
                <div className="h-3 overflow-hidden rounded-full bg-[#eadfce]">
                  <div
                    className="h-full rounded-full bg-[#c15f3c]"
                    style={{
                      width: `${Math.max(0, Math.min(100, (step.averageEntire ?? 0) * 100))}%`,
                    }}
                  />
                </div>
                <p className="text-sm text-[#665c52]">
                  {formatPercent(step.averageEntire)}
                </p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[2rem] border border-[#dfd4c5] bg-[#fffaf4] p-6 shadow-[0_16px_42px_rgba(42,33,28,0.07)] md:p-8">
          <p className="text-sm font-medium text-[#c15f3c]">当前 checkpoint</p>
          <h2 className="mt-3 text-3xl font-semibold">四任务结果</h2>
          <select
            value={simplerStepIndex}
            onChange={(event) => {
              setSimplerStepIndex(Number(event.target.value));
              setSimplerVideoIndex(0);
            }}
            className="mt-5 w-full rounded-2xl border border-[#dfd4c5] bg-[#f8f3ea] px-4 py-3 text-sm text-[#2a211c]"
          >
            {selectedSimplerRun?.steps.map((step, index) => (
              <option key={step.step} value={index}>
                checkpoint {step.step} / avg {formatPercent(step.averageEntire)}
              </option>
            ))}
          </select>
          <div className="mt-6 space-y-3">
            {selectedSimplerStep?.tasks.map((task) => (
              <div
                key={task.name}
                className="rounded-2xl border border-[#dfd4c5] bg-[#f8f3ea] p-4"
              >
                <p className="font-semibold text-[#2a211c]">{task.name}</p>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-[#665c52]">
                  <span>partial {formatPercent(task.partial)}</span>
                  <span>entire {formatPercent(task.entire)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 border-t border-[#dfd4c5] pt-6">
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
              <div>
                <p className="text-sm font-medium text-[#c15f3c]">
                  SimplerEnv 回放
                </p>
                <h3 className="mt-2 text-2xl font-semibold">Rollout 视频</h3>
              </div>
              <select
                value={simplerVideoIndex}
                onChange={(event) =>
                  setSimplerVideoIndex(Number(event.target.value))
                }
                className="min-w-0 rounded-2xl border border-[#dfd4c5] bg-[#f8f3ea] px-4 py-3 text-sm text-[#2a211c] md:min-w-72"
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
                <div className="mx-auto mt-5 aspect-video w-full max-w-xl overflow-hidden rounded-2xl bg-black">
                  <video
                    key={selectedSimplerVideo.relativePath}
                    controls
                    preload="metadata"
                    className="h-full w-full object-cover"
                    src={mediaUrl(selectedSimplerVideo.relativePath)}
                    style={{
                      transform: "scale(0.999)",
                      transformOrigin: "center",
                    }}
                  />
                </div>
                <div className="mt-4 grid max-h-40 gap-2 overflow-y-auto md:grid-cols-2">
                  {selectedSimplerStep?.videos.map((video, index) => (
                    <button
                      key={video.relativePath}
                      type="button"
                      onClick={() => setSimplerVideoIndex(index)}
                      className={`rounded-2xl border px-3 py-2 text-left text-sm transition ${
                        index === simplerVideoIndex
                          ? "border-[#c15f3c] bg-[#fff1e8] text-[#2a211c]"
                          : "border-[#dfd4c5] bg-[#f8f3ea] text-[#665c52] hover:border-[#c15f3c] hover:text-[#2a211c]"
                      }`}
                    >
                      <span className="block font-medium">{video.label}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-5 rounded-2xl border border-[#dfd4c5] bg-[#f8f3ea] p-4 text-sm text-[#665c52]">
                当前 checkpoint 未发现 SimplerEnv 视频文件。
              </p>
            )}
          </div>
        </article>
      </section>

      <section className="mx-auto mt-8 grid max-w-7xl gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <article className="rounded-[2rem] border border-[#dfd4c5] bg-[#fffaf4] p-6 shadow-[0_16px_42px_rgba(42,33,28,0.07)] md:p-8">
          <p className="text-sm font-medium text-[#c15f3c]">RMBench</p>
          <h2 className="mt-3 text-3xl font-semibold">Swap Blocks 回放</h2>
          <div className="mt-6 space-y-3">
            <select
              value={rmbenchRunIndex}
              onChange={(event) => {
                setRmbenchRunIndex(Number(event.target.value));
                setTimestampIndex(0);
              }}
              className="w-full rounded-2xl border border-[#dfd4c5] bg-[#f8f3ea] px-4 py-3 text-sm text-[#2a211c]"
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
              className="w-full rounded-2xl border border-[#dfd4c5] bg-[#f8f3ea] px-4 py-3 text-sm text-[#2a211c]"
            >
              {selectedRmbenchRun?.timestamps.map((item, index) => (
                <option key={item.timestamp} value={index}>
                  {item.timestamp}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-6 rounded-2xl border border-[#dfd4c5] bg-[#f8f3ea] p-4">
            <p className="text-sm text-[#665c52]">result</p>
            <p className="mt-2 text-4xl font-semibold text-[#c15f3c]">
              {formatPercent(selectedTimestamp?.score ?? null)}
            </p>
            <pre className="mt-4 whitespace-pre-wrap text-xs leading-6 text-[#665c52]">
              {selectedTimestamp?.resultText}
            </pre>
          </div>
        </article>

        <article className="rounded-[2rem] border border-[#dfd4c5] bg-[#fffaf4] p-6 shadow-[0_16px_42px_rgba(42,33,28,0.07)] md:p-8">
          <h2 className="text-3xl font-semibold">Episode 视频</h2>
          {firstVideo ? (
            <div
              className="mt-6 w-full overflow-hidden rounded-2xl bg-black"
              style={{ aspectRatio: rmbenchVideoRatio }}
            >
              <video
                key={firstVideo.relativePath}
                controls
                preload="metadata"
                className="h-full w-full object-cover"
                src={mediaUrl(firstVideo.relativePath)}
                style={{
                  transform: "scale(1.16)",
                  transformOrigin: "center",
                }}
                onLoadedMetadata={(event) => {
                  const video = event.currentTarget;
                  if (video.videoWidth > 0 && video.videoHeight > 0) {
                    setRmbenchVideoRatio(
                      `${video.videoWidth} / ${video.videoHeight}`,
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
                className="rounded-2xl border border-[#dfd4c5] bg-[#f8f3ea] px-3 py-2 text-sm text-[#665c52] transition hover:border-[#c15f3c] hover:text-[#2a211c]"
              >
                {video.name}
              </a>
            ))}
          </div>
        </article>
      </section>

      <section className="mx-auto mt-8 max-w-7xl rounded-[2rem] border border-[#dfd4c5] bg-[#fffaf4] p-6 shadow-[0_16px_42px_rgba(42,33,28,0.07)] md:p-8">
        <p className="text-sm font-medium text-[#c15f3c]">ACONE</p>
        <div className="mt-3 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <h2 className="text-3xl font-semibold">
              真实数据清洗与开环验证入口
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-[#665c52]">
              {dashboard.acone.datasetName} 包含 {dashboard.acone.episodes}{" "}
              条高质量轨迹、
              {dashboard.acone.frames} 帧，用于真实 ARX Acone
              记忆任务的开环验证。
            </p>
          </div>
          <Link
            href={dashboard.acone.datasetRoute}
            className="rounded-2xl bg-[#2a211c] px-5 py-3 text-center text-sm font-medium text-white transition hover:bg-[#3a3029]"
          >
            打开 ACONE 数据集
          </Link>
        </div>
      </section>
    </main>
  );
}
