import feedback from "./trajectory-review-feedback.json";
import type { TrajectorySmoothnessEpisode } from "./trajectory-phase-sparc";

export type ReviewDecision =
  | "normal"
  | "borderline"
  | "abnormal"
  | "unreviewed";
export type TrajectoryReview = {
  decision: ReviewDecision;
  fingerprint: string;
  source: string;
  feedbackRevision?: string;
};
export type TrajectoryReviews = Record<number, TrajectoryReview>;
export const REVIEW_FEEDBACK_REVISION = feedback.revision;
export const reviewStorageKey = (repoId: string) =>
  `trajectory-reviews:v1:${repoId}`;
export const legacyReviewStorageKey = (repoId: string) =>
  `trajectory-reviews:multiscale-sal-phase-ted-v3:${repoId}`;

export function seedReviews(
  repoId: string,
  episodes: TrajectorySmoothnessEpisode[],
): TrajectoryReviews {
  if (repoId !== feedback.repoId) return {};
  const result: TrajectoryReviews = {};
  for (const decision of ["normal", "borderline", "abnormal"] as const) {
    const known = feedback[decision] as Record<string, string>;
    for (const episode of episodes) {
      if (known[episode.episodeIndex] === episode.fingerprint)
        result[episode.episodeIndex] = {
          decision,
          fingerprint: episode.fingerprint,
          source: feedback.source,
          feedbackRevision: REVIEW_FEEDBACK_REVISION,
        };
    }
  }
  return result;
}

/** Apply corrected user feedback once, without erasing unrelated local reviews.
 * Subsequent explicit edits carry the revision and can override the new seed. */
export function hydrateReviews(
  repoId: string,
  episodes: TrajectorySmoothnessEpisode[],
  raw: unknown,
): TrajectoryReviews {
  const seeded = seedReviews(repoId, episodes);
  const local = validReviews(raw, episodes);
  for (const [index, record] of Object.entries(local)) {
    const id = Number(index);
    if (!seeded[id] || record.feedbackRevision === REVIEW_FEEDBACK_REVISION)
      seeded[id] = record;
  }
  return seeded;
}

export function validReviews(
  raw: unknown,
  episodes: TrajectorySmoothnessEpisode[],
): TrajectoryReviews {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: TrajectoryReviews = {};
  for (const e of episodes) {
    const value = (raw as Record<number, unknown>)[e.episodeIndex];
    if (!value || typeof value !== "object") continue;
    const record = value as TrajectoryReview;
    if (
      record.fingerprint === e.fingerprint &&
      ["normal", "borderline", "abnormal", "unreviewed"].includes(
        record.decision,
      ) &&
      typeof record.source === "string"
    )
      result[e.episodeIndex] = record;
  }
  return result;
}
