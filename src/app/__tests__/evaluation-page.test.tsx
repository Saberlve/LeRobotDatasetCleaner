// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import EvaluationPage from "@/app/evaluation/page";
import EvaluationLaunchPage from "@/app/evaluation/launch/page";
import { EvaluationDashboardView } from "@/components/thesis/evaluation-dashboard";
import type { EvaluationDashboard } from "@/server/eval-results/summary";
import type { TrainingConfigSummary } from "@/server/eval-results/training-config";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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
              {
                name: "episode_1.mp4",
                relativePath: "RMBench/run/timestamp/episode_1.mp4",
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
      trainingConfig({
        name: "pi05_rmbench",
        projectName: "openpi",
        expName: "rmbench",
        dataFactory: "LeRobotRMBenchDataConfig",
        repoId: "local/rmbench",
        model: "Pi0Config",
        actionHorizon: "30",
        discreteStateInput: "True",
        batchSize: "64",
        peakLr: "5e-5",
        loraEnabled: false,
        isBaseline: true,
      }),
      trainingConfig({
        name: "pi05_rmbench_lora",
        projectName: "openpi",
        expName: "rmbench-lora",
        dataFactory: "LeRobotRMBenchDataConfig",
        repoId: "local/rmbench",
        model: "Pi0Config",
        actionHorizon: "30",
        discreteStateInput: "True",
        batchSize: "64",
        peakLr: "5e-4",
        loraEnabled: true,
        isBaseline: true,
      }),
      trainingConfig({
        name: "pi05_simpler",
        projectName: "openpi",
        expName: "simpler",
        dataFactory: "LeRobotSimplerDataConfig",
        repoId: "bridgev2_lerobot_v21",
        model: "Pi0Config",
        actionHorizon: "10",
        discreteStateInput: "True",
        batchSize: "512",
        peakLr: "5e-5",
        loraEnabled: false,
        isBaseline: true,
      }),
      trainingConfig({
        name: "pi05_simpler_lora_pytorch_baseline",
        projectName: "openpi",
        expName: "simpler-lora",
        dataFactory: "LeRobotSimplerDataConfig",
        repoId: "bridgev2_lerobot_v21",
        model: "Pi0Config",
        actionHorizon: "4",
        discreteStateInput: "True",
        batchSize: "128",
        peakLr: "1e-4",
        loraEnabled: true,
        isBaseline: true,
      }),
      trainingConfig({
        name: "pi05_simpler_baseline",
        batchSize: "64",
        peakLr: "2.5e-5",
        isBaseline: true,
      }),
      trainingConfig({
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
      }),
    ],
  },
};

function trainingConfig(
  overrides: Partial<TrainingConfigSummary> & { name: string },
): TrainingConfigSummary {
  return {
    name: overrides.name,
    projectName: "openpi",
    expName: "-",
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
    ...overrides,
  };
}

describe("evaluation page", () => {
  test("redirects root evaluation page to /evaluation/data", async () => {
    try {
      await EvaluationPage();
      expect.fail("Expected redirect to throw");
    } catch (error: unknown) {
      expect((error as { digest?: string }).digest).toContain("NEXT_REDIRECT");
      expect((error as { digest?: string }).digest).toContain("/evaluation/data");
    }
  });

  test("renders focused evaluation workspaces", () => {
    const dataHtml = renderToStaticMarkup(
      <EvaluationDashboardView dashboard={trainingDashboard} mode="data" />,
    );
    const trainingHtml = renderToStaticMarkup(
      <EvaluationDashboardView dashboard={trainingDashboard} mode="training" />,
    );
    const replayHtml = renderToStaticMarkup(
      <EvaluationDashboardView dashboard={replayDashboard} mode="replay" />,
    );
    const launchHtml = renderToStaticMarkup(
      <EvaluationDashboardView dashboard={replayDashboard} mode="launch" />,
    );

    expect(dataHtml).toContain("数据查看");
    expect(dataHtml).toContain("打开 ACONE 数据集");
    expect(dataHtml).toContain("Episode 快速定位");
    expect(dataHtml).toContain("打开 episode");
    expect(dataHtml).toContain("从当前 episode 预览进入");
    expect(dataHtml).toContain("代表样本抽查");
    expect(dataHtml).toContain("首条样本");
    expect(dataHtml).toContain("中位样本");
    expect(dataHtml).toContain("末条样本");
    expect(dataHtml).toContain("ACONE 数据概览");
    expect(dataHtml).toContain("ACONE 三路相机预览");
    expect(dataHtml).toContain("ACONE 三路相机数据预览图");
    expect(dataHtml).toContain("%2Fimages%2Facone-data-preview.jpg");
    expect(dataHtml).not.toContain("数据巡检清单");
    expect(dataHtml).not.toContain("按清洗流程逐项确认");
    expect(dataHtml).not.toContain("清洗状态");
    expect(dataHtml).not.toContain("保存配置");
    expect(dataHtml).not.toContain("SimplerEnv 回放视频");

    expect(trainingHtml).toContain("训练超参数配置");
    expect(trainingHtml).toContain("训练曲线监控");
    expect(trainingHtml).toContain("保存配置");
    expect(trainingHtml).toContain("训练规模");
    expect(trainingHtml).toContain("学习率 Schedule");
    expect(trainingHtml).toContain("Memory 参数");
    expect(trainingHtml).toContain("Baseline 对照");
    expect(trainingHtml.indexOf("学习率 Schedule")).toBeLessThan(
      trainingHtml.indexOf("Memory 参数"),
    );
    expect(trainingHtml).not.toContain("Episode 快速定位");
    expect(trainingHtml).not.toContain("Episode 视频");

    expect(replayHtml).toContain("评测结果表格");
    expect(replayHtml).toContain("SimplerEnv 回放视频");
    expect(replayHtml).toContain("RMBench");
    expect(replayHtml).toContain('data-simpler-trend-chart="avg-entire"');
    expect(replayHtml).not.toContain("数据巡检清单");
    expect(replayHtml).not.toContain("保存配置");

    expect(launchHtml).toContain("常驻模型服务");
    expect(launchHtml).toContain("启动评测");
    expect(launchHtml).toContain("停止评测");
    expect(launchHtml).not.toContain("SimplerEnv 回放视频");
  });

  test("renders the dedicated launch route", async () => {
    const page = await EvaluationLaunchPage();
    const html = renderToStaticMarkup(page);

    expect(html).toContain("常驻模型服务");
    expect(html).toContain("启动评测");
    expect(html).toContain('data-launch-row="controls"');
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
    expect(html).toContain('data-simpler-trend-bar="1000"');
    expect(html).toContain('data-simpler-video-selector="preserve-scroll"');
    expect(html).toContain('data-simpler-video-player="stable"');
    expect(html).toContain('data-simpler-video-option="0"');
    expect(html).toContain('data-rmbench-video-frame="inline"');
    expect(html).toContain('data-rmbench-video-player="stable"');
    expect(html).toContain('data-rmbench-video-option="0"');
    expect(html).toContain('data-rmbench-video-option="1"');
    expect(html).not.toContain('href="/api/eval-results/media?path=RMBench');
    expect(html).toContain('data-video-frame="compact"');
    expect(html).toContain('data-video-crop="horizontal"');
    expect(html).toContain("max-w-md");
  });

  test("renders one switchable evaluation result table by benchmark", () => {
    const html = renderToStaticMarkup(
      <EvaluationDashboardView dashboard={replayDashboard} mode="replay" />,
    );

    expect(html).toContain("评测结果表格");
    expect(html).toContain('data-result-table="switchable"');
    expect(html).toContain('data-result-benchmark-tab="SimplerEnv"');
    expect(html).toContain('data-result-benchmark-tab="RMBench"');
    expect(html).toContain('data-selected-benchmark="SimplerEnv"');
    expect(html).toContain('data-benchmark-best="selected"');
    expect(html).not.toContain('data-result-table="RMBench"');
    expect(html).not.toContain("benchmark-label");
    expect(html).not.toContain('data-benchmark="SimplerEnv"');
    expect(html).not.toContain('data-benchmark="RMBench"');
    expect(html).toContain("best-result-row");
  });

  test("switches the single evaluation result table between benchmarks", () => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);

    const { container, getByRole } = render(
      <EvaluationDashboardView dashboard={replayDashboard} mode="replay" />,
    );

    expect(
      container.querySelectorAll('[data-result-table="switchable"]'),
    ).toHaveLength(1);
    expect(
      container.querySelector('[data-selected-benchmark="SimplerEnv"]'),
    ).not.toBeNull();
    let resultTable = container.querySelector(
      '[data-result-table="switchable"]',
    );
    expect(resultTable?.textContent).toContain("simpler-config");
    expect(resultTable?.textContent).not.toContain("rmbench-config");

    fireEvent.click(getByRole("button", { name: "RMBench" }));

    expect(
      container.querySelectorAll('[data-result-table="switchable"]'),
    ).toHaveLength(1);
    expect(
      container.querySelector('[data-selected-benchmark="RMBench"]'),
    ).not.toBeNull();
    resultTable = container.querySelector('[data-result-table="switchable"]');
    expect(resultTable?.textContent).toContain("rmbench-config");
    expect(resultTable?.textContent).not.toContain("simpler-config");
  });

  test("renders a selectable baseline module with only approved configs", () => {
    const html = renderToStaticMarkup(
      <EvaluationDashboardView dashboard={trainingDashboard} mode="training" />,
    );

    expect(html).toContain("Baseline 对照");
    expect(html).toContain('data-baseline-selector="training-baseline"');
    expect(html).toContain('data-baseline-config="pi05_rmbench"');
    expect(html).toContain('data-baseline-option="pi05_rmbench"');
    expect(html).toContain('data-baseline-option="pi05_rmbench_lora"');
    expect(html).toContain('data-baseline-option="pi05_simpler"');
    expect(html).toContain(
      'data-baseline-option="pi05_simpler_lora_pytorch_baseline"',
    );
    expect(html).toContain(
      "pi05_rmbench - batch 64 / peak lr 5e-5 / memory off",
    );
    expect(html).toContain(
      "pi05_rmbench_lora - batch 64 / peak lr 5e-4 / memory off",
    );
    expect(html).toContain(
      "pi05_simpler - batch 512 / peak lr 5e-5 / memory off",
    );
    expect(html).toContain(
      "pi05_simpler_lora_pytorch_baseline - batch 128 / peak lr 1e-4 / memory off",
    );
    expect(html).toContain("完整配置");
    expect(html).toContain("LeRobotRMBenchDataConfig");
    expect(html).toContain("action horizon");
    expect(html).toContain("lora");
    expect(html).toContain("memory");
    expect(html).not.toContain('data-baseline-option="pi05_simpler_baseline"');
    expect(html).not.toContain('data-baseline-config="pi05_simpler_memory"');
  });

  test("preserves scroll position when changing baseline dropdown", () => {
    Object.defineProperty(window, "scrollX", {
      configurable: true,
      value: 12,
    });
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 640,
    });
    const scrollTo = vi
      .spyOn(window, "scrollTo")
      .mockImplementation(() => undefined);
    const requestAnimationFrame = vi.spyOn(window, "requestAnimationFrame");
    document.documentElement.style.scrollBehavior = "smooth";
    document.body.style.scrollBehavior = "smooth";

    const { container } = render(
      <EvaluationDashboardView dashboard={trainingDashboard} mode="training" />,
    );
    const baselineSelect = container.querySelector(
      '[data-baseline-selector="training-baseline"]',
    );
    expect(baselineSelect).not.toBeNull();

    fireEvent.change(baselineSelect!, { target: { value: "1" } });

    expect(scrollTo).toHaveBeenCalledWith({
      left: 12,
      top: 640,
      behavior: "instant",
    });
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    expect(document.documentElement.style.scrollBehavior).toBe("smooth");
    expect(document.body.style.scrollBehavior).toBe("smooth");
  });
});
