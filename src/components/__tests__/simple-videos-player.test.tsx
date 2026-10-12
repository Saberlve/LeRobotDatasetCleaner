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
) {
  const result = render(
    <TimeProvider duration={10}>
      <SimpleVideosPlayer
        videosInfo={videosInfo}
        onVideosReady={ready}
        compact={compact}
      />
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
    expect(first.currentTime).toBeCloseTo(19.999);
    expect(second.currentTime).toBeCloseTo(39.999);
    expect(first.pause).toHaveBeenCalled();
    expect(second.pause).toHaveBeenCalled();
    expect(screen.getByTestId("clock").textContent).toBe("9.999:false");
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
  expect(second.currentTime).toBeCloseTo(19.999);
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
    expect(video.currentTime).toBe(10);
    expect(screen.getByTestId("clock").textContent).toBe("10:false");
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
