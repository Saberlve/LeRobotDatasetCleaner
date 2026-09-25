import { describe, expect, it } from "vitest";
import {
  computeTrajectoryDiversity,
  type DiversityTrajectoryInput,
} from "../trajectory-diversity";

function episode(
  episodeIndex: number,
  stateOffset = 0,
  actionOffset = 0,
): DiversityTrajectoryInput {
  return {
    episodeIndex,
    states: [
      [stateOffset, 0],
      [stateOffset, 0],
      [stateOffset, 0],
    ],
    actions: [
      [actionOffset, 0],
      [actionOffset, 1],
      [actionOffset, 2],
    ],
    endEffector: [
      { position: [0, 0, 0], gripper: 0 },
      { position: [0, 0, 0], gripper: 0 },
      { position: [0, 0, 0], gripper: 0 },
    ],
  };
}

describe("computeTrajectoryDiversity", () => {
  it("groups identical trajectories as one situation and removes duplicate representatives", () => {
    const result = computeTrajectoryDiversity(
      Array.from({ length: 100 }, (_, index) => episode(index)),
    );

    expect(result.situationGroupCount).toBe(1);
    expect(result.effectiveSituations).toBeCloseTo(1);
    expect(result.finalSelectedCount).toBe(1);
    expect(result.representativeSelection[0].episodeIndex).toBe(0);
    expect(result.episodes.slice(1).every((row) => row.redundancy === 1)).toBe(
      true,
    );
  });

  it("increases coverage when the initial robot state changes", () => {
    const result = computeTrajectoryDiversity([episode(0), episode(1, 1)]);

    expect(result.situationGroupCount).toBe(2);
    expect(result.effectiveSituations).toBeCloseTo(2);
    expect(result.finalSelectedCount).toBe(2);
  });

  it("lists every episode in each group", () => {
    const result = computeTrajectoryDiversity([
      episode(0),
      episode(1),
      episode(2, 1),
    ]);

    expect(result.groups.map((group) => group.episodeIndices)).toEqual([
      [0, 1],
      [2],
    ]);
  });

  it("does not join distant endpoints through a chain of near neighbors", () => {
    const result = computeTrajectoryDiversity([
      episode(0, 0),
      episode(1, 1),
      episode(2, 2),
    ]);

    expect(result.groups.map((group) => group.episodeIndices)).toEqual([
      [0, 1],
      [2],
    ]);
  });

  it("keeps behavior differences separate when the initial state is the same", () => {
    const result = computeTrajectoryDiversity([episode(0), episode(1, 0, 1)]);

    expect(result.situationGroupCount).toBe(2);
    expect(result.episodes[0].nearestBehaviorDistance).toBeGreaterThan(0);
  });

  it("uses joint-angle trajectories when EEF samples are unavailable", () => {
    const sameAction = [
      [0, 0],
      [0, 1],
      [0, 2],
    ];
    const result = computeTrajectoryDiversity([
      {
        episodeIndex: 0,
        actions: sameAction,
        states: [
          [0, 0],
          [0.1, 0],
          [0.2, 0],
        ],
        endEffector: null,
      },
      {
        episodeIndex: 1,
        actions: sameAction,
        states: [
          [0, 0],
          [0.8, 0],
          [1.6, 0],
        ],
        endEffector: null,
      },
    ]);

    expect(result.episodes[0].nearestBehaviorDistance).toBeGreaterThan(0);
    expect(result.episodes[1].nearestBehaviorDistance).toBeGreaterThan(0);
    expect(result.situationGroupCount).toBe(2);
  });

  it("is independent of input episode order", () => {
    const inputs = [episode(4), episode(2, 1), episode(9, 1), episode(7, 2)];
    const forward = computeTrajectoryDiversity(inputs);
    const reverse = computeTrajectoryDiversity(inputs.slice().reverse());

    expect(reverse).toEqual(forward);
  });

  it("does not fabricate an initial-state distance when state data is missing", () => {
    const missingState = episode(0);
    missingState.states = null;
    const result = computeTrajectoryDiversity([missingState, episode(1)]);

    expect(result.episodes[0].initialDistance).toBeNull();
    expect(result.episodes[1].initialDistance).toBeNull();
    expect(result.situationGroupCount).toBe(2);
  });

  it("handles a single episode and constant features", () => {
    const result = computeTrajectoryDiversity([episode(3)]);

    expect(result.situationGroupCount).toBe(1);
    expect(result.effectiveSituations).toBeCloseTo(1);
    expect(result.finalSelectedCount).toBe(1);
    expect(result.episodes[0].redundancy).toBe(0);
  });

  it("includes every non-representative member in the representative ranges", () => {
    // The distant episodes widen the data scale and threshold enough for the
    // first four episodes to form one complete-link group. Episode 1 is the
    // medoid, so it deliberately is not the first member in the sorted list.
    const result = computeTrajectoryDiversity([
      episode(0, 0, 3),
      episode(1, 0, 1),
      episode(2, 0, 2),
      episode(3, 0, 0),
      episode(4, 0, 70),
      episode(5, 0, 100),
    ]);
    const group = result.groups.find((candidate) =>
      candidate.episodeIndices.includes(0),
    );

    expect(group?.episodeIndices).toEqual([0, 1, 2, 3]);
    expect(group?.representativeEpisodeIndex).toBe(1);
    expect(group?.behaviorDistanceRange?.[0]).toBeCloseTo(0.0049497475, 5);
    expect(group?.behaviorDistanceRange?.[1]).toBeCloseTo(0.009899495, 5);
  });
});
