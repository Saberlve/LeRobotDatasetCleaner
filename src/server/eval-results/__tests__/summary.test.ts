import { describe, expect, test } from "vitest";

import { loadEvaluationDashboard } from "@/server/eval-results/summary";

describe("eval result summary", () => {
  test("loads SimplerEnv summaries and RMBench videos from local eval_results", async () => {
    const dashboard = await loadEvaluationDashboard();

    expect(dashboard.simpler.runs.length).toBeGreaterThan(0);
    expect(dashboard.simpler.runs[0].steps.length).toBeGreaterThan(0);
    expect(
      dashboard.simpler.runs.some((run) =>
        run.steps.some((step) =>
          step.tasks.some((task) => task.name.includes("Spoon")),
        ),
      ),
    ).toBe(true);
    expect(
      dashboard.simpler.runs.some((run) =>
        run.steps.some((step) => step.videos.length > 0),
      ),
    ).toBe(true);

    expect(dashboard.rmbench.runs.length).toBeGreaterThan(0);
    expect(
      dashboard.rmbench.runs.some((run) =>
        run.timestamps.some((timestamp) => timestamp.videos.length > 0),
      ),
    ).toBe(true);
  });

  test("exposes the configured W&B URL", async () => {
    const dashboard = await loadEvaluationDashboard();

    expect(dashboard.wandbUrl).toBe(
      "https://wandb.ai/saberlve9-massachusetts-institute-of-technology/openpi?nw=nwusersaberlve9",
    );
  });

  test("loads training hyperparameters from openpi-simpler config.py", async () => {
    const dashboard = await loadEvaluationDashboard();

    expect(dashboard.training.configs.length).toBeGreaterThan(0);
    expect(
      dashboard.training.configs.some(
        (config) =>
          config.name === "pi05_simpler_memory_pytorch_full" &&
          config.batchSize === "128" &&
          config.memory.enabled &&
          config.memory.momentTokenCount === "4",
      ),
    ).toBe(true);
  });
});
