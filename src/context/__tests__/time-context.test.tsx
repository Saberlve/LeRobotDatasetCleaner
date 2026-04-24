// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { TimeProvider, useTime } from "@/context/time-context";

function Probe() {
  const { playbackRate, setPlaybackRate } = useTime();
  return (
    <button type="button" onClick={() => setPlaybackRate(2)}>
      {playbackRate}x
    </button>
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("TimeProvider playback rate", () => {
  test("loads persisted playback rate and persists updates", () => {
    localStorage.setItem("lerobot.playbackRate", "1.5");

    render(
      <TimeProvider duration={10}>
        <Probe />
      </TimeProvider>,
    );

    expect(screen.getByRole("button", { name: "1.5x" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "1.5x" }));

    expect(screen.getByRole("button", { name: "2x" })).toBeTruthy();
    expect(localStorage.getItem("lerobot.playbackRate")).toBe("2");
  });

  test("ignores unsupported persisted playback rates", () => {
    localStorage.setItem("lerobot.playbackRate", "9");

    render(
      <TimeProvider duration={10}>
        <Probe />
      </TimeProvider>,
    );

    expect(screen.getByRole("button", { name: "1x" })).toBeTruthy();
  });
});
