import { describe, expect, test } from "vitest";
import {
  normalizeFrameIntervals,
  retainedFrameIndexes,
} from "@/server/dataset-export/clips";

describe("clip frame intervals", () => {
  test("sorts and merges overlapping or adjacent intervals", () => {
    expect(
      normalizeFrameIntervals(
        [
          { start: 7, end: 8 },
          { start: 2, end: 4 },
          { start: 5, end: 6 },
        ],
        10,
      ),
    ).toEqual([{ start: 2, end: 8 }]);
  });
  test("rejects out of range and complete removals", () => {
    expect(() => normalizeFrameIntervals([{ start: 0, end: 10 }], 10)).toThrow(
      "Invalid",
    );
    expect(() => normalizeFrameIntervals([{ start: 0, end: 9 }], 10)).toThrow(
      "every frame",
    );
  });
  test("maps retained frame indexes from the canonical intervals", () => {
    expect(
      retainedFrameIndexes(8, [
        { start: 1, end: 2 },
        { start: 5, end: 5 },
      ]),
    ).toEqual([0, 3, 4, 6, 7]);
  });
});
