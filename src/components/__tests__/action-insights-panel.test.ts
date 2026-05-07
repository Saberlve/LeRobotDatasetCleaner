import { describe, expect, test } from "vitest";

import { getStateActionAlignmentInterpretation } from "@/components/action-insights-panel";

describe("getStateActionAlignmentInterpretation", () => {
  test("treats lag 1 as the expected LeRobot action-to-next-state offset", () => {
    expect(
      getStateActionAlignmentInterpretation({
        meanPeakLag: 1,
        fps: 30,
        lagRangeMin: 1,
        lagRangeMax: 1,
      }),
    ).toMatchObject({
      title: "符合预期的单步动作/状态偏移",
      tone: "ok",
      detail:
        "峰值滞后 1 符合 LeRobot 约定：state[t] 在 action[t] 之前被观测，action[t] 目标为 state[t+1] 的过渡。额外延迟：0 帧。",
    });
  });

  test("reports only delay beyond the expected one-step offset", () => {
    expect(
      getStateActionAlignmentInterpretation({
        meanPeakLag: 3,
        fps: 30,
        lagRangeMin: 3,
        lagRangeMax: 3,
      }),
    ).toMatchObject({
      title: "额外控制延迟：2 步 (0.067秒)",
      tone: "warn",
    });
  });
});
