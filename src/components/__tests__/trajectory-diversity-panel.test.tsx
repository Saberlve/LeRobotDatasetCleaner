import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { computeTrajectoryDiversity } from "@/lib/trajectory-diversity";
import type { CrossEpisodeVarianceData } from "@/app/[org]/[dataset]/[episode]/fetch-data";
import TrajectoryDiversityPanel from "../trajectory-diversity-panel";

describe("TrajectoryDiversityPanel", () => {
  it("renders every member of each coverage group", () => {
    const diversity = computeTrajectoryDiversity([
      { episodeIndex: 0, states: [[0]], actions: [[0], [1]] },
      { episodeIndex: 1, states: [[0]], actions: [[0], [1]] },
      { episodeIndex: 2, states: [[1]], actions: [[1], [2]] },
    ]);
    const data = { diversity } as CrossEpisodeVarianceData;
    const markup = renderToStaticMarkup(
      createElement(TrajectoryDiversityPanel, { data, loading: false }),
    );
    const firstGroupRow = markup.match(/group-01[\s\S]*?<\/tr>/)?.[0];

    expect(markup).toContain("All episodes");
    expect(markup).toContain("Coverage");
    expect(markup).toContain("Redundancy");
    expect(markup).toContain("Suspected duplicate trajectories");
    expect(markup).toContain("Suspected duplicate share");
    expect(markup).toContain("Situation Coverage &amp; Redundant Trajectories");
    expect(markup).toContain("View &amp; Play");
    expect(markup).toContain("play them individually or together");
    expect(markup).toContain("joint-angle trajectories are used");
    expect(markup).toContain("90th percentile");
    expect(firstGroupRow).toContain("ep 0");
    expect(firstGroupRow).toContain("ep 1");
    expect(firstGroupRow).not.toContain("ep 2");
  });
});
