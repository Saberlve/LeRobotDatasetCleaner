import { expect, test } from "vitest";
import {
  captureTimeMapping,
  episodeToVideoTime,
  videoToEpisodeTime,
  videoRateAt,
} from "../video-time";
import type { VideoInfo } from "@/types";

test("egg_pick episode 3 uses capture time instead of 60*t at nine seconds", () => {
  const clocks = [
    { action_send_start_ns: 189730114484615n },
    { action_send_start_ns: 189739081093793n },
    { action_send_start_ns: 189739147766960n },
  ];
  const start = 44.91666666666667;
  const mapping = captureTimeMapping(
    clocks,
    [
      { capture_monotonic_ns: 189730085205793n, video_timestamp_s: start },
      {
        capture_monotonic_ns: 189739059999943n,
        video_timestamp_s: start + 501 / 60,
      },
      {
        capture_monotonic_ns: 189739084000000n,
        video_timestamp_s: start + 502 / 60,
      },
    ],
    [0, 9, 9 + 1 / 15],
  );
  expect(mapping).toBeDefined();
  const info: VideoInfo = {
    filename: "photon_right",
    url: "/tactile.mp4",
    isSegmented: true,
    segmentStart: start,
    timeMapping: mapping,
  };
  const mediaTime = episodeToVideoTime(info, 9);
  expect(Math.floor((mediaTime - start) * 60)).toBe(501);
  expect(mediaTime).toBeLessThan(start + 502 / 60);
  expect(videoToEpisodeTime(info, mediaTime)).toBeCloseTo(9, 8);
  expect(mapping!.episodeTimestamps[0]).toBeLessThan(0);
});

test("native presentation runs slower and clamps within its own episode", () => {
  const info: VideoInfo = {
    filename: "native",
    url: "/native.mp4",
    timeMapping: {
      episodeTimestamps: [-0.02, 5, 10],
      videoTimestamps: [30, 34.5, 39],
    },
  };
  expect(videoRateAt(info, 9)).toBeCloseTo(0.9);
  expect(episodeToVideoTime(info, -1)).toBe(30);
  expect(episodeToVideoTime(info, 11)).toBe(39);
  expect(videoToEpisodeTime(info, 34.5)).toBe(5);
});

test("ordinary v2 and v3 feeds retain their linear episode clock", () => {
  const plain: VideoInfo = { filename: "camera", url: "/camera.mp4" };
  const segmented = { ...plain, isSegmented: true, segmentStart: 48.5 };
  expect(episodeToVideoTime(plain, 9)).toBe(9);
  expect(episodeToVideoTime(segmented, 9)).toBe(57.5);
  expect(videoToEpisodeTime(segmented, 57.5)).toBe(9);
  expect(videoRateAt(segmented, 9)).toBe(1);
});

test("invalid or incomplete clocks cannot create a misleading mapping", () => {
  expect(
    captureTimeMapping([{ action_send_start_ns: 1n }], [], [0]),
  ).toBeUndefined();
  expect(
    captureTimeMapping(
      [{ action_send_start_ns: 1n }, { action_send_start_ns: 1n }],
      [{ capture_monotonic_ns: 1n, video_timestamp_s: 0 }],
      [0, 1],
    ),
  ).toBeUndefined();
});

test("int64 clock offsets retain precision above Number.MAX_SAFE_INTEGER", () => {
  const origin = 9007199254740991000n;
  const map = captureTimeMapping(
    [
      { action_send_start_ns: origin },
      { action_send_start_ns: origin + 1000000000n },
    ],
    [{ capture_monotonic_ns: origin + 123456789n, video_timestamp_s: 0 }],
    [0, 1],
  );
  expect(map?.episodeTimestamps[0]).toBe(0.123456789);
});
