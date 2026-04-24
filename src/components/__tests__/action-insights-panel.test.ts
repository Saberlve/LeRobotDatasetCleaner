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
      title: "Expected one-step action/state offset",
      tone: "ok",
      detail:
        "Peak lag 1 matches the LeRobot convention: state[t] is observed before action[t], and action[t] targets the transition toward state[t+1]. Extra delay: 0 frames.",
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
      title: "Extra control delay: 2 steps (0.067s)",
      tone: "warn",
    });
  });
});
