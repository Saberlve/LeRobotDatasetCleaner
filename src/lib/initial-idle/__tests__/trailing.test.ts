import { describe, expect, test, vi } from "vitest";
import {
  detectTrailingIdle,
  imageDifference,
  type VisualSampler,
} from "../trailing";
import { profile, frames } from "./fixtures";

function rows() {
  return frames().map((f, i) => ({
    ...f,
    state: [Math.min(i, 20) * 0.1, 0],
    action: [Math.min(i, 20) * 0.1, 0],
  }));
}
const picture = (value = 20) => [
  {
    camera: "scene",
    pixels: new Uint8ClampedArray([value, 40, 80, 255, 90, 70, 30, 255]),
  },
];
const stable: VisualSampler = async () => picture();

describe("trailing multimodal waiting", () => {
  test("keeps the final activity and confirmation sample, clips only original tail frames", async () => {
    const r = await detectTrailingIdle(rows(), profile(), 10, stable);
    expect(r.candidate?.removedFrames).toEqual({ start: 26, end: 59 });
    expect(r.candidate?.removedTime).toEqual({
      start: 2.6,
      endExclusive: 6,
      duration: 3.4,
    });
    expect(r.candidate!.retainedContextSeconds).toBeGreaterThanOrEqual(0.5);
  });
  test("a stationary arm does not hide later gripper activity", async () => {
    const data = rows().map((f, i) => ({
      ...f,
      state: [f.state[0], i >= 40 ? 1 : 0],
      action: [f.action[0], i >= 40 ? 1 : 0],
    }));
    const r = await detectTrailingIdle(data, profile(), 10, stable);
    expect(r.candidate?.removedFrames.start).toBe(46);
    expect(r.candidate?.evidence.join()).toContain("gripper");
  });
  test("scene movement after robot stops delays the cut", async () => {
    const r = await detectTrailingIdle(rows(), profile(), 10, async (f) =>
      picture(f.frameIndex < 35 ? 200 : 20),
    );
    expect(r.candidate?.activitySource).toBe("visual");
    expect(r.candidate?.removedFrames.start).toBe(41);
  });
  test("slow image drift is compared with the final frame, not only its neighbor", async () => {
    const p = profile();
    p.tailVisual = { mean: 0.005, fraction: 1, pixel: 1 };
    const r = await detectTrailingIdle(rows(), p, 10, async (f) =>
      picture(20 + 59 - f.frameIndex),
    );
    expect(r.status).toBe("no_candidate");
  });
  test("slow cumulative signal motion and an entirely static episode require review", async () => {
    const data = rows().map((f) => ({
      ...f,
      state: [f.frameIndex * 0.001, 0],
      action: [0, 0],
    }));
    expect((await detectTrailingIdle(data, profile(), 10, stable)).reason).toBe(
      "slow_accumulated_motion",
    );
    const stationary = rows().map((f) => ({
      ...f,
      state: [0, 0],
      action: [0, 0],
    }));
    expect(
      (await detectTrailingIdle(stationary, profile(), 10, stable)).reason,
    ).toBe("no_confirmed_end");
  });
  test("ongoing command or activity at the last frame never creates a tail", async () => {
    const p = profile();
    p.channels[0].actionMode = "velocity";
    const data = rows().map((f) => ({ ...f, action: [1, 0] }));
    expect(
      (await detectTrailingIdle(data, p, 10, stable)).candidate,
    ).toBeNull();
    expect(
      (await detectTrailingIdle(frames(), profile(), 10, stable)).candidate,
    ).toBeNull();
  });
  test("missing camera, decode failures and timing gaps fail closed", async () => {
    expect(
      (await detectTrailingIdle(rows(), profile(), 10, async () => [])).reason,
    ).toBe("tail_video_unavailable");
    expect(
      (
        await detectTrailingIdle(rows(), profile(), 10, async () => {
          throw Error("decode");
        })
      ).status,
    ).toBe("needs_review");
    const data = rows();
    data[50].timestamp = 100;
    const sample = vi.fn(stable);
    expect((await detectTrailingIdle(data, profile(), 10, sample)).reason).toBe(
      "timestamp_gap_or_disorder",
    );
    expect(sample).not.toHaveBeenCalled();
  });
  test("checks all cameras and allows cancellation without a result", async () => {
    const r = await detectTrailingIdle(rows(), profile(), 10, async (f) => [
      ...picture(),
      {
        camera: "wrist",
        pixels: picture(f.frameIndex < 35 ? 200 : 20)[0].pixels,
      },
    ]);
    expect(r.candidate?.removedFrames.start).toBe(41);
    const controller = new AbortController();
    controller.abort();
    await expect(
      detectTrailingIdle(
        rows(),
        profile(),
        10,
        stable,
        undefined,
        controller.signal,
      ),
    ).rejects.toThrow();
  });
  test("image metrics detect localized changes and ignore alpha", () => {
    const a = picture()[0].pixels,
      b = new Uint8ClampedArray(a);
    b[3] = 0;
    expect(imageDifference(a, b, 0.06)).toEqual({ mean: 0, fraction: 0 });
    b[0] = 255;
    expect(imageDifference(a, b, 0.06).fraction).toBe(0.5);
  });
});
