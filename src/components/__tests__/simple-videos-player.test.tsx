// @vitest-environment jsdom
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { TimeProvider, useTime } from "@/context/time-context";
import { SimpleVideosPlayer } from "../simple-videos-player";
import { FramePlaybackShortcuts } from "../frame-playback-shortcuts";
import type { VideoInfo } from "@/types";

vi.mock("../video-overlay-canvas", () => ({ VideoOverlayCanvas: () => null }));
vi.mock("../colormapped-video", () => ({ ColormappedVideo: () => null }));
vi.mock("@/utils/auth", () => ({ proxyHfUrl: (url: string) => url }));

const ready = vi.fn();
const segmented: VideoInfo = {
  filename: "camera",
  url: "/video.mp4",
  isSegmented: true,
  segmentStart: 10,
  segmentEnd: 20,
};
function Clock({ loop = false }: { loop?: boolean }) {
  const { currentTime, isPlaying, setIsPlaying, subscribe, seek } = useTime();
  React.useEffect(() => {
    if (!loop) return;
    return subscribe((time) => {
      if (time >= 9.9) seek(0);
    });
  }, [loop, subscribe, seek]);
  return (
    <>
      <button onClick={() => setIsPlaying(true)}>start</button>
      <button onClick={() => seek(9)}>seek9</button>
      <button onClick={() => setIsPlaying(false)}>pause</button>
      <div data-testid="clock">
        {currentTime}:{String(isPlaying)}
      </div>
    </>
  );
}
function mount(
  videosInfo: VideoInfo[] = [segmented],
  compact = false,
  loop = false,
  timestamps?: number[],
) {
  const result = render(
    <TimeProvider duration={10}>
      <SimpleVideosPlayer
        videosInfo={videosInfo}
        onVideosReady={ready}
        compact={compact}
        fps={10}
        frameTimestamps={timestamps}
      />
      <FramePlaybackShortcuts fps={10} timestamps={timestamps ?? [0, 9.9]} />
      <Clock loop={loop} />
    </TimeProvider>,
  );
  return Array.from(result.container.querySelectorAll("video"));
}
function state(video: HTMLVideoElement, readyState: number, seeking = false) {
  Object.defineProperty(video, "readyState", {
    configurable: true,
    value: readyState,
  });
  Object.defineProperty(video, "seeking", {
    configurable: true,
    value: seeking,
  });
}
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  ready.mockClear();
});
test("timeout reports waiting without declaring readiness or starting playback", () => {
  const [video] = mount();
  act(() => vi.advanceTimersByTime(10000));
  expect(screen.getByRole("status").textContent).toContain("仍在加载");
  expect(ready).not.toHaveBeenCalled();
  expect(video.play).not.toHaveBeenCalled();
  state(video, 2);
  fireEvent.loadedData(video);
  expect(ready).not.toHaveBeenCalled();
  state(video, 2);
  fireEvent.seeked(video);
  expect(ready).toHaveBeenCalledOnce();
  expect(video.play).toHaveBeenCalledOnce();
  expect(screen.queryByRole("status")).toBeNull();
});
test("all cameras must finish seeking; duplicate events cannot count twice", () => {
  const [first, second] = mount([
    segmented,
    { ...segmented, filename: "second" },
  ]);
  for (const video of [first, second]) {
    state(video, 2, true);
    fireEvent.loadedData(video);
  }
  fireEvent.seeked(first);
  expect(ready).not.toHaveBeenCalled();
  state(first, 2);
  fireEvent.seeked(first);
  fireEvent.seeked(first);
  fireEvent.loadedData(first);
  expect(ready).not.toHaveBeenCalled();
  state(second, 1);
  fireEvent.seeked(second);
  expect(ready).not.toHaveBeenCalled();
  state(second, 2);
  fireEvent.seeked(second);
  expect(ready).toHaveBeenCalledOnce();
});
test("a loaded video already at segment start does not wait for a nonexistent seek", () => {
  const [video] = mount([{ ...segmented, segmentStart: 0 }]);
  state(video, 2);
  fireEvent.loadedData(video);
  expect(ready).toHaveBeenCalledOnce();
});
test("ordinary videos still become ready on canplaythrough", () => {
  const [video] = mount([{ filename: "rgb", url: "/rgb.mp4" }]);
  fireEvent.canPlayThrough(video);
  expect(ready).toHaveBeenCalledOnce();
  act(() => vi.advanceTimersByTime(10000));
  expect(screen.queryByRole("status")).toBeNull();
});

test.each(["canplay", "loadeddata"])(
  "late %s after seek completion releases readiness",
  (eventName) => {
    const [video] = mount();
    state(video, 2);
    fireEvent.loadedData(video);
    state(video, 1);
    fireEvent.seeked(video);
    expect(ready).not.toHaveBeenCalled();
    state(video, 2);
    fireEvent(video, new Event(eventName));
    expect(ready).toHaveBeenCalledOnce();
  },
);

test("late loading events after playback starts do not rewind the video", () => {
  const [video] = mount();
  state(video, 2);
  fireEvent.loadedData(video);
  fireEvent.seeked(video);
  video.currentTime = 12;
  fireEvent.loadedData(video);
  expect(video.currentTime).toBe(12);
  expect(ready).toHaveBeenCalledOnce();
});

test("unmount cancels readiness listeners and the slow-loading timer", () => {
  const [video] = mount();
  state(video, 2);
  fireEvent.loadedData(video);
  cleanup();
  fireEvent.seeked(video);
  act(() => vi.advanceTimersByTime(10000));
  expect(ready).not.toHaveBeenCalled();
  expect(video.play).not.toHaveBeenCalled();
});

const native: VideoInfo = {
  filename: "tactile",
  url: "/native.mp4",
  isSegmented: true,
  segmentStart: 30,
  segmentEnd: 39.1,
  timeMapping: {
    episodeTimestamps: [0, 9, 9.9],
    videoTimestamps: [30, 38.35, 38.99],
  },
};

test("seeks and pauses align native media without truncating the episode", () => {
  const [camera, tactile] = mount(
    [segmented, native],
    true,
    false,
    [0, 9, 9.9],
  );
  for (const video of [camera, tactile]) {
    state(video, 2);
    fireEvent.loadedData(video);
    fireEvent.seeked(video);
  }
  fireEvent.click(screen.getByText("seek9"));
  expect(camera.currentTime).toBe(19);
  expect(tactile.currentTime).toBeCloseTo(38.35);
  fireEvent.click(screen.getByText("start"));
  tactile.currentTime = 38.99;
  camera.currentTime = 19.9;
  fireEvent.timeUpdate(camera);
  expect(tactile.currentTime).toBeCloseTo(38.99);
  expect(screen.getByTestId("clock").textContent).toBe("9.9:false");
});

test("continuous playback adjusts native speed and corrects decoder drift", () => {
  const [camera, tactile] = mount([segmented, native], true);
  for (const video of [camera, tactile]) {
    state(video, 2);
    fireEvent.loadedData(video);
    fireEvent.seeked(video);
  }
  fireEvent.click(screen.getByText("start"));
  camera.currentTime = 15;
  tactile.currentTime = 34;
  fireEvent.timeUpdate(camera);
  expect(tactile.currentTime).toBeCloseTo(30 + (5 * 8.35) / 9);
  expect(tactile.playbackRate).toBeLessThan(1);
  tactile.currentTime = 37;
  fireEvent.click(screen.getByText("pause"));
  expect(tactile.currentTime).toBeCloseTo(30 + (5 * 8.35) / 9);
});

test("switching segments reuses video elements and waits for the new seek", async () => {
  const ui = (info: VideoInfo[]) => (
    <TimeProvider duration={10}>
      <SimpleVideosPlayer videosInfo={info} onVideosReady={ready} compact />
    </TimeProvider>
  );
  const result = render(ui([segmented]));
  const video = result.container.querySelector("video")!;
  state(video, 2);
  fireEvent.loadedData(video);
  fireEvent.seeked(video);
  ready.mockClear();
  state(video, 2, true);
  result.rerender(ui([{ ...segmented, segmentStart: 30, segmentEnd: 40 }]));
  expect(result.container.querySelector("video")).toBe(video);
  await act(async () => {
    await Promise.resolve();
  });
  expect(video.currentTime).toBe(30);
  expect(ready).not.toHaveBeenCalled();
  state(video, 2);
  fireEvent.seeked(video);
  expect(ready).toHaveBeenCalledOnce();
  result.rerender(ui([{ ...segmented, url: "/other-file.mp4" }]));
  expect(result.container.querySelector("video")).not.toBe(video);
});

test("old episode listeners cannot clamp new seeks before passive cleanup", () => {
  let observed = 0;
  function LayoutSeek({ switched }: { switched: boolean }) {
    React.useLayoutEffect(() => {
      if (!switched) return;
      const video = document.querySelectorAll("video")[1];
      video.currentTime = 30;
      fireEvent.timeUpdate(video);
      observed = video.currentTime;
    }, [switched]);
    return null;
  }
  const ui = (switched: boolean) => (
    <TimeProvider duration={10}>
      <SimpleVideosPlayer
        compact
        videosInfo={
          switched
            ? [
                { ...segmented, segmentStart: 30, segmentEnd: 40 },
                {
                  ...segmented,
                  filename: "second",
                  segmentStart: 30,
                  segmentEnd: 40,
                },
              ]
            : [segmented, { ...segmented, filename: "second" }]
        }
        frameTimestamps={switched ? [0, 7.4] : [0, 9.9]}
      />
      <LayoutSeek switched={switched} />
    </TimeProvider>
  );
  const result = render(ui(false));
  for (const video of document.querySelectorAll("video")) {
    state(video, 2);
    fireEvent.loadedData(video);
    fireEvent.seeked(video);
  }
  result.rerender(ui(true));
  expect(observed).toBe(30);
});

test("a native-only primary reports episode time using the inverse capture map", () => {
  const [video] = mount([native], true, false, [0, 9, 9.9]);
  state(video, 2);
  fireEvent.loadedData(video);
  fireEvent.seeked(video);
  fireEvent.click(screen.getByText("seek9"));
  expect(video.currentTime).toBeCloseTo(38.35);
  fireEvent.click(screen.getByText("start"));
  video.currentTime = 38.99;
  fireEvent.timeUpdate(video);
  expect(screen.getByTestId("clock").textContent).toBe("9.9:false");
  expect(video.currentTime).toBeCloseTo(38.99);
});

test.each([false, true])(
  "segmented playback holds the last episode frame (compact=%s)",
  (compact) => {
    const [first, second] = mount(
      [
        segmented,
        { ...segmented, filename: "second", segmentStart: 30, segmentEnd: 40 },
      ],
      compact,
    );
    for (const video of [first, second]) {
      state(video, 2);
      fireEvent.loadedData(video);
      fireEvent.seeked(video);
    }
    fireEvent.click(screen.getByText("start"));
    first.currentTime = 20.1;
    second.currentTime = 39.8;
    fireEvent.timeUpdate(first);
    expect(first.currentTime).toBeCloseTo(19.9);
    expect(second.currentTime).toBeCloseTo(39.9);
    expect(first.pause).toHaveBeenCalled();
    expect(second.pause).toHaveBeenCalled();
    expect(screen.getByTestId("clock").textContent).toBe("9.9:false");
    const playCalls = vi.mocked(first.play).mock.calls.length;
    fireEvent.click(screen.getByText("start"));
    expect(first.play).toHaveBeenCalledTimes(playCalls);
    expect(first.currentTime).toBeCloseTo(19.9);
    expect(screen.getByTestId("clock").textContent).toBe("9.9:false");
    fireEvent.timeUpdate(first);
    fireEvent.ended(first);
    fireEvent.loadedData(first);
    expect(first.currentTime).toBeCloseTo(19.9);
    expect(screen.getByTestId("clock").textContent).toBe("9.9:false");
    fireEvent.keyDown(window, { key: " " });
    expect(first.currentTime).toBe(10);
    expect(second.currentTime).toBe(30);
    expect(screen.getByTestId("clock").textContent).toBe("0:true");
  },
);

test("a secondary camera reaching the segment end never rewinds", () => {
  const [first, second] = mount([
    segmented,
    { ...segmented, filename: "second" },
  ]);
  first.currentTime = 19;
  second.currentTime = 20.1;
  fireEvent.timeUpdate(second);
  expect(second.currentTime).toBeCloseTo(19.9);
  expect(first.currentTime).toBe(19);
});

test.each([false, true])(
  "ordinary playback pauses at its natural end (compact=%s)",
  (compact) => {
    const [video] = mount([{ filename: "rgb", url: "/rgb.mp4" }], compact);
    Object.defineProperty(video, "duration", { configurable: true, value: 10 });
    fireEvent.canPlayThrough(video);
    fireEvent.click(screen.getByText("start"));
    video.currentTime = 10;
    fireEvent.ended(video);
    expect(video.currentTime).toBe(9.9);
    expect(screen.getByTestId("clock").textContent).toBe("9.9:false");
    const playCalls = vi.mocked(video.play).mock.calls.length;
    fireEvent.click(screen.getByText("start"));
    expect(video.play).toHaveBeenCalledTimes(playCalls);
    expect(video.currentTime).toBe(9.9);
    expect(screen.getByTestId("clock").textContent).toBe("9.9:false");
    fireEvent.keyDown(window, { key: " " });
    expect(video.currentTime).toBe(0);
    expect(screen.getByTestId("clock").textContent).toBe("0:true");
  },
);

test("an explicit review loop can redirect the end report and keep playing", () => {
  const [video] = mount([segmented], true, true);
  state(video, 2);
  fireEvent.loadedData(video);
  fireEvent.seeked(video);
  fireEvent.click(screen.getByText("start"));
  video.currentTime = 20;
  fireEvent.timeUpdate(video);
  expect(video.currentTime).toBe(10);
  expect(screen.getByTestId("clock").textContent).toBe("0:true");
});

test("shared video stops at the actual final source frame and only Space restarts it", () => {
  const [video] = mount([segmented], true, false, [0, 0.13, 9.63]);
  state(video, 2);
  fireEvent.loadedData(video);
  fireEvent.seeked(video);
  fireEvent.click(screen.getByText("start"));
  video.currentTime = 19.7;
  fireEvent.timeUpdate(video);
  expect(video.currentTime).toBeCloseTo(19.63);
  expect(screen.getByTestId("clock").textContent).toBe("9.63:false");
  fireEvent.timeUpdate(video);
  fireEvent.loadedData(video);
  fireEvent.ended(video);
  act(() => vi.advanceTimersByTime(10000));
  expect(video.currentTime).toBeCloseTo(19.63);
  expect(screen.getByTestId("clock").textContent).toBe("9.63:false");
  fireEvent.keyDown(window, { key: " " });
  expect(video.currentTime).toBe(10);
  expect(screen.getByTestId("clock").textContent).toBe("0:true");
});

test.each([false, true])(
  "decoded playback frames hold the episode end without replaying (compact=%s)",
  (compact) => {
    const callbacks: VideoFrameRequestCallback[] = [];
    const prototype = HTMLVideoElement.prototype;
    const originalRequest = Object.getOwnPropertyDescriptor(
      prototype,
      "requestVideoFrameCallback",
    );
    const originalCancel = Object.getOwnPropertyDescriptor(
      prototype,
      "cancelVideoFrameCallback",
    );
    Object.defineProperty(prototype, "requestVideoFrameCallback", {
      configurable: true,
      value: (callback: VideoFrameRequestCallback) => callbacks.push(callback),
    });
    Object.defineProperty(prototype, "cancelVideoFrameCallback", {
      configurable: true,
      value: vi.fn(),
    });
    try {
      const [video] = mount([segmented], compact, false, [0, 0.13, 9.63]);
      state(video, 2);
      fireEvent.loadedData(video);
      fireEvent.seeked(video);
      fireEvent.click(screen.getByText("start"));
      Object.defineProperty(video, "paused", {
        configurable: true,
        value: false,
      });
      // Playback currentTime and the decoded frame's timestamp can differ.
      video.currentTime = 19.62;
      act(() =>
        callbacks[0](0, { mediaTime: 19.63 } as VideoFrameCallbackMetadata),
      );
      expect(video.currentTime).toBeCloseTo(19.63);
      expect(screen.getByTestId("clock").textContent).toBe("9.63:false");
      const playCalls = vi.mocked(video.play).mock.calls.length;
      act(() =>
        callbacks[1](1, { mediaTime: 20 } as VideoFrameCallbackMetadata),
      );
      expect(video.currentTime).toBeCloseTo(19.63);
      expect(screen.getByTestId("clock").textContent).toBe("9.63:false");
      expect(video.play).toHaveBeenCalledTimes(playCalls);
      fireEvent.keyDown(window, { key: " " });
      expect(video.currentTime).toBe(10);
      expect(screen.getByTestId("clock").textContent).toBe("0:true");
    } finally {
      cleanup();
      if (originalRequest)
        Object.defineProperty(
          prototype,
          "requestVideoFrameCallback",
          originalRequest,
        );
      else Reflect.deleteProperty(prototype, "requestVideoFrameCallback");
      if (originalCancel)
        Object.defineProperty(
          prototype,
          "cancelVideoFrameCallback",
          originalCancel,
        );
      else Reflect.deleteProperty(prototype, "cancelVideoFrameCallback");
    }
  },
);
