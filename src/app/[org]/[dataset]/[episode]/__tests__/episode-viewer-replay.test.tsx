// @vitest-environment jsdom
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import EpisodeViewer from "@/app/[org]/[dataset]/[episode]/episode-viewer";

const mocks = vi.hoisted(() => ({
  getAdjacentEpisodesVideoInfo: vi.fn(async () => []),
  getEpisodeDataSafe: vi.fn(),
  routerPush: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.routerPush,
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

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function makeEpisodeData(robotType: string, codebaseVersion = "v3.0") {
  return {
    datasetInfo: {
      repoId: `local/demo_${robotType}`,
      robot_type: robotType,
      codebase_version: codebaseVersion,
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
  sessionStorage.clear();
  mocks.getEpisodeDataSafe.mockResolvedValue({
    data: makeEpisodeData("g1"),
    error: null,
  });
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.clearAllMocks();
});

describe("EpisodeViewer replay tab", () => {
  test("shows a link back to the home page", async () => {
    render(<EpisodeViewer org="local" dataset="demo_g1" episodeId={0} />);

    const homeLink = await screen.findByRole("link", { name: "返回主界面" });
    expect(homeLink.getAttribute("href")).toBe("/");
  });

  test("shows Replay for G1 datasets and hides legacy labels", async () => {
    render(<EpisodeViewer org="local" dataset="demo_g1" episodeId={0} />);

    expect(
      (await screen.findByRole("button", { name: "Replay" })).textContent,
    ).toBe("Replay");
    expect(screen.queryByRole("button", { name: "3D Replay" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sim Replay" })).toBeNull();
  });

  test("shows Replay for local v2.1 G1 datasets", async () => {
    mocks.getEpisodeDataSafe.mockResolvedValueOnce({
      data: makeEpisodeData("g1", "v2.1"),
      error: null,
    });

    render(
      <EpisodeViewer org="local" dataset="straighten_the_box" episodeId={0} />,
    );

    expect(await screen.findByRole("button", { name: "Replay" })).toBeDefined();
  });

  test("shows Replay for Acone datasets", async () => {
    mocks.getEpisodeDataSafe.mockResolvedValueOnce({
      data: makeEpisodeData("Acone", "v2.1"),
      error: null,
    });

    render(
      <EpisodeViewer
        org="local"
        dataset="pick_X_times_filterd_twice"
        episodeId={0}
      />,
    );

    expect(await screen.findByRole("button", { name: "Replay" })).toBeDefined();
  });

  test("routes ArrowDown from replay to the next episode and keeps replay tab", async () => {
    render(<EpisodeViewer org="local" dataset="demo_g1" episodeId={0} />);

    const replayButton = await screen.findByRole("button", { name: "Replay" });
    replayButton.click();

    fireEvent.keyDown(window, { key: "ArrowDown" });

    await waitFor(() => {
      expect(mocks.routerPush).toHaveBeenCalledWith("./episode_1?tab=replay");
    });
  });

  test("toggles the current episode flag with f", async () => {
    render(<EpisodeViewer org="local" dataset="demo_g1" episodeId={0} />);

    await screen.findByRole("button", { name: "Replay" });

    fireEvent.keyDown(window, { key: "f" });

    await waitFor(() => {
      expect(sessionStorage.getItem("flagged-episodes")).toBe("[0]");
    });
  });

  test("routes ArrowDown to the next visible episode in flagged filter mode", async () => {
    sessionStorage.setItem("sidebarFilterMode", "flagged");
    sessionStorage.setItem("flagged-episodes", "[2]");

    render(<EpisodeViewer org="local" dataset="demo_g1" episodeId={0} />);

    await screen.findByRole("button", { name: "Replay" });

    await waitFor(() => {
      fireEvent.keyDown(window, { key: "ArrowDown" });
      expect(mocks.routerPush).toHaveBeenCalledWith("./episode_2");
    });
  });

  test("preserves the stored sidebar filter mode while hydrating", async () => {
    sessionStorage.setItem("sidebarFilterMode", "flagged");

    render(<EpisodeViewer org="local" dataset="demo_g1" episodeId={0} />);

    await screen.findByRole("button", { name: "Replay" });

    expect(sessionStorage.getItem("sidebarFilterMode")).toBe("flagged");
  });

  test("does not show Replay for non-G1 datasets", async () => {
    mocks.getEpisodeDataSafe.mockResolvedValueOnce({
      data: makeEpisodeData("aloha"),
      error: null,
    });

    render(<EpisodeViewer org="local" dataset="demo_aloha" episodeId={0} />);

    expect(await screen.findByTestId("sidebar")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Replay" })).toBeNull();
  });
});
