import { describe, expect, test } from "vitest";
import { detectInitialIdle } from "../detect";
import { frames, profile } from "./fixtures";

describe("initial waiting detection", () => {
  test("proposes original inclusive prefix and preserves pre-motion context without mutating input", () => {
    const rows = frames();
    const original = JSON.stringify(rows);
    const result = detectInitialIdle(rows, profile());
    expect(result.status).toBe("candidate");
    expect(result.candidate).toMatchObject({
      removedFrames: { start: 0, end: 23 },
      activityFrame: 29,
      removedTime: { start: 0, endExclusive: 2.4, duration: 2.4 },
      activitySource: "motion",
      reviewStatus: "pending",
    });
    expect(result.candidate!.retainedContextSeconds).toBeCloseTo(0.5);
    expect(JSON.stringify(rows)).toBe(original);
  });

  test("uses timestamps, not fps/frame counts, to retain context", () => {
    const rows = frames().map((r, i) => ({ ...r, timestamp: 12 + i * 0.113 }));
    const candidate = detectInitialIdle(rows, profile()).candidate!;
    const firstKept = rows[candidate.removedFrames.end + 1];
    expect(
      candidate.activityTimestamp - firstKept.timestamp,
    ).toBeGreaterThanOrEqual(0.5);
    expect(candidate.removedTime.start).toBe(12);
  });

  test("no candidate when activity begins immediately or context consumes the wait", () => {
    const rows = frames().map((r, i) => ({
      ...r,
      state: [i * 0.1, 0],
      action: [i * 0.1, 0],
    }));
    expect(detectInitialIdle(rows, profile()).status).toBe("no_candidate");
    expect(
      detectInitialIdle(frames(), { ...profile(), contextSeconds: 4 }).status,
    ).toBe("no_candidate");
  });

  test.each(["state", "action"] as const)(
    "protects one-frame gripper activity in %s",
    (key) => {
      const rows = frames().map((r) => ({
        ...r,
        state: [0, 0],
        action: [0, 0],
      }));
      rows[20][key][1] = 0.1;
      const result = detectInitialIdle(rows, profile());
      expect(result.candidate).toMatchObject({
        activitySource: "gripper",
        activityFrame: 19,
        removedFrames: { start: 0, end: 13 },
      });
    },
  );

  test.each(["velocity", "delta"] as const)(
    "constant nonzero %s command is active",
    (actionMode) => {
      const p = profile();
      p.channels[0].actionMode = actionMode;
      const rows = frames().map((r) => ({ ...r, action: [0.3, 0] }));
      expect(detectInitialIdle(rows, p).reason).toBe(
        "active_command_at_first_frame",
      );
    },
  );

  test("constant nonzero absolute targets can be idle", () => {
    const rows = frames().map((r) => ({
      ...r,
      state: r.state.map((v) => v + 2),
      action: r.action.map((v) => v + 2),
    }));
    expect(detectInitialIdle(rows, profile()).candidate?.activityFrame).toBe(
      29,
    );
  });

  test.each([0, 1])(
    "slow accumulated movement on channel %i is not trimmed",
    (channel) => {
      const rows = frames().map((r, i) => {
        const values = [0, 0];
        values[channel] = i * 0.001;
        return { ...r, state: [...values], action: [...values] };
      });
      expect(detectInitialIdle(rows, profile())).toMatchObject({
        status: "needs_review",
        reason: "slow_accumulated_motion",
        candidate: null,
      });
    },
  );

  test("never deletes an entirely still episode", () => {
    const rows = frames().map((r) => ({ ...r, state: [0, 0], action: [0, 0] }));
    expect(detectInitialIdle(rows, profile())).toMatchObject({
      status: "needs_review",
      reason: "no_confirmed_start",
      candidate: null,
    });
  });

  test("a short arm pulse needs review rather than being silently skipped", () => {
    const rows = frames();
    rows[10].state[0] = 0.1;
    expect(
      detectInitialIdle(rows, { ...profile(), activityConfirmSeconds: 0.4 })
        .status,
    ).toBe("needs_review");
  });

  test("trusted start event precedes motion, earlier motion still wins", () => {
    const p = { ...profile(), startEventKey: "control_started" };
    const withEvent = (at: number) =>
      frames().map((r, i) => ({ ...r, startEvent: i >= at }));
    expect(detectInitialIdle(withEvent(20), p).candidate).toMatchObject({
      activityFrame: 20,
      activitySource: "start_event",
    });
    expect(detectInitialIdle(withEvent(50), p).candidate?.activityFrame).toBe(
      29,
    );
    expect(detectInitialIdle(withEvent(0), p).status).toBe("no_candidate");
    expect(detectInitialIdle(frames(), p).reason).toBe("missing_start_event");
  });

  test("optional tracking error protects already commanded motion", () => {
    const p = profile();
    p.channels[0].trackingError = 0.1;
    const rows = frames();
    rows[0].action[0] = 1;
    expect(detectInitialIdle(rows, p).reason).toBe(
      "initial_target_tracking_error",
    );
  });

  test("periodic angle wrap requires explicit configuration", () => {
    const rows = frames().map((r, i) => {
      const a = i === 0 ? Math.PI - 0.001 : -Math.PI + 0.001 + r.state[0];
      return { ...r, state: [a, 0], action: [a, 0] };
    });
    const p = profile();
    p.channels[0].period = 2 * Math.PI;
    expect(detectInitialIdle(rows, p).candidate?.activityFrame).toBe(29);
    expect(detectInitialIdle(rows, profile()).status).toBe("needs_review");
  });

  test.each([
    "nan",
    "missing",
    "dimensions",
    "duplicate_time",
    "reverse_time",
    "gap",
    "skipped_frame",
    "duplicate_frame",
  ])("rejects corrupt data: %s", (kind) => {
    const rows = frames();
    switch (kind) {
      case "nan":
        rows[45].state[0] = Number.NaN;
        break;
      case "missing":
        rows[45].action = undefined as unknown as number[];
        break;
      case "dimensions":
        rows[45].state = [0];
        break;
      case "duplicate_time":
        rows[45].timestamp = rows[44].timestamp;
        break;
      case "reverse_time":
        rows[45].timestamp = 0;
        break;
      case "gap":
        rows[45].timestamp += 1;
        break;
      case "skipped_frame":
        rows.splice(45, 1);
        break;
      case "duplicate_frame":
        rows[45].frameIndex = 44;
        break;
    }
    expect(detectInitialIdle(rows, profile())).toMatchObject({
      status: "needs_review",
      candidate: null,
    });
  });
});
