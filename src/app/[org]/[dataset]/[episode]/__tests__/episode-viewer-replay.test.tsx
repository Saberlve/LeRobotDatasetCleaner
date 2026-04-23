// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import EpisodeViewer from "@/app/[org]/[dataset]/[episode]/episode-viewer";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/app/[org]/[dataset]/[episode]/fetch-data", () => ({
  getAdjacentEpisodesVideoInfo: vi.fn(async () => []),
  getEpisodeDataSafe: vi.fn(async () => ({
    data: {
      datasetInfo: {
        repoId: "local/demo_g1",
        robot_type: "g1",
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
    },
    error: null,
  })),
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

describe("EpisodeViewer replay tab", () => {
  test("shows Replay for G1 datasets", async () => {
    render(<EpisodeViewer org="local" dataset="demo_g1" episodeId={0} />);

    expect(await screen.findByRole("button", { name: "Replay" })).toBeTruthy();
  });
});
