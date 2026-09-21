import { describe, expect, test } from "vitest";
import { detectInitialIdle } from "../detect";
import { frames, profile } from "./fixtures";

describe("noise-resistant leading activity", () => {
  test("bounded rapid back-and-forth targets do not pin onset to frame zero", () => {
    const rows = frames().map((r, i) => ({
      ...r,
      action: [r.action[0] + (i % 2 ? 0.006 : -0.006), 0],
    }));
    const r = detectInitialIdle(rows, profile());
    // Noise at the transition may retain one extra sample; never start later
    // than the true movement or confuse the initial oscillation with onset.
    expect(r.candidate!.activityFrame).toBeGreaterThanOrEqual(28);
    expect(r.candidate!.activityFrame).toBeLessThanOrEqual(29);
    expect(r.diagnostics!.ignoredSmallChanges).toBeGreaterThan(20);
    expect(
      r.diagnostics!.triggers.some((t) => t.reason === "confirmed_motion"),
    ).toBe(true);
  });
  test("alternating unrelated channels and state/command spikes cannot fake continuous action", () => {
    const p = profile();
    p.gripper = "none";
    p.channels[1].role = "joint";
    const rows = frames().map((r, i) => ({
      ...r,
      state: [i % 4 === 0 ? 0.008 : 0, i % 4 === 1 ? 0.008 : 0],
      action: [i % 4 === 2 ? 0.008 : 0, i % 4 === 3 ? 0.008 : 0],
    }));
    const r = detectInitialIdle(rows, p);
    expect(r.candidate).toBeNull();
    expect(r.reason).toBe("no_confirmed_start");
  });
  test("a brief small spike does not stop the search for later valid motion", () => {
    const rows = frames();
    rows[10].state[0] = 0.008;
    expect(detectInitialIdle(rows, profile()).candidate?.activityFrame).toBe(
      29,
    );
  });
  test("a significant transient remains protected even when later motion confirms the task", () => {
    const rows = frames();
    rows[20].state[0] = 0.1;
    const r = detectInitialIdle(rows, profile());
    expect(r.status).toBe("candidate");
    expect(r.candidate?.activityFrame).toBe(19);
    expect(r.candidate!.removedFrames.end).toBeLessThan(19);
    expect(r.diagnostics!.triggers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channel: "joint",
          signal: "state",
          frame: 20,
          reason: "significant_pulse",
        }),
      ]),
    );
    expect(
      r.diagnostics!.triggers.some(
        (t) => t.frame >= 30 && t.reason === "confirmed_motion",
      ),
    ).toBe(true);
  });
  test("slow drift mixed with rapid tiny jitter remains blocked", () => {
    const rows = frames().map((r, i) => ({
      ...r,
      state: [i * 0.001 + (i % 2 ? 0.003 : -0.003), 0],
      action: [0, 0],
    }));
    const r = detectInitialIdle(rows, profile());
    expect(r.candidate).toBeNull();
    expect(r.reason).toBe("slow_accumulated_motion");
  });
  test("window range can exceed the guard even if the motion returns to its initial position", () => {
    const rows = frames().map((r, i) => ({
      ...r,
      state: [i === 10 ? 0.015 : i === 11 ? -0.015 : 0, 0],
      action: [0, 0],
    }));
    const r = detectInitialIdle(rows, profile());
    expect(r.candidate).toBeNull();
    expect(r.diagnostics!.triggers.length).toBeGreaterThan(0);
  });
  test("gripper activity is protected even when its displacement fits within a noise band", () => {
    const rows = frames();
    rows[20].action[1] = 0.006;
    const r = detectInitialIdle(rows, profile());
    expect(r.candidate?.activitySource).toBe("gripper");
    expect(r.candidate?.activityFrame).toBe(19);
    expect(r.diagnostics!.triggers[0]).toMatchObject({
      channel: "gripper",
      signal: "action",
      frame: 20,
      reason: "gripper",
    });
  });
  test("absolute command-only motion is reported separately from measured motion", () => {
    const rows = frames().map((r) => ({ ...r, state: [0, 0] }));
    const r = detectInitialIdle(rows, profile());
    expect(r.candidate).not.toBeNull();
    expect(r.diagnostics!.triggers.every((t) => t.signal === "action")).toBe(
      true,
    );
  });
  test("raw timestamps determine confirmation duration on irregular sample intervals", () => {
    const rows = frames().map((r, i) => ({
      ...r,
      timestamp: i * 0.08 + (i % 2 ? 0.005 : 0),
    }));
    const r = detectInitialIdle(rows, profile());
    expect(r.candidate?.activityFrame).toBe(29);
    const t = r.diagnostics!.triggers.find(
      (t) => t.reason === "confirmed_motion",
    )!;
    expect(t.windowSeconds).toBeGreaterThanOrEqual(0.2);
    expect(t.displacement).toBeGreaterThan(t.displacementThreshold);
  });
  test("later real motion never clears an earlier slow-drift warning", () => {
    const rows = frames().map((r, i) => ({
      ...r,
      state: [i * 0.001 + r.state[0], 0],
      action: [r.action[0], 0],
    }));
    const r = detectInitialIdle(rows, profile());
    expect(r.status).toBe("needs_review");
    expect(r.reason).toBe("slow_accumulated_motion");
  });
  test("small command jitter never hides sustained measured-only movement", () => {
    const rows = frames().map((r, i) => ({
      ...r,
      action: [i % 2 ? 0.006 : -0.006, 0],
    }));
    const r = detectInitialIdle(rows, profile());
    expect(r.candidate?.activityFrame).toBe(29);
    expect(
      r
        .diagnostics!.triggers.filter((t) => t.reason === "confirmed_motion")
        .every((t) => t.signal === "state"),
    ).toBe(true);
  });
});
