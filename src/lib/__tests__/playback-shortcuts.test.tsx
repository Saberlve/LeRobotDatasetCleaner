// @vitest-environment jsdom
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { TimeProvider, useTime } from "@/context/time-context";
import {
  useEpisodeShortcuts,
  useFrameShortcuts,
  useFrameStep,
  usePlayShortcut,
} from "../playback-shortcuts";

import { FramePlaybackShortcuts } from "@/components/frame-playback-shortcuts";

const select = vi.fn();
function Shortcuts({
  timestamps,
  episodeId = 4,
}: {
  timestamps?: number[];
  episodeId?: number;
}) {
  const { currentTime, isPlaying, setIsPlaying, seek } = useTime();
  const { step } = useFrameStep({ timestamps, fps: 10 });
  useFrameShortcuts(step);
  useEpisodeShortcuts({ episodes: [0, 4, 8], episodeId, onSelect: select });
  return (
    <>
      <output data-testid="clock">
        {currentTime}:{String(isPlaying)}
      </output>
      <button
        onClick={() => {
          seek(0.15);
          setIsPlaying(true);
        }}
      >
        play
      </button>
      <input aria-label="entry" />
      <textarea aria-label="notes" />
      <select aria-label="choice">
        <option>one</option>
      </select>
      <div
        contentEditable
        suppressContentEditableWarning
        data-testid="editable"
      >
        <span>edit</span>
      </div>
    </>
  );
}
function mount(timestamps?: number[], episodeId = 4) {
  return render(
    <TimeProvider duration={0.6}>
      <Shortcuts timestamps={timestamps} episodeId={episodeId} />
    </TimeProvider>,
  );
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("frame keys pause playback, use exact timestamps and clamp at episode boundaries", () => {
  mount([0, 0.1, 0.23, 0.5]);
  fireEvent.click(screen.getByText("play"));
  fireEvent.keyDown(window, { key: "ArrowRight" });
  expect(screen.getByTestId("clock").textContent).toBe("0.23:false");
  fireEvent.keyDown(window, { key: "ArrowRight", repeat: true });
  fireEvent.keyDown(window, { key: "ArrowRight", repeat: true });
  expect(screen.getByTestId("clock").textContent).toBe("0.5:false");
  for (let i = 0; i < 5; i++)
    fireEvent.keyDown(window, { key: "ArrowLeft", repeat: true });
  expect(screen.getByTestId("clock").textContent).toBe("0:false");
});

test("rapid repeats in one render advance every frame; release stops further changes", () => {
  mount([0, 0.1, 0.23, 0.5]);
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", repeat: true }),
    );
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", repeat: true }),
    );
  });
  expect(screen.getByTestId("clock").textContent).toBe("0.5:false");
  fireEvent.keyUp(window, { key: "ArrowRight" });
  expect(screen.getByTestId("clock").textContent).toBe("0.5:false");
});

test("FPS fallback steps before signal detection is loaded", () => {
  mount();
  fireEvent.keyDown(window, { key: "ArrowRight" });
  expect(screen.getByTestId("clock").textContent).toBe("0.1:false");
  for (let i = 0; i < 10; i++)
    fireEvent.keyDown(window, { key: "ArrowRight", repeat: true });
  expect(screen.getByTestId("clock").textContent).toBe("0.5:false");
});

test.each(["ArrowUp", "PageUp", "ArrowDown", "PageDown"])(
  "%s selects an existing neighboring episode once per press",
  (key) => {
    mount();
    fireEvent.keyDown(window, { key });
    expect(select).toHaveBeenCalledWith(
      key === "ArrowUp" || key === "PageUp" ? 0 : 8,
    );
    fireEvent.keyDown(window, { key, repeat: true });
    expect(select).toHaveBeenCalledOnce();
  },
);

test("navigation stops at the first and last episodes and reads updated episode state", () => {
  const { rerender } = mount(undefined, 0);
  fireEvent.keyDown(window, { key: "PageUp" });
  expect(select).not.toHaveBeenCalled();
  rerender(
    <TimeProvider duration={0.6}>
      <Shortcuts episodeId={8} />
    </TimeProvider>,
  );
  fireEvent.keyDown(window, { key: "PageDown" });
  expect(select).not.toHaveBeenCalled();
  fireEvent.keyDown(window, { key: "PageUp" });
  expect(select).toHaveBeenCalledWith(4);
});

test("typing and modified keys keep their native behavior; focused buttons support frame shortcuts", () => {
  mount([0, 0.1, 0.23, 0.5]);
  for (const target of [
    screen.getByLabelText("entry"),
    screen.getByLabelText("notes"),
    screen.getByLabelText("choice"),
    screen.getByText("edit"),
  ]) {
    fireEvent.keyDown(target, { key: "ArrowRight" });
    fireEvent.keyDown(target, { key: "PageDown" });
  }
  for (const modifier of [
    "ctrlKey",
    "metaKey",
    "altKey",
    "shiftKey",
    "isComposing",
  ]) {
    fireEvent.keyDown(window, { key: "ArrowRight", [modifier]: true });
    fireEvent.keyDown(window, { key: "PageDown", [modifier]: true });
  }
  expect(select).not.toHaveBeenCalled();
  expect(screen.getByTestId("clock").textContent).toBe("0:false");
  fireEvent.keyDown(screen.getByText("play"), { key: "ArrowRight" });
  expect(screen.getByTestId("clock").textContent).toBe("0.1:false");
});

test("unmount removes keyboard listeners", () => {
  const { unmount } = mount();
  unmount();
  fireEvent.keyDown(window, { key: "PageDown" });
  expect(select).not.toHaveBeenCalled();
});

test("first frame step after a keyed episode reset uses the new clock", () => {
  const view = (episode: string) => (
    <TimeProvider duration={0.6} episodeKey={episode}>
      <Shortcuts key={episode} timestamps={[0, 0.1, 0.23, 0.5]} />
    </TimeProvider>
  );
  const { rerender } = render(view("a"));
  fireEvent.click(screen.getByText("play"));
  fireEvent.keyDown(window, { key: "ArrowRight" });
  expect(screen.getByTestId("clock").textContent).toBe("0.23:false");
  rerender(view("b"));
  expect(screen.getByTestId("clock").textContent).toBe("0:false");
  fireEvent.keyDown(window, { key: "ArrowRight" });
  expect(screen.getByTestId("clock").textContent).toBe("0.1:false");
});

function PlayShortcutOwner({
  playerKey,
  urdf = false,
  toggleUrdf,
}: {
  playerKey: string;
  urdf?: boolean;
  toggleUrdf: () => void;
}) {
  const { currentTime, isPlaying, seek, setIsPlaying } = useTime();
  usePlayShortcut(urdf ? toggleUrdf : undefined);
  return (
    <>
      {!urdf && (
        <FramePlaybackShortcuts
          key={playerKey}
          fps={10}
          timestamps={[0, 0.1, 0.5]}
        />
      )}
      <output data-testid="clock">
        {currentTime}:{String(isPlaying)}
      </output>
      <button
        onClick={() => {
          seek(0.5);
          setIsPlaying(false);
        }}
      >
        end
      </button>
    </>
  );
}

test("space restarts after player remounts and tab changes without a competing owner", () => {
  const toggleUrdf = vi.fn();
  const view = (key: string, urdf = false) => (
    <TimeProvider duration={0.6}>
      <PlayShortcutOwner playerKey={key} urdf={urdf} toggleUrdf={toggleUrdf} />
    </TimeProvider>
  );
  const { rerender } = render(view("a"));
  for (const key of ["a", "b"]) {
    rerender(view(key));
    fireEvent.click(screen.getByText("end"));
    fireEvent.keyDown(window, { key: " " });
    expect(screen.getByTestId("clock").textContent).toBe("0:true");
    fireEvent.keyDown(window, { key: " ", repeat: true });
    expect(screen.getByTestId("clock").textContent).toBe("0:true");
    fireEvent.keyDown(window, { key: " " });
    expect(screen.getByTestId("clock").textContent).toBe("0:false");
  }
  rerender(view("b", true));
  fireEvent.keyDown(window, { key: " " });
  expect(toggleUrdf).toHaveBeenCalledOnce();
  fireEvent.keyDown(screen.getByText("end"), { key: " " });
  expect(toggleUrdf).toHaveBeenCalledOnce();
  rerender(view("c"));
  fireEvent.click(screen.getByText("end"));
  fireEvent.keyDown(window, { key: " " });
  expect(screen.getByTestId("clock").textContent).toBe("0:true");
  expect(toggleUrdf).toHaveBeenCalledOnce();
});
