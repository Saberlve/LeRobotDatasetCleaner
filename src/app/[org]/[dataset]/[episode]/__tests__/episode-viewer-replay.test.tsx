// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import EpisodeViewer from "@/app/[org]/[dataset]/[episode]/episode-viewer";

const mocks = vi.hoisted(() => ({
  getAdjacentEpisodesVideoInfo: vi.fn(async () => []),
  getEpisodeDataSafe: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/app/[org]/[dataset]/[episode]/fetch-data", () => ({
  getAdjacentEpisodesVideoInfo: mocks.getAdjacentEpisodesVideoInfo,
  getEpisodeDataSafe: mocks.getEpisodeDataSafe,
}));

vi.mock("@/components/simple-videos-player", () => ({
  SimpleVideosPlayer: () => <div data-testid="videos" />,
}));

vi.mock("@/components/data-recharts", () => ({
  default: () => <div data-testid="charts" />,
}));

vi.mock("@/components/playback-bar", () => ({
  default: () => <div data-testid="playback" />,
}));

vi.mock("@/components/side-nav", () => ({
  default: () => <div data-testid="sidebar" />,
}));

vi.mock("@/components/loading-component", () => ({
  default: () => <div data-testid="loading" />,
}));

function makeEpisodeData(robotType: string) {
  return {
    datasetInfo: {
      repoId: `local/demo_${robotType}`,
      robot_type: robotType,
      codebase_version: "v3.0",
      fps: 30,
    },
    episodeId: 0,
    videosInfo: [],
    chartDataGroups: [],
    flatChartData: [
      Object.fromEntries(
        Array.from({ length: 29 }, (_, index) => [
          `observation.state | ${index}`,
          index,
        ]),
      ),
    ],
    episodes: [0, 1, 2],
    task: null,
  };
}

beforeEach(() => {
  mocks.getEpisodeDataSafe.mockResolvedValue({
    data: makeEpisodeData("g1"),
    error: null,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("EpisodeViewer replay tab", () => {
  test("shows Replay for G1 datasets and hides legacy labels", async () => {
    render(<EpisodeViewer org="local" dataset="demo_g1" episodeId={0} />);

    expect(await screen.findByRole("button", { name: "Replay" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "3D Replay" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sim Replay" })).toBeNull();
  });

  test("does not show Replay for non-G1 datasets", async () => {
    mocks.getEpisodeDataSafe.mockResolvedValueOnce({
      data: makeEpisodeData("aloha"),
      error: null,
    });

    render(<EpisodeViewer org="local" dataset="demo_aloha" episodeId={0} />);

    expect(await screen.findByTestId("sidebar")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Replay" })).toBeNull();
  });
});
