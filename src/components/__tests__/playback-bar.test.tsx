// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import PlaybackBar from "@/components/playback-bar";
import { TimeProvider } from "@/context/time-context";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("PlaybackBar playback rate control", () => {
  test("updates the global playback rate", () => {
    render(
      <TimeProvider duration={30}>
        <PlaybackBar />
      </TimeProvider>,
    );

    const select = screen.getByLabelText("Playback speed") as HTMLSelectElement;
    expect(select.value).toBe("1");

    fireEvent.change(select, { target: { value: "2" } });

    expect(select.value).toBe("2");
    expect(localStorage.getItem("lerobot.playbackRate")).toBe("2");
  });
});
