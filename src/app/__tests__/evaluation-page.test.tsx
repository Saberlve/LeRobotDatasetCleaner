// @vitest-environment jsdom
import React from "react";
import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import EvaluationPage from "@/app/evaluation/page";
import EvaluationDataPage from "@/app/evaluation/data/page";
import EvaluationReplayPage from "@/app/evaluation/replay/page";
import EvaluationTrainingPage from "@/app/evaluation/training/page";
import { EvaluationDashboardView } from "@/components/thesis/evaluation-dashboard";
import type { EvaluationDashboard } from "@/server/eval-results/summary";

const replayDashboard: EvaluationDashboard = {
  wandbUrl: "https://wandb.example.com",
  simpler: {
    runs: [
      {
        configName: "simpler-config",
        expName: "simpler-exp",
        steps: [
          {
            step: "1000",
            averageEntire: 0.5,
            tasks: [
              {
                name: "Pick Coke Can",
                partial: 0.5,
                entire: 0.5,
              },
            ],
            videos: [
              {
                name: "success_episode_0.mp4",
                label: "成功 / Pick Coke Can / ep 0",
                taskName: "Pick Coke Can",
                outcome: "success",
                relativePath: "SimplerEnv/run/step/success_episode_0.mp4",
              },
            ],
          },
        ],
      },
    ],
  },
  rmbench: {
    runs: [
      {
        configName: "rmbench-config",
        taskName: "swap-blocks",
        expName: "rmbench-exp",
        timestamps: [
          {
            timestamp: "2026-05-08-120000",
            score: 0.5,
            resultText: "success: 1/2",
            videos: [
              {
                name: "episode_0.mp4",
                relativePath: "RMBench/run/timestamp/episode_0.mp4",
              },
            ],
          },
        ],
      },
    ],
  },
  training: {
    configs: [],
  },
  results: {
    bestRow: {
      id: "rmbench-config|swap-blocks|rmbench-exp|2026-05-08-120000|score",
      benchmark: "RMBench",
      configName: "rmbench-config",
      expName: "rmbench-exp",
      checkpoint: null,
      timestamp: "2026-05-08-120000",
      taskName: "swap-blocks",
      metricName: "score",
      partial: null,
      score: 0.68,
      source: "TXT",
    },
    rows: [
      {
        id: "simpler-config|simpler-exp|1000|avg-entire",
        benchmark: "SimplerEnv",
        configName: "simpler-config",
        expName: "simpler-exp",
        checkpoint: "1000",
        timestamp: null,
        taskName: "Avg Entire",
        metricName: "avg-entire",
        partial: null,
        score: 0.5,
        source: "CSV",
      },
      {
        id: "rmbench-config|swap-blocks|rmbench-exp|2026-05-08-120000|score",
        benchmark: "RMBench",
        configName: "rmbench-config",
        expName: "rmbench-exp",
        checkpoint: null,
        timestamp: "2026-05-08-120000",
        taskName: "swap-blocks",
        metricName: "score",
        partial: null,
        score: 0.68,
        source: "TXT",
      },
    ],
  },
  acone: {
    datasetRoute: "/local/a/b",
    datasetName: "a/b",
    episodes: 1,
    frames: 10,
  },
};

const trainingDashboard: EvaluationDashboard = {
  ...replayDashboard,
  training: {
    configs: [
      {
        name: "pi05_simpler_baseline",
        projectName: "openpi",
        expName: "baseline",
        dataFactory: "LeRobotAlohaDataConfig",
        repoId: "local/baseline",
        model: "Pi0Config",
        actionHorizon: "50",
        discreteStateInput: "False",
        batchSize: "64",
        gradientAccumulationSteps: "1",
        numTrainSteps: "30000",
        saveInterval: "2000",
        peakLr: "2.5e-5",
        warmupSteps: "1000",
        decaySteps: "30000",
        decayLr: "2.5e-6",
        baseLr: "None",
        memoryLr: "None",
        emaDecay: "0.99",
        wandbEnabled: "True",
        trainVisionEncoder: "True",
        loraEnabled: false,
        isBaseline: true,
        memory: {
          enabled: false,
          momentTokenCount: "0",
          cacheSize: "0",
          decisionStride: "None",
          layerIndices: "None",
          initialization: "none",
        },
      },
      {
        name: "pi05_simpler_memory",
        projectName: "openpi",
        expName: "memory",
        dataFactory: "LeRobotAlohaDataConfig",
        repoId: "local/memory",
        model: "Pi0Config",
        actionHorizon: "50",
        discreteStateInput: "False",
        batchSize: "128",
        gradientAccumulationSteps: "1",
        numTrainSteps: "30000",
        saveInterval: "2000",
        peakLr: "5e-5",
        warmupSteps: "1000",
        decaySteps: "30000",
        decayLr: "2.5e-6",
        baseLr: "None",
        memoryLr: "1e-4",
        emaDecay: "0.99",
        wandbEnabled: "True",
        trainVisionEncoder: "True",
        loraEnabled: false,
        isBaseline: false,
        memory: {
          enabled: true,
          momentTokenCount: "4",
          cacheSize: "8",
          decisionStride: "4",
          layerIndices: "[10, 20]",
          initialization: "MemoryInitializer",
        },
      },
    ],
  },
};

describe("evaluation page", () => {
  test("renders overview as an entry-only hub", async () => {
    const page = await EvaluationPage();
    const html = renderToStaticMarkup(page);

    expect(html).toContain("训练-评测-回放一体化平台");
    expect(html).not.toContain("面向长程任务的 VLM-VLA 通用记忆系统");
    expect(html).not.toContain('href="/why-memory"');
    expect(html).not.toContain('href="/conclusion"');
    expect(html).toContain('href="/results"');
    expect(html).toContain("返回展示页");
    expect(html).toContain('href="/evaluation/data"');
    expect(html).toContain("数据查看");
    expect(html).toContain('href="/evaluation/training"');
    expect(html).toContain("训练配置和曲线");
    expect(html).toContain('href="/evaluation/replay"');
    expect(html).toContain("评测查看和回放");
    expect(html).toContain("选择工作区");
    expect(html).toContain("进入数据查看");
    expect(html).toContain("进入训练工作区");
    expect(html).toContain("进入评测回放");
    expect(html).not.toContain("Weights &amp; Biases");
    expect(html).not.toContain("外部监控入口");
    expect(html).not.toContain("W&amp;B 项目页需要在新标签页打开");
    expect(html).not.toContain("新标签页查看训练曲线");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("训练超参数配置");
    expect(html).not.toContain("保存配置");
    expect(html).not.toContain("pi05_simpler_memory_pytorch_full");
    expect(html).not.toContain(
      "https://wandb.ai/saberlve9-massachusetts-institute-of-technology/openpi?nw=nwusersaberlve9",
    );
    expect(html).not.toContain("SimplerEnv 回放");
    expect(html).not.toContain("Swap Blocks 回放");
    expect(html).not.toContain("Episode 视频");
    expect(html).not.toContain("pick_X_times_filterd_twice");
    expect(html).not.toContain("Episode 快速定位");
    expect(html).not.toContain("复制数据摘要");
    expect(html).not.toContain("数据巡检清单");
    expect(html).not.toContain("首条 episode_0");
    expect(html).not.toContain("ACONE 三路相机预览");
    expect(html).not.toContain("ACONE 三路相机数据预览图");
    expect(html).not.toContain("/mnt/d/share/pick_X_times_filterd_twice");
    expect(html).not.toContain("%2Fimages%2Facone-data-preview.jpg");
  });

  test("renders focused evaluation workspaces", async () => {
    const [dataPage, trainingPage, replayPage] = await Promise.all([
      EvaluationDataPage(),
      EvaluationTrainingPage(),
      EvaluationReplayPage(),
    ]);
    const dataHtml = renderToStaticMarkup(dataPage);
    const trainingHtml = renderToStaticMarkup(trainingPage);
    const replayHtml = renderToStaticMarkup(replayPage);

    expect(dataHtml).toContain("数据查看");
    expect(dataHtml).toContain("打开 ACONE 数据集");
    expect(dataHtml).toContain("Episode 快速定位");
    expect(dataHtml).toContain("打开 episode");
    expect(dataHtml).toContain("从当前 episode 预览进入");
    expect(dataHtml).toContain("同步视频");
    expect(dataHtml).toContain("动作曲线");
    expect(dataHtml).toContain("URDF 回放");
    expect(dataHtml).toContain("代表样本抽查");
    expect(dataHtml).toContain("首条样本");
    expect(dataHtml).toContain("中位样本");
    expect(dataHtml).toContain("末条样本");
    expect(dataHtml).toContain('data-workspace-cue="data"');
    expect(dataHtml).toContain('data-workspace-icon="data-video"');
    expect(dataHtml).toContain("ACONE 预览图");
    expect(dataHtml).not.toContain("数据巡检清单");
    expect(dataHtml).not.toContain("按清洗流程逐项确认");
    expect(dataHtml).not.toContain("清洗状态");
    expect(dataHtml).not.toContain("保存配置");
    expect(dataHtml).not.toContain("SimplerEnv 回放");

    expect(trainingHtml).toContain("训练配置和曲线");
    expect(trainingHtml).toContain("Weights &amp; Biases");
    expect(trainingHtml).toContain("保存配置");
    expect(trainingHtml).toContain("训练规模");
    expect(trainingHtml).toContain("学习率 schedule");
    expect(trainingHtml).toContain("Memory 参数");
    expect(trainingHtml).toContain('data-workspace-cue="training"');
    expect(trainingHtml).toContain('data-workspace-icon="training-baseline"');
    expect(trainingHtml).toContain("Baseline 对照");
    expect(trainingHtml.indexOf("学习率 schedule")).toBeLessThan(
      trainingHtml.indexOf("Memory 参数"),
    );
    expect(trainingHtml).not.toContain("Episode 快速定位");
    expect(trainingHtml).not.toContain("Episode 视频");

    expect(replayHtml).toContain("评测查看和回放");
    expect(replayHtml).toContain("SimplerEnv 回放");
    expect(replayHtml).toContain("RMBench");
    expect(replayHtml).toContain('data-workspace-cue="replay"');
    expect(replayHtml).toContain('data-workspace-icon="replay-table"');
    expect(replayHtml).toContain("最高分表格");
    expect(replayHtml).not.toContain("数据巡检清单");
    expect(replayHtml).not.toContain("保存配置");
  });

  test("keeps RMBench replay compact and crops horizontally without scaling", () => {
    const html = renderToStaticMarkup(
      <EvaluationDashboardView dashboard={replayDashboard} mode="replay" />,
    );

    expect(html).not.toContain("object-cover");
    expect(html).not.toContain("scale(");
    expect(html).not.toContain("scaleX(");
    expect(html).not.toContain("transform:");
    expect(html).toContain("object-contain");
    expect(html).toContain('data-video-frame="compact"');
    expect(html).toContain('data-video-crop="horizontal"');
    expect(html).toContain("max-w-md");
  });

  test("renders evaluation result table with prominent benchmark labels and best row", () => {
    const html = renderToStaticMarkup(
      <EvaluationDashboardView dashboard={replayDashboard} mode="replay" />,
    );

    expect(html).toContain("评测结果表格");
    expect(html).toContain("当前最高");
    expect(html).toContain('data-benchmark="SimplerEnv"');
    expect(html).toContain('data-benchmark="RMBench"');
    expect(html).toContain("benchmark-label");
    expect(html).toContain("best-result-row");
  });

  test("renders a fixed baseline module for memory-free training configs", () => {
    const html = renderToStaticMarkup(
      <EvaluationDashboardView dashboard={trainingDashboard} mode="training" />,
    );

    expect(html).toContain("Baseline 配置");
    expect(html).toContain("不带 memory 的配置");
    expect(html).toContain('data-baseline-config="pi05_simpler_baseline"');
    expect(html).not.toContain('data-baseline-config="pi05_simpler_memory"');
  });
});
