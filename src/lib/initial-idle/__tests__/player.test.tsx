// @vitest-environment jsdom
import React, { useRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { TimeProvider, useTime } from "@/context/time-context";
import {
  IdleReviewPlayer,
  type IdlePlayerHandle,
} from "@/components/idle-review-player";
import { frames, profile } from "./fixtures";

const rows = frames();
const settings = profile();
const cuts = [
  { start: 0, end: 16 },
  { start: 30, end: 33 },
  { start: 50, end: 59 },
];
const viewed = vi.fn();
function Review({
  unloaded = false,
  edge = "start",
}: {
  unloaded?: boolean;
  edge?: "start" | "end";
}) {
  const ref = useRef<IdlePlayerHandle>(null);
  const time = useTime();
  return (
    <>
      <IdleReviewPlayer
        ref={ref}
        frames={unloaded ? [] : rows}
        edge={edge}
        profile={settings}
        candidate={null}
        endFrame={0}
        dirty={false}
        onBoundary={() => {}}
        selected={0}
        onSelected={() => {}}
        cuts={cuts}
        onBoundaryViewed={viewed}
      />
      <button onClick={() => ref.current?.preview(1, 2, "裁剪交界")}>
        preview
      </button>
      <button onClick={() => time.seek(2.1, "video")}>report-end</button>
      <button onClick={() => time.seek(3.1, "video")}>report-cut</button>
      <button onClick={() => time.seek(5.1, "video")}>report-tail</button>
      <button onClick={() => time.seek(20, "video")}>report-outside</button>
      <output data-testid="clock">
        {time.currentTime}:{String(time.isPlaying)}
      </output>
    </>
  );
}
function mount() {
  render(
    <TimeProvider duration={6}>
      <Review />
    </TimeProvider>,
  );
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("boundary playback stops at its exact end and looping returns to start", () => {
  mount();
  fireEvent.click(screen.getByText("preview"));
  expect(screen.getByTestId("clock").textContent).toBe("1:true");
  fireEvent.click(screen.getByText("report-end"));
  expect(screen.getByTestId("clock").textContent).toBe("2:false");
  expect(viewed).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByText("片段循环：关"));
  fireEvent.click(screen.getByText("preview"));
  fireEvent.click(screen.getByText("report-end"));
  expect(screen.getByTestId("clock").textContent).toBe("1:true");
});

test("trimmed preview redirects video reports and stepping across cuts without reverting the seek", () => {
  mount();
  fireEvent.click(screen.getByText("裁剪后预览"));
  expect(screen.getByTestId("clock").textContent).toBe("1.7:false");
  fireEvent.click(screen.getByText("report-cut"));
  expect(screen.getByTestId("clock").textContent).toBe("3.4:false");
  fireEvent.click(screen.getByText("前一帧"));
  expect(screen.getByTestId("clock").textContent).toBe("2.9:false");
  fireEvent.click(screen.getByText("后一帧"));
  expect(screen.getByTestId("clock").textContent).toBe("3.4:false");
  fireEvent.click(screen.getByText("report-tail"));
  expect(screen.getByTestId("clock").textContent).toBe("4.9:false");
  fireEvent.click(screen.getByRole("button", { name: "开始复核播放" }));
  expect(screen.getByTestId("clock").textContent).toBe("1.7:true");
});

test("leading zoom changes slider range before detection and seeks outside playhead into view", () => {
  render(
    <TimeProvider duration={30}>
      <Review unloaded />
    </TimeProvider>,
  );
  const slider = screen.getByLabelText("复核播放位置") as HTMLInputElement;
  expect(slider.max).toBe("30");
  expect(
    screen.getByLabelText("复核时间轴色带").querySelectorAll("[title]").length,
  ).toBe(0);
  fireEvent.click(screen.getByText("report-outside"));
  fireEvent.click(screen.getByText("放大开头区间"));
  expect(slider.min).toBe("0");
  expect(slider.max).toBe("5");
  expect(screen.getByTestId("clock").textContent).toBe("0:false");
  fireEvent.change(slider, { target: { value: "2" } });
  expect(screen.getByTestId("clock").textContent).toBe("2:false");
  fireEvent.click(screen.getByText("显示整个 episode"));
  expect(slider.max).toBe("30");
  expect(screen.getByTestId("clock").textContent).toBe("2:false");
});
test("saved clip bands use actual frame timestamps and resize with the zoom", () => {
  mount();
  const band = screen.getByTitle("已标记 0–16 帧，待导出");
  const full = parseFloat(band.style.width);
  expect(full).toBeCloseTo((1.7 / 5.9) * 100);
  fireEvent.click(screen.getByText("放大开头区间"));
  expect(parseFloat(band.style.width)).toBeCloseTo(34);
});
test("tail zoom works before detection and moves the playhead to the last five seconds", () => {
  render(
    <TimeProvider duration={30}>
      <Review unloaded edge="end" />
    </TimeProvider>,
  );
  fireEvent.click(screen.getByText("放大结尾区间"));
  const slider = screen.getByLabelText("复核播放位置") as HTMLInputElement;
  expect(slider.min).toBe("25");
  expect(slider.max).toBe("30");
  expect(screen.getByTestId("clock").textContent).toBe("25:false");
});
test("short episodes disable a zoom that would not change the range", () => {
  render(
    <TimeProvider duration={3}>
      <Review unloaded />
    </TimeProvider>,
  );
  expect(
    (screen.getByText("当前区间已覆盖整个 episode") as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});
