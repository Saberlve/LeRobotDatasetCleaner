// @vitest-environment jsdom
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import {
  ClipDraftsProvider,
  useClipDrafts,
} from "@/context/clip-drafts-context";
import { BatchReviewCheckbox } from "@/components/batch-review-checkbox";
import { afterEach, expect, test, vi } from "vitest";
import Sidebar from "@/components/side-nav";
import type { DatasetDisplayInfo } from "@/app/[org]/[dataset]/[episode]/fetch-data";
import { publishBatchResults, saveBatchResults } from "../use-batch-results";
import { detectInitialIdle } from "../detect";
import { frames, profile } from "./fixtures";

vi.mock("@/context/flagged-episodes-context", () => ({
  useFlaggedEpisodes: () => ({ flagged: new Set(), count: 0, toggle: vi.fn() }),
}));
afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

function DraftActions() {
  const { replaceEpisode } = useClipDrafts();
  return (
    <>
      <button onClick={() => replaceEpisode(0, [{ start: 0, end: 23 }])}>
        add draft
      </button>
      <button onClick={() => replaceEpisode(0, [])}>undo draft</button>
    </>
  );
}
function Page() {
  return (
    <ClipDraftsProvider repoId="local/test">
      <Sidebar
        datasetInfo={
          {
            repoId: "local/test",
            total_frames: 100,
            total_episodes: 2,
            fps: 15,
          } as DatasetDisplayInfo
        }
        paginatedEpisodes={[0, 1]}
        episodeId={0}
        totalPages={1}
        currentPage={1}
        prevPage={() => {}}
        nextPage={() => {}}
        showFlaggedOnly={false}
        onShowFlaggedOnlyChange={() => {}}
        onEpisodeSelect={() => {}}
      />
      <DraftActions />
      <BatchReviewCheckbox repoId="local/test" episodeId={0} edge="start" />
      <BatchReviewCheckbox repoId="local/test" episodeId={0} edge="end" />
    </ClipDraftsProvider>
  );
}
test("sidebar shows both edge statuses, isolates datasets and clears superseded markers", () => {
  render(<Page />);
  const candidate = {
    episodeId: 0,
    edge: "start" as const,
    profile: profile(),
    result: detectInitialIdle(frames(), profile()),
  };
  act(() => publishBatchResults("local/other", [candidate]));
  expect(screen.queryByLabelText("候选：开头")).toBeNull();
  act(() =>
    publishBatchResults("local/test", [
      candidate,
      {
        ...candidate,
        edge: "end",
        result: {
          ...candidate.result,
          candidate: null,
          status: "needs_review",
        },
      },
    ]),
  );
  expect(screen.getByLabelText("候选：开头")).toBeTruthy();
  expect(screen.getByLabelText("需要复核：结尾")).toBeTruthy();
  act(() => publishBatchResults("local/test", []));
  expect(screen.queryByLabelText("候选：开头")).toBeNull();
  expect(screen.queryByLabelText("需要复核：结尾")).toBeNull();
});

test("added candidates dim and undo restores them; checked reviews persist after remount", () => {
  const view = render(<Page />);
  const candidate = {
    episodeId: 0,
    edge: "start" as const,
    profile: profile(),
    result: detectInitialIdle(frames(), profile()),
  };
  act(() =>
    saveBatchResults("local/test", [
      candidate,
      {
        ...candidate,
        edge: "end",
        result: {
          ...candidate.result,
          candidate: null,
          status: "needs_review",
        },
      },
    ]),
  );
  const scissors = () => screen.getByLabelText("候选：开头");
  const question = () => screen.getByLabelText("需要复核：结尾");
  expect(scissors().getAttribute("data-complete")).toBe("false");
  fireEvent.click(screen.getByText("add draft"));
  expect(scissors().getAttribute("data-complete")).toBe("true");
  fireEvent.click(screen.getByText("undo draft"));
  expect(scissors().getAttribute("data-complete")).toBe("false");
  expect(question().getAttribute("data-complete")).toBe("false");
  fireEvent.click(screen.getByLabelText("Episode 0 结尾是否复核"));
  expect(question().getAttribute("data-complete")).toBe("true");
  view.unmount();
  render(<Page />);
  expect(question().getAttribute("data-complete")).toBe("true");
  expect(
    (screen.getByLabelText("Episode 0 结尾是否复核") as HTMLInputElement)
      .checked,
  ).toBe(true);
  fireEvent.click(screen.getByLabelText("Episode 0 结尾是否复核"));
  expect(question().getAttribute("data-complete")).toBe("false");
});

test("question mark stays bright until both edges have been reviewed", () => {
  render(<Page />);
  const result = {
    ...detectInitialIdle(frames(), profile()),
    candidate: null,
    status: "needs_review" as const,
  };
  act(() =>
    saveBatchResults(
      "local/test",
      (["start", "end"] as const).map((edge) => ({
        episodeId: 0,
        edge,
        profile: profile(),
        result,
      })),
    ),
  );
  fireEvent.click(screen.getByLabelText("Episode 0 开头是否复核"));
  expect(
    screen.getByLabelText("需要复核：开头、结尾").getAttribute("data-complete"),
  ).toBe("false");
  fireEvent.click(screen.getByLabelText("Episode 0 结尾是否复核"));
  expect(
    screen.getByLabelText("需要复核：开头、结尾").getAttribute("data-complete"),
  ).toBe("true");
});

test("explicit retention dims the scissors without creating a draft", () => {
  render(<Page />);
  act(() =>
    saveBatchResults("local/test", [
      {
        episodeId: 0,
        edge: "start",
        profile: profile(),
        result: detectInitialIdle(frames(), profile()),
        retained: true,
        reviewed: true,
      },
    ]),
  );
  expect(
    screen.getByLabelText("候选：开头").getAttribute("data-complete"),
  ).toBe("true");
  expect(screen.getByLabelText("候选：开头").style.opacity).toBe("0.3");
});
