import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { computeTrajectoryDiversity } from "@/lib/trajectory-diversity";

vi.mock("react-dom", () => ({
  createPortal: (children: React.ReactNode) => children,
}));

import { TrajectoryDiversityGroupDialog } from "../trajectory-diversity-group-dialog";

describe("TrajectoryDiversityGroupDialog", () => {
  it("shows every member with individual and synchronized playback controls", () => {
    vi.stubGlobal("document", { body: {} });
    const diversity = computeTrajectoryDiversity([
      { episodeIndex: 10, states: [[0]], actions: [[0], [1]] },
      { episodeIndex: 17, states: [[0]], actions: [[0], [1]] },
      { episodeIndex: 18, states: [[0]], actions: [[0], [1]] },
    ]);
    const markup = renderToStaticMarkup(
      createElement(TrajectoryDiversityGroupDialog, {
        repoId: "local/example",
        group: diversity.groups[0],
        episodes: diversity.episodes,
        smoothnessScores: new Map(),
        reviews: {},
        onReview: () => {},
        onClose: () => {},
      }),
    );

    expect(markup).toContain("Play all together");
    expect(markup).toContain("grid-auto-rows:max-content");
    for (const episodeIndex of [10, 17, 18]) {
      expect(markup).toContain(`ep ${episodeIndex}`);
      expect(markup).toContain(`Play ep ${episodeIndex}`);
      expect(markup).toContain(`ep ${episodeIndex} manual diversity review`);
    }
    vi.unstubAllGlobals();
  });
});
