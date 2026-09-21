// @vitest-environment jsdom
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { BatchIdleControls } from "@/components/batch-idle-controls";
import {
  ClipDraftsProvider,
  useClipDrafts,
} from "@/context/clip-drafts-context";
import { batchStorageKey } from "../batch";
import { frames, profile } from "./fixtures";
import { detectInitialIdle } from "../detect";
const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("../load", () => ({ loadEpisodeSignalFrames: mocks.load }));
const episodes = [0, 1, 2];
function State() {
  const { drafts, setInterval } = useClipDrafts();
  return (
    <>
      <output data-testid="drafts">{JSON.stringify(drafts)}</output>
      <button onClick={() => setInterval(0, { start: 40, end: 41 })}>
        later edit
      </button>
    </>
  );
}
function Page() {
  return (
    <ClipDraftsProvider repoId="local/test">
      <BatchIdleControls
        enabled
        repoId="local/test"
        episodes={episodes}
        episodeId={0}
        profiles={{}}
        onReview={() => {}}
      />
      <State />
    </ClipDraftsProvider>
  );
}
beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  mocks.load.mockResolvedValue(frames());
  const result = detectInitialIdle(frames(), profile());
  sessionStorage.setItem(
    batchStorageKey("local/test"),
    JSON.stringify([
      { episodeId: 0, edge: "start", profile: profile(), result },
      {
        episodeId: 0,
        edge: "end",
        profile: profile(),
        result: {
          ...result,
          candidate: {
            ...result.candidate!,
            removedFrames: { start: 50, end: 59 },
          },
        },
      },
      { episodeId: 1, edge: "start", profile: profile(), result },
      {
        episodeId: 2,
        edge: "start",
        profile: profile(),
        result: {
          status: "needs_review",
          reason: "slow_accumulated_motion",
          candidate: null,
        },
      },
    ]),
  );
  sessionStorage.setItem(
    "lerobot-clip-drafts:local/test",
    JSON.stringify({ 0: [{ start: 0, end: 5 }], 2: [{ start: 40, end: 42 }] }),
  );
});
afterEach(cleanup);
const state = () => JSON.parse(screen.getByTestId("drafts").textContent!);
test("one click merges candidate edges, excludes review entries, deduplicates and undoes exactly", async () => {
  render(<Page />);
  fireEvent.click(await screen.findByText("一键加入全部候选（3）"));
  await screen.findByText(/已将 3 项候选加入 2 个 episode/);
  expect(state()).toEqual({
    0: [
      { start: 0, end: 23 },
      { start: 50, end: 59 },
    ],
    1: [{ start: 0, end: 23 }],
    2: [{ start: 40, end: 42 }],
  });
  expect(
    (screen.getByText("一键加入全部候选（0）") as HTMLButtonElement).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByText("撤销本次批量加入"));
  expect(state()).toEqual({
    0: [{ start: 0, end: 5 }],
    2: [{ start: 40, end: 42 }],
  });
});
test("undo refuses to overwrite subsequent edits", async () => {
  render(<Page />);
  fireEvent.click(await screen.findByText("一键加入全部候选（3）"));
  await screen.findByText(/已将 3 项候选/);
  fireEvent.click(screen.getByText("later edit"));
  const before = state();
  fireEvent.click(screen.getByText("撤销本次批量加入"));
  expect(screen.getByRole("alert").textContent).toContain("已有后续修改");
  expect(state()).toEqual(before);
});
test("a read failure leaves the entire batch unapplied", async () => {
  mocks.load
    .mockResolvedValueOnce(frames())
    .mockRejectedValueOnce(Error("missing data"));
  render(<Page />);
  fireEvent.click(await screen.findByText("一键加入全部候选（3）"));
  await screen.findByText("本次未加入任何候选。");
  expect(state()).toEqual({
    0: [{ start: 0, end: 5 }],
    2: [{ start: 40, end: 42 }],
  });
});
test("combined drafts cannot remove all frames", async () => {
  sessionStorage.setItem(
    "lerobot-clip-drafts:local/test",
    JSON.stringify({ 0: [{ start: 24, end: 59 }] }),
  );
  render(<Page />);
  fireEvent.click(await screen.findByText("一键加入全部候选（2）"));
  await screen.findByText("本次未加入任何候选。");
  expect(state()).toEqual({ 0: [{ start: 24, end: 59 }] });
});
test("an edit made during validation is preserved in the merge", async () => {
  let resolve!: (r: ReturnType<typeof frames>) => void;
  mocks.load.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  render(<Page />);
  fireEvent.click(await screen.findByText("一键加入全部候选（3）"));
  fireEvent.click(screen.getByText("later edit"));
  resolve(frames());
  await waitFor(() =>
    expect(state()[0]).toEqual([
      { start: 0, end: 23 },
      { start: 40, end: 41 },
      { start: 50, end: 59 },
    ]),
  );
});
