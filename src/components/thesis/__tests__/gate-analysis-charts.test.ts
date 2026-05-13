import { describe, expect, test } from "vitest";

import { smoothGateGradData } from "@/components/thesis/gate-analysis-charts";

describe("GateAnalysisCharts", () => {
  test("smooths gradient norms with the requested 0.6 strength", () => {
    const data = smoothGateGradData([
      {
        step: 0,
        continuous_gate: 0,
        baseline_gate: 0,
        continuous_grad: 1,
        baseline_grad: 2,
      },
      {
        step: 1,
        continuous_gate: 0,
        baseline_gate: 0,
        continuous_grad: 2,
        baseline_grad: 4,
      },
    ]);

    expect(data[0].continuous_grad_smoothed).toBe(1);
    expect(data[0].baseline_grad_smoothed).toBe(2);
    expect(data[1].continuous_grad_smoothed).toBeCloseTo(1.4);
    expect(data[1].baseline_grad_smoothed).toBeCloseTo(2.8);
  });
});
