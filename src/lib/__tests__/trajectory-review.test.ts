import { describe, expect, test } from "vitest";
import {
  computePhaseSmoothness,
  rankPhaseSmoothness,
} from "../trajectory-phase-sparc";
import {
  hydrateReviews,
  REVIEW_FEEDBACK_REVISION,
  reviewStorageKey,
  validReviews,
} from "../trajectory-review";

const makeEpisode = (index: number) =>
  rankPhaseSmoothness([
    computePhaseSmoothness(
      index,
      Array.from({ length: 61 }, (_, i) => ({
        timestamp: i / 15,
        position: [i / 15, 0, 0] as [number, number, number],
      })),
    ),
  ])[0];

describe("independent manual record persistence (not algorithm validation)", () => {
  test("preserves a local annotation and explicit unreviewed override without changing scores", () => {
    const ep = makeEpisode(101);
    const original = JSON.stringify(ep);
    const record = {
      decision: "unreviewed",
      fingerprint: ep.fingerprint,
      source: "synthetic storage test",
      feedbackRevision: REVIEW_FEEDBACK_REVISION,
    };
    expect(
      hydrateReviews("local/synthetic", [ep], { 101: record })[101],
    ).toEqual(record);
    expect(JSON.stringify(ep)).toBe(original);
    expect(reviewStorageKey("local/a")).not.toBe(reviewStorageKey("local/b"));
  });
  test("rejects stale fingerprints and malformed records", () => {
    const ep = makeEpisode(101);
    expect(
      validReviews(
        { 101: { decision: "normal", fingerprint: "old", source: "test" } },
        [ep],
      ),
    ).toEqual({});
    expect(
      validReviews(
        {
          101: {
            decision: "invalid",
            fingerprint: ep.fingerprint,
            source: "test",
          },
        },
        [ep],
      ),
    ).toEqual({});
    expect(validReviews([], [ep])).toEqual({});
  });
});
