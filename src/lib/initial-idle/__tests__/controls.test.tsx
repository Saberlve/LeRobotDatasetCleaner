// @vitest-environment jsdom
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { frames, profile, schema } from "./fixtures";
import { saveIdleProfile } from "../profile";
import { detectInitialIdle } from "../detect";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  info: vi.fn(),
  seek: vi.fn(),
  play: vi.fn(),
  rate: vi.fn(),
  sample: vi.fn(),
  dispose: vi.fn(),
  subscribe: vi.fn(() => () => {}),
}));
vi.mock("@/utils/versionUtils", () => ({
  getDatasetVersionAndInfo: mocks.info,
}));
vi.mock("../load", () => ({ loadEpisodeSignalFrames: mocks.load }));
vi.mock("@/app/[org]/[dataset]/[episode]/fetch-data", () => ({
  getEpisodeVideosInfo: async () => [],
}));
vi.mock("../tail-video", () => ({
  createTailVideoSampler: () => ({
    sample: mocks.sample,
    dispose: mocks.dispose,
  }),
}));
vi.mock("@/context/time-context", () => ({
  useTime: () => ({
    seek: mocks.seek,
    setIsPlaying: mocks.play,
    subscribe: mocks.subscribe,
    currentTime: 2.4,
    duration: 6,
    isPlaying: false,
    playbackRate: 1,
    setPlaybackRate: mocks.rate,
  }),
}));
import {
  InitialIdleControls,
  IdleBoundaryControls,
} from "@/components/initial-idle-controls";
import { batchStorageKey } from "../batch";
import { publishBatchResults } from "../use-batch-results";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
import {
  ClipDraftsProvider,
  useClipDrafts,
} from "@/context/clip-drafts-context";

function Drafts() {
  const { drafts, setInterval } = useClipDrafts();
  return (
    <>
      <output data-testid="drafts">{JSON.stringify(drafts)}</output>
      <button onClick={() => setInterval(0, { start: 50, end: 51 })}>
        manual-change
      </button>
    </>
  );
}
function Page({
  episode = 0,
  enabled = true,
  edge = "start",
}: {
  episode?: number;
  enabled?: boolean;
  edge?: "start" | "end";
}) {
  return (
    <ClipDraftsProvider repoId="local/test">
      <InitialIdleControls
        key={episode}
        repoId="local/test"
        episodeId={episode}
        enabled={enabled}
        edge={edge}
      />
      <Drafts />
    </ClipDraftsProvider>
  );
}
async function detect() {
  fireEvent.click(await screen.findByText("检测当前 episode"));
  await screen.findByText(/发现开头等待候选/);
}
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  mocks.info.mockResolvedValue({ info: schema(), version: "v3.0" });
  mocks.load.mockResolvedValue(frames());
  saveIdleProfile(localStorage, "local/test", schema(), profile());
  saveIdleProfile(localStorage, "local/test:trailing", schema(), profile());
  mocks.sample.mockResolvedValue([
    { camera: "scene", pixels: new Uint8ClampedArray([20, 40, 80, 255]) },
  ]);
});
afterEach(cleanup);

test("a full batch runs with the review controls mounted without nested update errors", async () => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const episodes = Array.from({ length: 42 }, (_, id) => id);
    render(
      <React.StrictMode>
        <ClipDraftsProvider repoId="local/test">
          <IdleBoundaryControls
            repoId="local/test"
            episodeId={0}
            episodes={episodes}
            enabled
          />
        </ClipDraftsProvider>
      </React.StrictMode>,
    );
    await screen.findByText("检测当前 episode");
    fireEvent.change(screen.getByLabelText("批量检测数量"), {
      target: { value: "42" },
    });
    fireEvent.change(screen.getByLabelText("批量检测范围"), {
      target: { value: "both" },
    });
    fireEvent.click(screen.getByText("开始批量检测"));
    await screen.findByText(
      "检测完成：42 个 episode，84 项结果。",
      {},
      { timeout: 15000 },
    );
    expect(
      errors.mock.calls.filter((call) =>
        String(call[0]).includes("Maximum update depth"),
      ),
    ).toEqual([]);
    expect(
      JSON.parse(sessionStorage.getItem(batchStorageKey("local/test"))!),
    ).toHaveLength(84);
  } finally {
    errors.mockRestore();
  }
}, 20000);

test("ordinary episode navigation restores both batch edges without a review selection", async () => {
  const result = detectInitialIdle(frames(), profile());
  const entries = [0, 1].flatMap((episodeId) =>
    (["start", "end"] as const).map((edge) => ({
      episodeId,
      edge,
      profile: profile(),
      result,
    })),
  );
  sessionStorage.setItem(
    batchStorageKey("local/test"),
    JSON.stringify(entries),
  );
  const page = (episodeId: number) => (
    <ClipDraftsProvider repoId="local/test">
      <IdleBoundaryControls
        key={episodeId}
        repoId="local/test"
        episodeId={episodeId}
        enabled
      />
      <Drafts />
    </ClipDraftsProvider>
  );
  const view = render(page(0));
  await screen.findByText("已载入批量检测结果及该批次参数。");
  fireEvent.click(screen.getByText("结尾等待"));
  await screen.findByText("已载入批量检测结果及该批次参数。");
  view.rerender(page(1));
  await screen.findByText("已载入批量检测结果及该批次参数。");
  expect(mocks.load).toHaveBeenCalledWith("local/test", 1, profile());
  expect(screen.getByTestId("drafts").textContent).toBe("{}");
});

test("new batch results automatically appear on the current episode", async () => {
  render(
    <ClipDraftsProvider repoId="local/test">
      <IdleBoundaryControls repoId="local/test" episodeId={0} enabled />
    </ClipDraftsProvider>,
  );
  await screen.findByText("检测当前 episode");
  act(() =>
    publishBatchResults("local/test", [
      {
        episodeId: 0,
        edge: "start",
        profile: profile(),
        result: detectInitialIdle(frames(), profile()),
      },
    ]),
  );
  await screen.findByText("已载入批量检测结果及该批次参数。");
});

test("marking a batch result reviewed does not reload the review player or change drafts", async () => {
  const result = {
    ...detectInitialIdle(frames(), profile()),
    candidate: null,
    status: "needs_review",
  };
  sessionStorage.setItem(
    batchStorageKey("local/test"),
    JSON.stringify([
      { episodeId: 0, edge: "start", profile: profile(), result },
    ]),
  );
  render(
    <ClipDraftsProvider repoId="local/test">
      <IdleBoundaryControls repoId="local/test" episodeId={0} enabled />
      <Drafts />
    </ClipDraftsProvider>,
  );
  await screen.findByText("已载入批量检测结果及该批次参数。");
  const checkbox = await screen.findByLabelText("Episode 0 开头是否复核");
  const loads = mocks.load.mock.calls.length;
  fireEvent.click(checkbox);
  expect(
    (screen.getByLabelText("Episode 0 开头是否复核") as HTMLInputElement)
      .checked,
  ).toBe(true);
  expect(mocks.load.mock.calls.length).toBe(loads);
  expect(screen.getByTestId("drafts").textContent).toBe("{}");
});

async function detectTail() {
  mocks.load.mockResolvedValue(
    frames().map((f, i) => ({
      ...f,
      state: [Math.min(i, 20) * 0.1, 0],
      action: [Math.min(i, 20) * 0.1, 0],
    })),
  );
  fireEvent.click(await screen.findByText("检测当前 episode"));
  await screen.findByText(/发现结尾等待候选/);
}
describe("tail review", () => {
  test("reopening saved drafts restores accurate clip bands without running detection", async () => {
    sessionStorage.setItem(
      "lerobot-clip-drafts:local/test",
      JSON.stringify({ 0: [{ start: 0, end: 5 }] }),
    );
    render(<Page />);
    const band = await screen.findByTitle("已标记 0–5 帧，待导出");
    expect(parseFloat(band.style.width)).toBeCloseTo((0.6 / 5.9) * 100);
    expect((screen.getByText("裁剪后预览") as HTMLButtonElement).disabled).toBe(
      false,
    );
    expect(screen.queryByText(/发现开头等待候选/)).toBeNull();
    expect(mocks.load).toHaveBeenCalledTimes(1);
  });
  test("both edges default to expanded and each keeps its own choice across episodes", async () => {
    const view = render(<Page />);
    await screen.findByText("检测当前 episode");
    expect(screen.getByText("收起")).toBeTruthy();
    fireEvent.click(screen.getByText("收起"));
    view.rerender(<Page episode={1} />);
    await screen.findByText("展开检测");
    view.unmount();
    render(<Page edge="end" />);
    await screen.findByText("检测当前 episode");
    expect(screen.getByText("收起")).toBeTruthy();
  });
  test("loading a batch candidate still requires human confirmation and leaves drafts untouched", async () => {
    render(
      <ClipDraftsProvider repoId="local/test">
        <InitialIdleControls
          repoId="local/test"
          episodeId={0}
          enabled
          batchReview={{
            episodeId: 0,
            edge: "start",
            profile: profile(),
            result: detectInitialIdle(frames(), profile()),
          }}
        />
        <Drafts />
      </ClipDraftsProvider>,
    );
    await screen.findByText(/已载入批量检测结果/);
    expect(screen.getByTestId("drafts").textContent).toBe("{}");
    expect(
      (screen.getByText("确认加入裁剪列表") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByText(/发现开头等待候选/)).toBeTruthy();
  });
  test("tail starts after protected confirmation and unions with the existing leading cut", async () => {
    sessionStorage.setItem(
      "lerobot-clip-drafts:local/test",
      JSON.stringify({ 0: [{ start: 0, end: 5 }] }),
    );
    render(<Page edge="end" />);
    await detectTail();
    expect(
      (screen.getByLabelText("候选开始帧") as HTMLInputElement).value,
    ).toBe("26");
    fireEvent.change(screen.getByLabelText("候选开始帧"), {
      target: { value: "20" },
    });
    expect(screen.getByRole("alert").textContent).toContain("不能侵入");
    fireEvent.click(screen.getByText("恢复建议边界"));
    fireEvent.change(screen.getByLabelText("拖动裁剪开始帧"), {
      target: { value: "30" },
    });
    expect(screen.getByText(/当前保留 1.00/)).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByText("确认加入裁剪列表"));
    expect(JSON.parse(screen.getByTestId("drafts").textContent!)[0]).toEqual([
      { start: 0, end: 5 },
      { start: 30, end: 59 },
    ]);
    fireEvent.click(screen.getByText("撤销本次加入"));
    expect(JSON.parse(screen.getByTestId("drafts").textContent!)[0]).toEqual([
      { start: 0, end: 5 },
    ]);
    expect(mocks.dispose).toHaveBeenCalled();
  });
  test("visual failure does not expose a confirmable candidate", async () => {
    mocks.sample.mockRejectedValue(Error("video unavailable"));
    mocks.load.mockResolvedValue(
      frames().map((f, i) => ({
        ...f,
        state: [Math.min(i, 20) * 0.1, 0],
        action: [Math.min(i, 20) * 0.1, 0],
      })),
    );
    render(<Page edge="end" />);
    fireEvent.click(await screen.findByText("检测当前 episode"));
    await screen.findByText(/视频缺失、解码失败/);
    expect(screen.queryByText("确认加入裁剪列表")).toBeNull();
  });
  test("tail and leading review decisions are isolated", async () => {
    const view = render(<Page edge="end" />);
    await detectTail();
    fireEvent.click(screen.getByText("保留此段"));
    view.unmount();
    render(<Page />);
    expect(screen.queryByText(/复核记录：已保留/)).toBeNull();
  });
});

describe("human review of initial waiting", () => {
  test("trigger details distinguish command and measured motion and locate the exact frame", async () => {
    mocks.load.mockResolvedValue(
      frames().map((r) => ({ ...r, state: [0, 0] })),
    );
    render(<Page />);
    await detect();
    const details = screen.getByLabelText("开头活动触发明细");
    fireEvent.click(details.querySelector("summary")!);
    const trigger = screen.getByRole("button", {
      name: /joint · 指令 · 第 31 帧/,
    });
    expect(trigger.textContent).toContain("持续运动已确认");
    fireEvent.click(trigger);
    expect(mocks.seek).toHaveBeenLastCalledWith(3.1);
  });
  test("a rejected early significant pulse still exposes its frame and values", async () => {
    const rows = frames();
    rows[2].state[0] = 0.1;
    mocks.load.mockResolvedValue(rows);
    render(<Page />);
    fireEvent.click(await screen.findByText("检测当前 episode"));
    await screen.findByText(/前段存在明显的短暂变化/);
    const details = screen.getByLabelText("开头活动触发明细");
    fireEvent.click(details.querySelector("summary")!);
    expect(
      screen.getByRole("button", { name: /joint · 实测 · 第 2 帧/ })
        .textContent,
    ).toContain("0.10000");
    expect(screen.queryByText("确认加入裁剪列表")).toBeNull();
  });
  test("detection cannot edit drafts; approval is required and undo restores prior edits", async () => {
    sessionStorage.setItem(
      "lerobot-clip-drafts:local/test",
      JSON.stringify({ 0: [{ start: 40, end: 42 }] }),
    );
    render(<Page />);
    await detect();
    const original = '{"0":[{"start":40,"end":42}]}';
    expect(screen.getByTestId("drafts").textContent).toBe(original);
    const confirm = screen.getByText("确认加入裁剪列表") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(confirm);
    expect(JSON.parse(screen.getByTestId("drafts").textContent!)[0]).toEqual([
      { start: 0, end: 23 },
      { start: 40, end: 42 },
    ]);
    fireEvent.click(screen.getByText("撤销本次加入"));
    expect(screen.getByTestId("drafts").textContent).toBe(original);
    await waitFor(() =>
      expect(sessionStorage.getItem("lerobot-clip-drafts:local/test")).toBe(
        original,
      ),
    );
  });
  test("shortening clears approval, extending beyond protected context is rejected", async () => {
    render(<Page />);
    await detect();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByLabelText("候选结束帧"), {
      target: { value: "10" },
    });
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(
      false,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByLabelText("候选结束帧"), {
      target: { value: "29" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    expect(
      (screen.getByText("确认加入裁剪列表") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByTestId("drafts").textContent).toBe("{}");
  });
  test("retaining and previewing leave data decisions unchanged", async () => {
    render(<Page />);
    await detect();
    fireEvent.click(screen.getByText("预览裁剪交界"));
    expect(mocks.seek).toHaveBeenCalledWith(1.4);
    expect(mocks.play).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByText("保留此段"));
    expect(screen.getByTestId("drafts").textContent).toBe("{}");
    expect(
      (screen.getByText("确认加入裁剪列表") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(mocks.play).toHaveBeenLastCalledWith(false);
    let saved = JSON.parse(
      sessionStorage.getItem("lerobot-idle-batch:1:local/test")!,
    );
    expect(saved[0].retained).toBe(true);
    expect(saved[0].reviewed).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(
      (screen.getByText("确认加入裁剪列表") as HTMLButtonElement).disabled,
    ).toBe(false);
    fireEvent.click(screen.getByText("确认加入裁剪列表"));
    saved = JSON.parse(
      sessionStorage.getItem("lerobot-idle-batch:1:local/test")!,
    );
    expect(saved[0].retained).toBe(false);
    expect(saved[0].reviewed).toBe(true);
    expect(screen.getByText(/所选区间已在裁剪列表中/)).toBeTruthy();
  });
  test("changing parameters invalidates the earlier candidate", async () => {
    render(<Page />);
    await detect();
    fireEvent.change(screen.getByLabelText("保留动作前上下文（秒）"), {
      target: { value: "2" },
    });
    expect(screen.getByText(/旧结果仅供对比/)).toBeTruthy();
    expect(
      (screen.getByText("确认加入裁剪列表") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(mocks.play).toHaveBeenLastCalledWith(false);
  });
  test("updated boundary changes retained context, gives an error and supports reset", async () => {
    render(<Page />);
    await detect();
    fireEvent.change(screen.getByLabelText("候选结束帧"), {
      target: { value: "10" },
    });
    expect(screen.getByText(/当前保留 1.80/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("候选结束帧"), {
      target: { value: "99" },
    });
    expect(screen.getByRole("alert").textContent).toContain("不能侵入");
    fireEvent.click(screen.getByText("恢复建议边界"));
    expect(
      (screen.getByLabelText("候选结束帧") as HTMLInputElement).value,
    ).toBe("23");
  });
  test("parameters rerun on cached complete rows and compare old/new boundary", async () => {
    render(<Page />);
    await detect();
    fireEvent.change(screen.getByLabelText("保留动作前上下文（秒）"), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByText("检测当前 episode"));
    await screen.findByText(/2.40 秒 → 1.90 秒/);
    expect(mocks.load).toHaveBeenCalledTimes(1);
  });
  test("single episode redetection replaces persisted batch evidence and survives reopening", async () => {
    const page = () => (
      <ClipDraftsProvider repoId="local/test">
        <IdleBoundaryControls repoId="local/test" episodeId={0} enabled />
      </ClipDraftsProvider>
    );
    const view = render(page());
    await detect();
    fireEvent.change(screen.getByLabelText("保留动作前上下文（秒）"), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByText("检测当前 episode"));
    await screen.findByText(/2.40 秒 → 1.90 秒/);
    const entries = JSON.parse(
      sessionStorage.getItem(batchStorageKey("local/test"))!,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].profile.contextSeconds).toBe(1);
    view.unmount();
    render(page());
    await screen.findByText("已载入批量检测结果及该批次参数。");
    expect(
      (screen.getByLabelText("候选结束帧") as HTMLInputElement).value,
    ).toBe("18");
  });
  test("shortened acceptance persists its boundary and undo leaves results reusable", async () => {
    const page = () => (
      <ClipDraftsProvider repoId="local/test">
        <IdleBoundaryControls repoId="local/test" episodeId={0} enabled />
        <Drafts />
      </ClipDraftsProvider>
    );
    const view = render(page());
    await detect();
    fireEvent.change(screen.getByLabelText("候选结束帧"), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByText("确认加入裁剪列表"));
    expect(
      JSON.parse(sessionStorage.getItem(batchStorageKey("local/test"))!)[0]
        .acceptedFrames,
    ).toEqual({ start: 0, end: 10 });
    expect(screen.getByText("恢复建议边界")).toBeTruthy();
    fireEvent.click(screen.getByText("撤销本次加入"));
    expect(screen.getByTestId("drafts").textContent).toBe("{}");
    fireEvent.click(screen.getByRole("checkbox"));
    expect(
      (screen.getByText("确认加入裁剪列表") as HTMLButtonElement).disabled,
    ).toBe(false);
    view.unmount();
    render(page());
    await screen.findByText("已载入批量检测结果及该批次参数。");
    expect(
      (screen.getByLabelText("候选结束帧") as HTMLInputElement).value,
    ).toBe("10");
  });
  test("retained decision and reason survive reopening without fabricating a draft", async () => {
    const view = render(<Page />);
    await detect();
    fireEvent.change(screen.getByLabelText("复核备注"), {
      target: { value: "等待物体稳定" },
    });
    fireEvent.click(screen.getByText("保留此段"));
    view.unmount();
    render(<Page />);
    expect(screen.getByText(/复核记录：已保留/)).toBeTruthy();
    expect(
      (screen.getByLabelText("复核备注") as HTMLTextAreaElement).value,
    ).toBe("等待物体稳定");
    expect(screen.getByTestId("drafts").textContent).toBe("{}");
  });
  test("frame buttons, rate and boundary slider control playback", async () => {
    render(<Page />);
    await detect();
    fireEvent.click(screen.getByText("后一帧"));
    expect(mocks.seek).toHaveBeenLastCalledWith(2.5);
    fireEvent.change(screen.getByLabelText("复核播放速度"), {
      target: { value: "0.25" },
    });
    expect(mocks.rate).toHaveBeenLastCalledWith(0.25);
    fireEvent.change(screen.getByLabelText("拖动裁剪结束帧"), {
      target: { value: "10" },
    });
    expect(mocks.seek).toHaveBeenLastCalledWith(1.1);
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(
      false,
    );
  });
  test("a late response from another episode cannot be confirmed", async () => {
    let resolve!: (value: ReturnType<typeof frames>) => void;
    mocks.load.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const view = render(<Page />);
    fireEvent.click(await screen.findByText("检测当前 episode"));
    view.rerender(<Page episode={1} />);
    await act(async () => resolve(frames()));
    expect(screen.queryByText(/发现开头等待候选/)).toBeNull();
    expect(screen.getByTestId("drafts").textContent).toBe("{}");
  });
  test("undo never overwrites subsequent manual changes", async () => {
    render(<Page />);
    await detect();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByText("确认加入裁剪列表"));
    fireEvent.click(screen.getByText("manual-change"));
    fireEvent.click(screen.getByText("撤销本次加入"));
    expect(screen.getByRole("alert").textContent).toContain("已有后续修改");
    expect(
      JSON.parse(screen.getByTestId("drafts").textContent!)[0],
    ).toContainEqual({ start: 50, end: 51 });
  });
  test("non-local data can be reviewed but not added to export drafts", async () => {
    render(<Page enabled={false} />);
    await detect();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(
      (screen.getByText("确认加入裁剪列表") as HTMLButtonElement).disabled,
    ).toBe(true);
  });
  test("unreadable data is shown as an error, never an empty successful detection", async () => {
    mocks.load.mockRejectedValue(new Error("missing parquet"));
    render(<Page />);
    fireEvent.click(await screen.findByText("检测当前 episode"));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "missing parquet",
    );
    expect(screen.queryByText("确认加入裁剪列表")).toBeNull();
  });
});
