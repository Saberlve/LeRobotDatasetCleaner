"use client";

import React, { useCallback, useMemo, useState } from "react";
import type { CrossEpisodeVarianceData } from "@/app/[org]/[dataset]/[episode]/fetch-data";
import { TrajectoryDiversityGroupDialog } from "./trajectory-diversity-group-dialog";

const formatNumber = (value: number | null, digits = 3) =>
  value === null ? "N/A" : value.toFixed(digits);

const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

export default function TrajectoryDiversityPanel({
  data,
  loading,
  repoId,
}: {
  data: CrossEpisodeVarianceData | null;
  loading: boolean;
  repoId?: string;
}) {
  const [reviews, setReviews] = useState<Record<number, string>>({});
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const diversity = data?.diversity;
  const smoothnessScores = useMemo(
    () =>
      new Map(
        (data?.trajectorySmoothness ?? []).map((episode) => [
          episode.episodeIndex,
          episode.score,
        ]),
      ),
    [data?.trajectorySmoothness],
  );
  const closeGroup = useCallback(() => setSelectedGroupId(null), []);
  React.useEffect(() => {
    setReviews({});
    if (!repoId) return;
    try {
      const raw = localStorage.getItem(
        `trajectory-diversity-reviews:v1:${repoId}`,
      );
      if (raw) setReviews(JSON.parse(raw));
    } catch {
      // The review remains available in memory when browser storage is blocked.
    }
  }, [repoId]);
  const setReview = (episodeIndex: number, decision: string) => {
    const next = { ...reviews, [episodeIndex]: decision };
    if (decision === "unreviewed") delete next[episodeIndex];
    setReviews(next);
    if (repoId) {
      try {
        localStorage.setItem(
          `trajectory-diversity-reviews:v1:${repoId}`,
          JSON.stringify(next),
        );
      } catch {
        // Keep the in-memory decision even when persistence is unavailable.
      }
    }
  };
  if (loading && !diversity) {
    return (
      <section className="panel p-5 text-sm text-slate-400">
        Loading trajectory diversity...
      </section>
    );
  }

  if (!diversity) {
    return (
      <section className="panel p-5 text-sm text-slate-400">
        Trajectory diversity is unavailable: fewer than two trajectories contain
        usable action data.
      </section>
    );
  }

  const singletonGroups = diversity.groups.filter(
    (group) => group.episodeCount === 1,
  ).length;
  const duplicateGroups = diversity.groups.filter(
    (group) => group.episodeCount > 1,
  ).length;
  const redundantCandidates =
    diversity.analyzedEpisodes - diversity.situationGroupCount;
  const coverageGroups = [...diversity.groups].sort(
    (left, right) =>
      right.episodeCount - left.episodeCount ||
      left.episodeIndices[0] - right.episodeIndices[0],
  );
  const selectedGroup = diversity.groups.find(
    (group) => group.groupId === selectedGroupId,
  );

  return (
    <section data-testid="trajectory-diversity" className="space-y-4">
      <div className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              Trajectory Diversity
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Analyzed {diversity.analyzedEpisodes} trajectories; coverage and
              redundancy are computed relative to the current dataset.
            </p>
          </div>
          <span className="rounded border border-cyan-400/20 bg-cyan-400/5 px-2 py-1 text-[10px] uppercase tracking-wide text-cyan-300">
            Robot state, actions, EEF, or joint angles only
          </span>
        </div>
        <div className="mt-3 rounded-md border border-yellow-400/20 bg-yellow-400/5 px-3 py-2 text-xs leading-relaxed text-yellow-100/80">
          This dataset has no directly usable structured object poses, so object
          positions, chip/cup relative positions, image embeddings, and VLM
          outputs are excluded.
        </div>
        <div className="mt-4 grid gap-5 border-t border-white/10 pt-4 text-xs lg:grid-cols-2 lg:gap-8">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Coverage</h3>
            <p className="mt-1 text-slate-500">
              How many different robot initial states and execution paths are
              covered by the current trajectories.
            </p>
            <dl className="mt-3 grid grid-cols-3 gap-3">
              {[
                ["Situation groups", diversity.situationGroupCount],
                [
                  "Effective situations",
                  diversity.effectiveSituations.toFixed(1),
                ],
                [
                  "Largest group share",
                  formatPercent(diversity.largestGroupFraction),
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums text-slate-100">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="border-t border-white/10 pt-4 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            <h3 className="text-sm font-semibold text-slate-200">Redundancy</h3>
            <p className="mt-1 text-slate-500">
              Trajectories within a situation group have similar starting states
              and behavior and are candidates for high redundancy; confirm with
              videos before deciding.
            </p>
            <dl className="mt-3 grid grid-cols-3 gap-3">
              {[
                ["Suspected duplicate trajectories", redundantCandidates],
                ["Duplicate groups", duplicateGroups],
                [
                  "Suspected duplicate share",
                  formatPercent(
                    redundantCandidates /
                      Math.max(diversity.analyzedEpisodes, 1),
                  ),
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums text-slate-100">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-white/10 pt-3 text-xs text-slate-400">
          <p>
            Initial-state threshold{" "}
            <span className="text-slate-200">
              {formatNumber(diversity.distanceThresholds.initial)}
            </span>
          </p>
          <p>
            Behavior threshold{" "}
            <span className="text-slate-200">
              {formatNumber(diversity.distanceThresholds.behavior)}
            </span>
          </p>
        </div>
      </div>

      <div className="panel overflow-hidden">
        <div className="border-b border-white/10 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-200">
            Situation Coverage & Redundant Trajectories
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Thresholds use the 90th percentile of each trajectory's nearest-
            neighbor distance. Every pair within a group must be below both the
            initial-state and behavior thresholds. There are {singletonGroups}{" "}
            singleton groups. Click a group or episode to view all group videos;
            play them individually or together. Behavior distance combines
            actions and motion trajectories, preferring EEF; when EEF is
            unavailable, joint-angle trajectories are used. The representative
            is the real episode with the smallest total combined distance to
            group members. Groups do not represent object positions or scene
            categories.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-xs">
            <thead className="bg-[var(--surface-0)] text-left text-slate-500">
              <tr>
                {[
                  "Group",
                  "Representative",
                  "Count",
                  "All episodes",
                  "Share",
                  "Initial-state distance range",
                  "Behavior distance range",
                  "Compare group",
                ].map((title) => (
                  <th
                    key={title}
                    className="whitespace-nowrap px-4 py-2 font-medium"
                  >
                    {title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {coverageGroups.map((group) => (
                <tr
                  key={group.groupId}
                  className="border-t border-white/5 text-slate-300"
                >
                  <td className="px-4 py-2 font-medium">
                    <button
                      type="button"
                      onClick={() => setSelectedGroupId(group.groupId)}
                      className="text-cyan-300 hover:underline"
                    >
                      {group.groupId}
                    </button>
                  </td>
                  <td className="px-4 py-2 tabular-nums">
                    ep {group.representativeEpisodeIndex}
                  </td>
                  <td className="px-4 py-2 tabular-nums">
                    {group.episodeCount}
                  </td>
                  <td className="px-4 py-2 tabular-nums">
                    <div className="flex max-w-sm flex-wrap gap-x-2 gap-y-1">
                      {group.episodeIndices.map((episodeIndex) => (
                        <button
                          type="button"
                          key={episodeIndex}
                          onClick={() => setSelectedGroupId(group.groupId)}
                          className="whitespace-nowrap text-cyan-300 hover:underline"
                        >
                          ep {episodeIndex}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2 tabular-nums">
                    {formatPercent(group.fraction)}
                  </td>
                  <td className="px-4 py-2 tabular-nums">
                    {group.initialDistanceRange
                      ? `${formatNumber(group.initialDistanceRange[0])} - ${formatNumber(group.initialDistanceRange[1])}`
                      : "N/A"}
                  </td>
                  <td className="px-4 py-2 tabular-nums">
                    {group.behaviorDistanceRange
                      ? `${formatNumber(group.behaviorDistanceRange[0])} - ${formatNumber(group.behaviorDistanceRange[1])}`
                      : "N/A"}
                  </td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => setSelectedGroupId(group.groupId)}
                      className="whitespace-nowrap rounded border border-cyan-400/30 px-2 py-1 text-cyan-300 hover:bg-cyan-400/10"
                    >
                      View & Play
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedGroup && repoId && (
        <TrajectoryDiversityGroupDialog
          key={`${repoId}:${selectedGroup.groupId}`}
          repoId={repoId}
          group={selectedGroup}
          episodes={diversity.episodes}
          smoothnessScores={smoothnessScores}
          reviews={reviews}
          onReview={setReview}
          onClose={closeGroup}
        />
      )}

      <details className="panel overflow-hidden">
        <summary className="cursor-pointer px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-200">
            Representative Selection
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Greedy farthest-point selection over the candidate subset.
          </p>
        </summary>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-xs">
            <thead className="bg-[var(--surface-0)] text-left text-slate-500">
              <tr>
                {[
                  "Order",
                  "Episode",
                  "Marginal coverage",
                  "Coverage after selection",
                  "Group",
                ].map((title) => (
                  <th
                    key={title}
                    className="whitespace-nowrap px-4 py-2 font-medium"
                  >
                    {title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {diversity.representativeSelection.map((selection) => (
                <tr
                  key={selection.episodeIndex}
                  className="border-t border-white/5 text-slate-300"
                >
                  <td className="px-4 py-2 tabular-nums">{selection.order}</td>
                  <td className="px-4 py-2 font-medium tabular-nums">
                    ep {selection.episodeIndex}
                  </td>
                  <td className="px-4 py-2 tabular-nums">
                    {formatPercent(selection.marginalCoverage)}
                  </td>
                  <td className="px-4 py-2 tabular-nums">
                    {formatPercent(selection.coverageAfter)}
                  </td>
                  <td className="px-4 py-2">{selection.groupId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-white/10 px-5 py-3 text-xs leading-relaxed text-slate-500">
          Resampling: {diversity.resamplePoints} points per trajectory.
          Initial-state / behavior weights:{" "}
          {diversity.weights.initial.toFixed(1)}/{" "}
          {diversity.weights.behavior.toFixed(1)}. Behavior weights: actions{" "}
          {diversity.weights.action.toFixed(1)}, EEF preferred{" "}
          {diversity.weights.endEffector.toFixed(1)}; joint angles{" "}
          {diversity.weights.jointAngles.toFixed(1)} when EEF is unavailable.
        </div>
      </details>
    </section>
  );
}
