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
import { InitialIdleControls } from "@/components/initial-idle-controls";
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
    expect(screen.queryByText("确认加入裁剪列表")).toBeNull();
    expect(mocks.play).toHaveBeenLastCalledWith(false);
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
