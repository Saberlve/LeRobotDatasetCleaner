import { describe, expect, test } from "vitest";
import {
  channelActivity,
  nearestFrame,
  readDecision,
  skipRemoved,
} from "../review";
import { frames, profile } from "./fixtures";

describe("review time and persistence boundaries", () => {
  test("nearest original sample handles irregular times and bounds", () => {
    const rows = frames()
      .slice(0, 3)
      .map((r, i) => ({ ...r, timestamp: [0, 0.12, 0.25][i] }));
    expect(nearestFrame(rows, 0.1)).toBe(1);
    expect(nearestFrame(rows, -1)).toBe(0);
    expect(nearestFrame(rows, 10)).toBe(2);
  });
  test("trimmed preview skips marked intervals but retains the first kept sample", () => {
    const rows = frames(),
      cuts = [
        { start: 0, end: 16 },
        { start: 30, end: 33 },
      ];
    expect(skipRemoved(rows, cuts, 0)).toBe(1.7);
    expect(skipRemoved(rows, cuts, 1.7)).toBe(1.7);
    expect(skipRemoved(rows, cuts, 3.1)).toBe(3.4);
    expect(skipRemoved(rows, [{ start: 55, end: 59 }], 5.6)).toBeNull();
  });
  test("evidence shows measured change/s and native velocity commands", () => {
    const channel = profile().channels[0];
    expect(channelActivity(frames(), channel)[30].measured).toBeCloseTo(1);
    expect(
      channelActivity(frames(), { ...channel, actionMode: "velocity" })[30]
        .command,
    ).toBeCloseTo(0.1);
  });
  test("malformed or invalid persisted decisions are ignored", () => {
    expect(readDecision({ getItem: () => "broken" }, "key")).toBeNull();
    expect(
      readDecision(
        {
          getItem: () =>
            JSON.stringify({
              status: "queued",
              note: "",
              updatedAt: "today",
              interval: { start: 3, end: 2 },
            }),
        },
        "key",
      ),
    ).toBeNull();
  });
});
