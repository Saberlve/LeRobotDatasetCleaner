import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import {
  TRAINING_CURVE_METRICS,
  buildRunComparisonCurveData,
  formatSelectedRunsLabel,
} from "@/components/thesis/training-curves";

describe("TrainingCurves", () => {
  test("uses valid browser-facing OKLCH color strings for chart SVG props", () => {
    const source = readFileSync(
      "src/components/thesis/training-curves.tsx",
      "utf8",
    );

    const invalidBrowserOklch =
      /(?:stroke|fill|backgroundColor|border)=?\{?\s*["'`][^"'`]*oklch\([^)]*_[^)]*\)/g;

    expect(source.match(invalidBrowserOklch)).toEqual(null);
  });

  test("offers only trainable scalar metrics and excludes success", () => {
    expect(TRAINING_CURVE_METRICS.map((metric) => metric.id)).toEqual([
      "loss",
      "learning_rate",
      "grad_norm",
    ]);
  });

  test("formats the experiment dropdown label from selected runs", () => {
    expect(formatSelectedRunsLabel([])).toBe("选择实验");
    expect(formatSelectedRunsLabel([{ id: "run_a", name: "baseline" }])).toBe(
      "baseline (run_a)",
    );
    expect(
      formatSelectedRunsLabel([
        { id: "run_a", name: "baseline" },
        { id: "run_b", name: "memory" },
      ]),
    ).toBe("已选 2 个实验");
  });

  test("builds aligned raw and smoothed values for multiple selected runs", () => {
    const chartData = buildRunComparisonCurveData(
      [
        {
          runId: "run_a",
          history: [
            { step: 0, loss: 0.2 },
            { step: 10, loss: 0.1 },
          ],
        },
        {
          runId: "run_b",
          history: [
            { step: 0, loss: 0.4 },
            { step: 20, loss: 0.2 },
          ],
        },
      ],
      "loss",
      0.5,
    );

    expect(chartData).toMatchObject([
      {
        step: 0,
        run_a_value: 0.2,
        run_a_smoothed: 0.2,
        run_b_value: 0.4,
        run_b_smoothed: 0.4,
      },
      {
        step: 10,
        run_a_value: 0.1,
      },
      {
        step: 20,
        run_b_value: 0.2,
      },
    ]);
    expect(chartData[1].run_a_smoothed).toBeCloseTo(0.15);
    expect(chartData[2].run_b_smoothed).toBeCloseTo(0.3);
  });
});
