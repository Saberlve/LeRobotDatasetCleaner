import { describe, expect, test } from "vitest";

import {
  filterEpisodeIdsByMode,
  filterEpisodeIdsByModeKeepingCurrent,
  getAdjacentEpisodeInFilter,
} from "@/components/episode-filter-mode";

describe("filterEpisodeIdsByMode", () => {
  test("returns all episodes in all mode", () => {
    expect(filterEpisodeIdsByMode([0, 1, 2], new Set([1]), "all")).toEqual([
      0, 1, 2,
    ]);
  });

  test("returns only flagged episodes in flagged mode", () => {
    expect(filterEpisodeIdsByMode([0, 1, 2], new Set([1]), "flagged")).toEqual([
      1,
    ]);
  });

  test("returns only unflagged episodes in unflagged mode", () => {
    expect(
      filterEpisodeIdsByMode([0, 1, 2], new Set([1]), "unflagged"),
    ).toEqual([0, 2]);
  });
});

describe("filterEpisodeIdsByModeKeepingCurrent", () => {
  test("keeps the current episode visible even when it no longer matches the filter", () => {
    expect(
      filterEpisodeIdsByModeKeepingCurrent({
        episodes: [0, 1, 2],
        flagged: new Set([1]),
        mode: "unflagged",
        currentEpisode: 1,
      }),
    ).toEqual([0, 1, 2]);
  });

  test("does not add episodes outside the displayed episode set", () => {
    expect(
      filterEpisodeIdsByModeKeepingCurrent({
        episodes: [0, 2],
        flagged: new Set([1]),
        mode: "unflagged",
        currentEpisode: 1,
      }),
    ).toEqual([0, 2]);
  });
});

describe("getAdjacentEpisodeInFilter", () => {
  test("uses numeric adjacency in all mode", () => {
    expect(
      getAdjacentEpisodeInFilter({
        episodes: [0, 1, 2, 3],
        flagged: new Set([1, 3]),
        mode: "all",
        currentEpisode: 1,
        direction: 1,
      }),
    ).toBe(2);
  });

  test("jumps to the next flagged episode in flagged mode", () => {
    expect(
      getAdjacentEpisodeInFilter({
        episodes: [0, 1, 2, 3, 4],
        flagged: new Set([1, 4]),
        mode: "flagged",
        currentEpisode: 1,
        direction: 1,
      }),
    ).toBe(4);
  });

  test("jumps to the next unflagged episode in unflagged mode", () => {
    expect(
      getAdjacentEpisodeInFilter({
        episodes: [0, 1, 2, 3, 4],
        flagged: new Set([1, 3]),
        mode: "unflagged",
        currentEpisode: 0,
        direction: 1,
      }),
    ).toBe(2);
  });

  test("when current episode is filtered out, jumps to the nearest following visible episode", () => {
    expect(
      getAdjacentEpisodeInFilter({
        episodes: [0, 1, 2, 3, 4],
        flagged: new Set([1, 3]),
        mode: "unflagged",
        currentEpisode: 1,
        direction: 1,
      }),
    ).toBe(2);
  });
});
