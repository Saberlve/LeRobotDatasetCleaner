// @vitest-environment jsdom
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { BatchIdleControls } from "@/components/batch-idle-controls";
import {
  ClipDraftsProvider,
  useClipDrafts,
} from "@/context/clip-drafts-context";
import { saveBatchResults, getBatchResults } from "../use-batch-results";
import { batchStorageKey } from "../batch";
import { frames, profile, schema } from "./fixtures";
import { detectInitialIdle } from "../detect";
const mocks = vi.hoisted(() => ({ load: vi.fn(), info: vi.fn() }));
vi.mock("@/utils/versionUtils", () => ({
  getDatasetVersionAndInfo: mocks.info,
}));
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
function Page({ episodeId = 0 }: { episodeId?: number }) {
  return (
    <ClipDraftsProvider repoId="local/test">
      <BatchIdleControls
        repoId="local/test"
        episodes={episodes}
        key={episodeId}
        episodeId={episodeId}
        profiles={{ start: profile(), end: profile() }}
      />
      <State />
    </ClipDraftsProvider>
  );
}
beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  mocks.load.mockResolvedValue(frames());
  mocks.info.mockResolvedValue({ info: schema(), version: "v3.0" });
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

test("another batch retains earlier candidates and their reviewed state", async () => {
  const view = render(<Page />);
  act(() =>
    saveBatchResults(
      "local/test",
      getBatchResults("local/test").map((entry) =>
        entry.episodeId === 2 ? { ...entry, reviewed: true } : entry,
      ),
    ),
  );
  fireEvent.change(screen.getByLabelText("批量起始 episode"), {
    target: { value: "1" },
  });
  fireEvent.change(screen.getByLabelText("批量检测数量"), {
    target: { value: "1" },
  });
  fireEvent.change(screen.getByLabelText("批量检测范围"), {
    target: { value: "start" },
  });
  fireEvent.click(screen.getByText("开始批量检测"));
  await screen.findByText("检测完成：1 个 episode，1 项结果。");
  const saved = JSON.parse(
    sessionStorage.getItem(batchStorageKey("local/test"))!,
  );
  expect(saved).toHaveLength(4);
  expect(
    saved.find((entry: { episodeId: number }) => entry.episodeId === 2)
      .reviewed,
  ).toBe(true);
  expect(
    saved.filter((entry: { episodeId: number }) => entry.episodeId === 0),
  ).toHaveLength(2);
  view.unmount();
  render(<Page episodeId={1} />);
  expect(
    getBatchResults("local/test").find((entry) => entry.episodeId === 2)
      ?.reviewed,
  ).toBe(true);
  expect(screen.queryByText("结果明细")).toBeNull();
  expect(screen.queryByLabelText("Episode 2 开头是否复核")).toBeNull();
});

test("batch start survives episode navigation and remounts", () => {
  const view = render(<Page />);
  const start = () =>
    screen.getByLabelText("批量起始 episode") as HTMLSelectElement;
  fireEvent.change(start(), { target: { value: "1" } });
  fireEvent.change(screen.getByLabelText("批量检测数量"), {
    target: { value: "2" },
  });
  fireEvent.change(screen.getByLabelText("批量检测范围"), {
    target: { value: "start" },
  });
  view.rerender(<Page episodeId={2} />);
  expect(start().value).toBe("1");
  view.unmount();
  render(<Page episodeId={0} />);
  expect(start().value).toBe("1");
  expect(
    (screen.getByLabelText("批量检测数量") as HTMLInputElement).value,
  ).toBe("2");
  expect(
    (screen.getByLabelText("批量检测范围") as HTMLSelectElement).value,
  ).toBe("start");
});

test("stopping a pending batch preserves old results and drafts", async () => {
  let resolve!: (rows: ReturnType<typeof frames>) => void;
  mocks.load.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(<Page />);
  const before = state();
  const results = sessionStorage.getItem(batchStorageKey("local/test"));
  fireEvent.change(screen.getByLabelText("批量检测范围"), {
    target: { value: "start" },
  });
  fireEvent.click(screen.getByText("开始批量检测"));
  await act(async () => {});
  fireEvent.click(screen.getByText("停止批量检测"));
  await act(async () => {
    resolve(frames());
  });
  await screen.findByText("已停止，保留 0 项已完成结果。");
  expect(state()).toEqual(before);
  expect(sessionStorage.getItem(batchStorageKey("local/test"))).toBe(results);
});

test("older batch results restore their starting episode", () => {
  render(<Page episodeId={2} />);
  expect(
    (screen.getByLabelText("批量起始 episode") as HTMLSelectElement).value,
  ).toBe("0");
});
test("batch detection offers no bulk clipping and leaves existing drafts unchanged", async () => {
  render(<Page />);
  const before = state();
  expect(screen.queryByText(/一键加入全部候选/)).toBeNull();
  expect(screen.queryByText("撤销本次批量加入")).toBeNull();
  fireEvent.change(screen.getByLabelText("批量检测范围"), {
    target: { value: "start" },
  });
  fireEvent.click(screen.getByText("开始批量检测"));
  await screen.findByText("检测完成：3 个 episode，3 项结果。");
  expect(state()).toEqual(before);
});
