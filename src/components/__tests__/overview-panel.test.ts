import { describe, expect, test } from "vitest";

import { resolvePreviewSeekTime } from "@/components/overview-panel";
import type { EpisodeFrameInfo } from "@/app/[org]/[dataset]/[episode]/fetch-data";

function makeInfo(partial?: Partial<EpisodeFrameInfo>): EpisodeFrameInfo {
  return {
    episodeIndex: 0,
    videoUrl: "http://127.0.0.1/demo.mp4",
    firstFrameTime: 0,
    lastFrameTime: null,
    ...partial,
  };
}

describe("resolvePreviewSeekTime", () => {
  test("uses first frame time for first-frame previews", () => {
    expect(
      resolvePreviewSeekTime(
        makeInfo({ firstFrameTime: 1.25, lastFrameTime: 2.75 }),
        false,
        5,
      ),
    ).toBe(1.25);
  });

  test("clamps last-frame previews near the end of the loaded video", () => {
    expect(
      resolvePreviewSeekTime(
        makeInfo({ firstFrameTime: 0, lastFrameTime: null }),
        true,
        4,
      ),
    ).toBeCloseTo(4 - 1 / 60, 6);
  });

  test("never returns a last-frame time earlier than the first-frame time", () => {
    expect(
      resolvePreviewSeekTime(
        makeInfo({ firstFrameTime: 3.5, lastFrameTime: 3.45 }),
        true,
        10,
      ),
    ).toBe(3.5);
  });
});
