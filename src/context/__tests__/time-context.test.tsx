// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { TimeProvider, useTime } from "../time-context";

const key = "lerobot-viewer.playback-rate";

function Settings({ name = "rate" }: { name?: string }) {
  const { playbackRate, setPlaybackRate } = useTime();
  return (
    <input
      aria-label={name}
      value={playbackRate}
      onChange={(e) => setPlaybackRate(Number(e.target.value))}
    />
  );
}

function Episode({ name }: { name?: string }) {
  return (
    <TimeProvider duration={10}>
      <Settings name={name} />
    </TimeProvider>
  );
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test("speed survives an episode remount and is saved for page reloads", () => {
  const { rerender } = render(<Episode key="first" />);
  fireEvent.change(screen.getByLabelText("rate"), { target: { value: "2" } });
  expect(localStorage.getItem(key)).toBe("2");
  rerender(<Episode key="second" />);
  expect((screen.getByLabelText("rate") as HTMLInputElement).value).toBe("2");
});

test("all mounted episode players share the same speed", () => {
  render(
    <>
      <Episode name="first" />
      <Episode name="second" />
    </>,
  );
  fireEvent.change(screen.getByLabelText("first"), {
    target: { value: "0.5" },
  });
  expect((screen.getByLabelText("second") as HTMLInputElement).value).toBe(
    "0.5",
  );
});

test("a saved speed is restored on mount", () => {
  localStorage.setItem(key, "1.5");
  render(<Episode />);
  expect((screen.getByLabelText("rate") as HTMLInputElement).value).toBe("1.5");
});

test.each(["invalid", "0", "-2", "Infinity"])(
  "invalid saved speed %s falls back to 1×",
  (value) => {
    localStorage.setItem(key, value);
    render(<Episode />);
    expect((screen.getByLabelText("rate") as HTMLInputElement).value).toBe("1");
  },
);

test("speed survives navigation when browser storage is unavailable", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("storage unavailable");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("storage unavailable");
  });
  const { rerender } = render(<Episode key="first" />);
  fireEvent.change(screen.getByLabelText("rate"), { target: { value: "2" } });
  rerender(<Episode key="second" />);
  expect((screen.getByLabelText("rate") as HTMLInputElement).value).toBe("2");
});
