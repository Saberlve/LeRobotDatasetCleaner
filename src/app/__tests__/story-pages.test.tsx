// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

import WhyMemoryPage from "@/app/why-memory/page";
import MethodPage from "@/app/method/page";
import MemorySystemsPage from "@/app/memory-systems/page";
import ResultsPage from "@/app/results/page";
import AnalysisPage from "@/app/analysis/page";
import ConclusionPage from "@/app/conclusion/page";
import { thesisNavItems } from "@/content/thesis-site";
import { SamplingComparisonAnimation } from "@/components/thesis/sampling-comparison-animation";
import { MemorySystemComparisonTrack } from "@/components/thesis/story-page/memory-system-diagrams";

describe("story pages", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  test("renders the six defense story routes with shared navigation", () => {
    const pages = [
      renderToStaticMarkup(<WhyMemoryPage />),
      renderToStaticMarkup(<MethodPage />),
      renderToStaticMarkup(<MemorySystemsPage />),
      renderToStaticMarkup(<ResultsPage />),
      renderToStaticMarkup(<AnalysisPage />),
      renderToStaticMarkup(<ConclusionPage />),
    ];

    expect(thesisNavItems).toHaveLength(6);
    expect(thesisNavItems.map((item) => item.href)).toEqual([
      "/why-memory",
      "/method",
      "/memory-systems",
      "/results",
      "/analysis",
      "/conclusion",
    ]);

    expect(pages[0]).toContain("VLA 模型的“金鱼记忆”");
    expect(pages[1]).toContain("让VLA不再「只看当下」");
    expect(pages[2]).toContain("同一个动机，四种实现：哪种最合理？");
    expect(pages[3]).toContain("仿真与真机实验结果");
    expect(pages[4]).toContain("消融与分析实验");
    expect(pages[5]).toContain("四大贡献 · 一处洞察 · 一套平台");

    for (const html of pages) {
      expect(html).toContain('href="/why-memory"');
      expect(html).toContain('href="/conclusion"');
      expect(html).toContain('href="/evaluation"');
      expect(html).toContain("进入评测平台");
      expect(html.includes("下一页") || html.includes("返回首页")).toBe(true);
      expect(html).not.toContain('href="/dataset-and-tooling"');
    }
  });

  test("renders memory systems table without duplicate-key warnings", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    render(<MemorySystemsPage />);

    const hasDuplicateKeyWarning = consoleError.mock.calls.some((call) =>
      call.some((message) =>
        String(message).includes("Encountered two children with the same key"),
      ),
    );

    consoleError.mockRestore();

    expect(hasDuplicateKeyWarning).toBe(false);
  });

  test("keeps the architecture diagram focused on remaining comparison fields", () => {
    const html = renderToStaticMarkup(<MemorySystemComparisonTrack />);

    expect(html).not.toContain("改 VLM 骨干");
    expect(html).not.toContain("与图像通道");
    expect(html).not.toContain("捷径风险");
    expect(html).not.toContain("序列长度");
    expect(html).not.toContain("训练成本");
    expect(html).not.toContain("核心备注");
  });

  test("omits the memory systems numbered architecture rationale section", () => {
    const html = renderToStaticMarkup(<MemorySystemsPage />);

    expect(html).not.toContain("Cache 将历史帧的键值缓存作为前缀拼入");
    expect(html).not.toContain("Comp 将历史压缩为固定数量的记忆词元");
    expect(html).not.toContain("Norm 将压缩后的历史表示映射为层归一化");
    expect(html).not.toContain("门控交叉注意力 将注入点移至动作专家一侧");
  });

  test("places memory access paths above the systems comparison table", () => {
    const html = renderToStaticMarkup(<MemorySystemsPage />);
    const comparisonHeaderIndex = html.indexOf(">维度</th>");

    expect(html.indexOf("四种 memory 接入路径")).toBeLessThan(
      comparisonHeaderIndex,
    );
    expect(html.indexOf("从历史保存到动作注入")).toBeLessThan(
      comparisonHeaderIndex,
    );
  });

  test("uses audience-facing defense copy instead of task-intent notes", () => {
    const html = [
      renderToStaticMarkup(<WhyMemoryPage />),
      renderToStaticMarkup(<MethodPage />),
      renderToStaticMarkup(<MemorySystemsPage />),
      renderToStaticMarkup(<ResultsPage />),
      renderToStaticMarkup(<AnalysisPage />),
      renderToStaticMarkup(<ConclusionPage />),
    ].join("");

    expect(html).not.toContain("这是为了");
    expect(html).not.toContain("这里展示");
    expect(html).not.toContain("这一页");
    expect(html).not.toContain("页面目标");
    expect(html).not.toContain("ASCII");
    expect(html).not.toContain("读者应当");
    expect(html).not.toContain("负责");
    expect(html).not.toContain("Recommended Media");
    expect(html).not.toContain("Core Blocks");
    expect(html).not.toContain("Takeaway");
  });

  test("renders story pages without quiet conclusion panels", () => {
    const html = renderToStaticMarkup(<MethodPage />);

    expect(html).toContain("bg-[#f8f3ea]");
    expect(html).not.toContain("收束判断");
  });

  test("renders block-causal inequality symbols as math text", () => {
    const html = renderToStaticMarkup(<MethodPage />);

    expect(html).toContain("τ");
    expect(html).toContain("≤");
    expect(html).not.toContain("\\tau");
    expect(html).not.toContain("\\le");
  });

  test("renders selected thesis figures as page evidence", () => {
    const methodHtml = renderToStaticMarkup(<MethodPage />);
    const systemsHtml = renderToStaticMarkup(<MemorySystemsPage />);
    const analysisHtml = renderToStaticMarkup(<AnalysisPage />);

    expect(methodHtml).toContain('src="/images/thesis/2-2.png"');
    expect(methodHtml).toContain('src="/images/thesis/2-3.png"');

    expect(systemsHtml).toContain("四种 memory 接入路径");
    expect(systemsHtml).not.toContain('src="/images/thesis/2-5.png"');

    expect(analysisHtml).not.toContain("注意力对比图");
    expect(analysisHtml).not.toContain("注意力随时间步变化");
    expect(analysisHtml).not.toContain(
      "无记忆基线主要关注图像与语言；Comp 加入后，动作专家注意力被记忆前缀截走。",
    );
    expect(analysisHtml).not.toContain(
      "Comp 的记忆注意力在多个时间步保持高占比，说明捷径不是单帧偶然现象。",
    );
    expect(analysisHtml).not.toContain('src="/images/thesis/3-7.png"');
    expect(analysisHtml).not.toContain('src="/images/thesis/3-8.png"');
  });

  test("omits attention evidence figures from the analysis page", () => {
    const html = renderToStaticMarkup(<AnalysisPage />);

    expect(html).not.toContain("注意力对比图");
    expect(html).not.toContain("注意力随时间步变化");
    expect(html).not.toContain(
      "无记忆基线主要关注图像与语言；Comp 加入后，动作专家注意力被记忆前缀截走。",
    );
    expect(html).not.toContain(
      "Comp 的记忆注意力在多个时间步保持高占比，说明捷径不是单帧偶然现象。",
    );
    expect(html).not.toContain('src="/images/thesis/3-7.png"');
    expect(html).not.toContain('src="/images/thesis/3-8.png"');
  });

  test("summarizes the four analysis sections below the page title", () => {
    const html = renderToStaticMarkup(<AnalysisPage />);

    expect(html).toContain("记忆聚合模块的作用");
    expect(html).toContain("长程整合");
    expect(html).toContain("压缩式上下文记忆的注意力捷径");
    expect(html).toContain("连续回合采样 vs 固定窗口采样");
    expect(html).toContain("自适应层归一化记忆对动作的扰动分析");
    expect(html).toContain("自适应层归一化在 VLM 骨干 18 层反复调制");
    expect(html).toContain("font-mono text-5xl");
  });

  test("introduces what the attention distribution and temporal stability figures diagnose", () => {
    const html = renderToStaticMarkup(<AnalysisPage />);

    expect(html).toContain("压缩式上下文记忆的捷径诊断");
    expect(html).toContain("Figure 3-7, 3-8");
    expect(html).not.toContain("注意力分布图回答的是「模型在看哪里」");
    expect(html).not.toContain(
      "时序稳定性图回答的是「这种偏移是不是持续存在」",
    );
  });

  test("omits the analysis key clue highlight block", () => {
    const html = renderToStaticMarkup(<AnalysisPage />);

    expect(html).not.toContain("关键线索");
    expect(html).not.toContain(
      "具有聚合模块 在 SimplerEnv 为 64.6%，去掉聚合层后降到 42.7%。",
    );
    expect(html).not.toContain(
      "RMBench 从 20.0% 降到 0.8%，说明聚合层承担了跨时间步的信息整理与压缩。",
    );
    expect(html).not.toContain(
      "不同融合方式对比中，门控交叉注意力 在稳定性上优于 Norm，在性能上远超 Cache。",
    );
    expect(html).not.toContain(
      "Comp 压缩前缀让记忆占据 89.2% 注意力，形成「压缩式上下文记忆的注意力捷径」，削弱了对当前观测的感知。",
    );
  });

  test("sizes the 自适应层归一化and 门控交叉注意力 architecture image like the aggregation ablation diagram", () => {
    const html = renderToStaticMarkup(<AnalysisPage />);

    expect(html).toContain(
      '<div class="mx-auto max-w-4xl"><img src="/images/thesis/normalization-comparison.jpg"',
    );
  });

  test("places continuous sampling before the attention shortcut on the analysis page", () => {
    const html = renderToStaticMarkup(<AnalysisPage />);

    expect(html.indexOf("连续回合采样 vs 固定窗口采样")).toBeLessThan(
      html.indexOf("压缩式上下文记忆的注意力捷径"),
    );
    expect(
      html.indexOf("为什么「连续回合采样」是记忆注入的关键？"),
    ).toBeLessThan(
      html.indexOf("注意力分布对比"),
    );
  });

  test("explains the baseline VLA path as single-frame, component-shaped, and memory-free", () => {
    const html = renderToStaticMarkup(<WhyMemoryPage />);

    expect(html).toContain("视觉编码器");
    expect(html).toContain("视觉编码器 + LLM");
    expect(html).toContain("动作头");
    expect(html).toContain("第 t-2 帧");
    expect(html).toContain("第 t-1 帧");
    expect(html).toContain("第 t 帧");
    expect(html).toContain("无记忆缓存");
    expect(html).toContain("多帧依次到达，但每次只输入最新一帧。");
    expect(html).toContain("视觉输入");
    expect(html).toContain('src="/images/thesis/vla-input-frame-000.jpg"');
    expect(html).toContain('src="/images/thesis/vla-input-frame-060.jpg"');
    expect(html).toContain('src="/images/thesis/vla-input-frame-120.jpg"');
    expect(html).toContain('alt="nice.mp4 第 0 帧"');
    expect(html).toContain(
      "clip-path:polygon(14% 0, 86% 0, 100% 100%, 0 100%)",
    );
    expect(html).toContain("h-8 w-[58%]");
    expect(html).toContain("items-center justify-center");
    expect(html).toContain(">视觉编码器</div>");
    expect(
      html.match(/clip-path:polygon\(14% 0, 86% 0, 100% 100%, 0 100%\)/g)
        ?.length,
    ).toBe(1);
    expect(
      html.indexOf('src="/images/thesis/vla-input-frame-000.jpg"'),
    ).toBeLessThan(html.indexOf("语言指令"));
    expect(html).toContain("@keyframes piFrameCarousel");
    expect(html).toContain("translateX(28%)");
    expect(html).toContain("animation: piFrameCarousel 9s");
    expect(html).toContain("animation-delay:3s");
    expect(html).toContain("pi-frame-carousel");
    expect(html).toContain("inset-0");
    expect(html).not.toContain("mt-2 grid grid-cols-3 gap-1.5");
    expect(html).toContain("连续动作");
    expect(html).toContain("动作专家");
    expect(html).toContain("噪声");
    expect(html).toContain("overflow-x-auto md:overflow-x-hidden");
    expect(html).toContain("min-w-[630px] md:min-w-0");
    expect(html).toContain("grid-cols-[minmax(0,1fr)_180px]");
    expect(html).toContain("items-start gap-y-1");
    expect(html).toContain("self-end");
    expect(html).toContain("mb-1 text-center font-mono text-xs");
    expect(html).toContain("grid-cols-[220px_150px]");
    expect(html).toContain("h-16 w-[150px]");
    expect(html).toContain("grid-cols-4 gap-1.5");
    expect(html).toContain("h-6 rounded-[0.3rem]");
    expect(html).toContain("whitespace-nowrap");
    expect(html).toContain("h-[12rem]");
    expect(html).toContain("rounded-r-none");
    expect(html).toContain("rounded-l-none border border-l-0");
    expect(html).not.toContain("min-w-[760px]");
    expect(html).not.toContain("min-w-[672px]");
    expect(html).not.toContain("min-w-[586px]");
    expect(html).not.toContain("min-w-[548px]");
    expect(html).not.toContain("grid-cols-[minmax(0,1fr)_42px_180px]");
    expect(html).not.toContain("items-start gap-y-3");
    expect(html).not.toContain("grid-cols-[minmax(0,1fr)_140px]");
    expect(html).not.toContain("grid-cols-[minmax(520px,1fr)_180px]");
    expect(html).not.toContain("grid-cols-[minmax(420px,1fr)_150px]");
    expect(html).not.toContain("grid-cols-[260px_132px]");
    expect(html).not.toContain("grid-cols-[260px_200px]");
    expect(html).not.toContain("h-16 w-[132px]");
    expect(html).not.toContain("h-16 w-[200px]");
    expect(html).not.toContain("mt-[2.25rem]");
    expect(html).not.toContain("rotate-45 border-r border-t");
    expect(html).not.toContain("grid-cols-[220px_minmax(0,1fr)_160px]");
    expect(html).not.toContain("grid-cols-[1.4fr_0.6fr]");
    expect(html).not.toContain("多模态帧流");
    expect(html).not.toContain("低层控制");
    expect(html).not.toContain("post-training");
    expect(html).not.toContain("Pre-trained VLA");
    expect(html).not.toContain("Vision Encoder");
    expect(html).not.toContain("VLA Backbone");
    expect(html).not.toContain("Action Head");
    expect(html).not.toContain("action expert");
    expect(html).not.toContain("continuous actions");
    expect(html).not.toContain("current-frame command");
    expect(html).not.toContain("visual input");
    expect(html).not.toContain("multimodal frame stream");
    expect(html).not.toContain("low-level control");
    expect(html).not.toContain("memory token");
    expect(html).not.toContain(">noise<");
    expect(html).not.toContain("Frame t");
    expect(html).not.toContain("Frame t 图像");
    expect(html).not.toContain("high-level prompt");
    expect(html).not.toContain("subtask prediction");
    expect(html).not.toContain("交换两个方块");
    expect(html).not.toContain("拿起红块");
    expect(html).not.toContain("linear-gradient(135deg,#403830");
    expect(html).not.toContain("linear-gradient(135deg,#524036");
    expect(html).not.toContain("linear-gradient(135deg,#8bb9c3");
  });

  test("shows the VLA architecture limit with a draggable failure video", () => {
    const html = renderToStaticMarkup(<WhyMemoryPage />);

    expect(html).toContain("当前 VLA 架构限制");
    expect(html).toContain("每一步对于VLA都是新的开始");
    expect(html).toContain('src="/videos/failure.mp4"');
    expect(html).toContain("controls=");
    expect(html).toContain("交换方块失败回放");
    expect(html).not.toContain("关键线索");
  });

  test("renders figure titles and concise captions without generic figure labels", () => {
    const html = [
      renderToStaticMarkup(<MethodPage />),
      renderToStaticMarkup(<MemorySystemsPage />),
      renderToStaticMarkup(<AnalysisPage />),
    ].join("");

    expect(html).not.toContain("插图证据");
    expect(html).not.toContain("VLA模型整体框架");
    expect(html).toContain("记忆系统整体架构");
    expect(html).toContain("历史矩阵构建与块级因果注意力掩码");
    expect(html).toContain("门控交叉注意力");
    expect(html).not.toContain("图中区分视觉-语言模型");
    expect(html).toContain("记忆词元提取当前帧信息");
  });

  test("renders memory fusion comparison as HTML structure diagrams", () => {
    const html = renderToStaticMarkup(<MemorySystemsPage />);

    expect(html).toContain("缓存上下文记忆");
    expect(html).toContain("压缩式上下文记忆");
    expect(html).toContain("自适应层归一化");
    expect(html).toContain("门控交叉注意力");
    expect(html).toContain("记忆缓存库");
    expect(html).toContain("拼接记忆缓存");
    expect(html).toContain("视觉语言模型");
    expect(html).toContain("动作专家");
    expect(html).toContain("HistoryCache");
    expect(html).toContain("MemoryModule");
    expect(html).toContain("块级注意力");
    expect(html).toContain("自适应层归一化公式");
    expect(html).toContain("LN(a)");
    expect(html).toContain("多层感知机");
    expect(html).toContain("缩放参数");
    expect(html).toContain("平移参数");
    expect(html).toContain("Gated Cross Attention");
    expect(html).toContain("前馈网络");
    expect(html).toContain("交叉注意力");
    expect(html).toContain("查询");
    expect(html).toContain("键值");
    expect(html).toContain("Memory Tokens");
    expect(html).not.toContain('src="/images/thesis/cache-context-memory.jpg"');
    expect(html).not.toContain(
      'src="/images/thesis/compressed-context-memory.jpg"',
    );
    expect(html).not.toContain(
      'src="/images/thesis/adaptive-normalization.jpg"',
    );
    expect(html).not.toContain(
      'src="/images/thesis/gated-cross-attention.jpg"',
    );
    expect(html).not.toContain('src="/images/thesis/2-5.png"');
  });

  test("keeps supporting figures compact while pairing the architecture figure with key clues", () => {
    const html = renderToStaticMarkup(<MethodPage />);

    expect(html).toContain(
      "lg:grid-cols-[minmax(0,0.72fr)_minmax(18rem,0.28fr)]",
    );
    expect(html).toContain("block h-auto w-full object-contain");
    expect(html).toContain("max-h-[300px]");
    expect(html).not.toContain("max-w-5xl");
    expect(html).not.toContain("max-h-[520px]");
    expect(html).not.toContain("max-h-[560px]");
    expect(html).not.toContain("max-h-[420px]");
  });

  test("places supporting method figures side by side instead of stacking all figures", () => {
    const html = renderToStaticMarkup(<MethodPage />);

    expect(html).toContain("lg:grid-cols-2");
    expect(html).toContain("mx-auto mt-6 grid max-w-6xl gap-4");
    expect(html).toContain(
      "mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-3 text-center",
    );
    expect(html.indexOf("记忆通道的三步流程")).toBeLessThan(
      html.indexOf("记忆系统整体架构"),
    );
    expect(html.indexOf("记忆系统整体架构")).toBeLessThan(
      html.indexOf("关键线索"),
    );
    expect(html.indexOf("关键线索")).toBeLessThan(
      html.indexOf('src="/images/thesis/2-3.png"'),
    );
    expect(html.indexOf('src="/images/thesis/2-2.png"')).toBeLessThan(
      html.indexOf('src="/images/thesis/2-3.png"'),
    );
    expect(html).not.toContain('src="/images/thesis/2-1.png"');
  });

  test("embeds the sampling animation in the method implementation details", () => {
    const html = renderToStaticMarkup(<MethodPage />);

    expect(html).toContain("采样动画重播");
    expect(html).toContain("固定窗口采样动画面板");
    expect(html).toContain("连续回合采样动画面板");
    expect(html).toContain('src="/images/sampling-demo/1.png"');
    expect(html).toContain('src="/images/sampling-demo/5.png"');
  });

  test("constructs the fixed-window training sample on the first tick", async () => {
    vi.useFakeTimers();
    render(<SamplingComparisonAnimation />);

    const fixedPanel = screen.getByLabelText("固定窗口采样动画面板");

    expect(within(fixedPanel).queryByText("[f1, f2, f3, f4]")).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1150);
    });

    expect(within(fixedPanel).queryByText("[f1, f2, f3, f4]")).not.toBeNull();
  });

  test("selects all four fixed-window frames together on the first tick", async () => {
    vi.useFakeTimers();
    render(<SamplingComparisonAnimation />);

    const fixedPanel = screen.getByLabelText("固定窗口采样动画面板");

    expect(
      within(fixedPanel)
        .getByAltText("f1 采样视频帧")
        .parentElement?.className.includes("opacity-25"),
    ).toBe(true);
    expect(
      within(fixedPanel)
        .getByAltText("f4 采样视频帧")
        .parentElement?.className.includes("opacity-25"),
    ).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1150);
    });

    for (const frame of ["f1", "f2", "f3", "f4"]) {
      expect(
        within(fixedPanel)
          .getByAltText(`${frame} 采样视频帧`)
          .parentElement?.className.includes("opacity-100"),
      ).toBe(true);
    }
  });

  test("finishes the fixed-window outside-frame state on the second tick", async () => {
    vi.useFakeTimers();
    render(<SamplingComparisonAnimation />);

    const fixedPanel = screen.getByLabelText("固定窗口采样动画面板");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1150);
    });

    expect(within(fixedPanel).queryByText("窗口外帧不参与")).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1150);
    });

    expect(within(fixedPanel).queryByText("窗口外帧不参与")).not.toBeNull();
    expect(
      within(fixedPanel)
        .getByAltText("f5 采样视频帧")
        .parentElement?.className.includes("opacity-35"),
    ).toBe(true);
  });

  test("stops the sampling animation on the final state until replay", async () => {
    vi.useFakeTimers();
    render(<SamplingComparisonAnimation />);

    for (let tick = 0; tick < 8; tick += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1150);
      });
    }

    expect(
      within(screen.getByLabelText("连续回合采样动画面板")).queryByText(
        "[f2, f3, f4, f5]",
      ),
    ).not.toBeNull();
    expect(screen.queryByText("等待首帧")).toBeNull();
  });

  test("renders storyboard posters and platform thumbnails from the design spec", () => {
    const methodHtml = renderToStaticMarkup(<MethodPage />);
    const systemsHtml = renderToStaticMarkup(<MemorySystemsPage />);
    const resultsHtml = renderToStaticMarkup(<ResultsPage />);
    const analysisHtml = renderToStaticMarkup(<AnalysisPage />);
    const conclusionHtml = renderToStaticMarkup(<ConclusionPage />);
    const whyHtml = renderToStaticMarkup(<WhyMemoryPage />);

    expect(whyHtml).not.toContain("一体化平台入口");
    expect(whyHtml).not.toContain("收束判断");

    expect(methodHtml).toContain(
      'src="/images/thesis/platform-training-memory.png"',
    );
    expect(systemsHtml).toContain('src="/images/thesis/platform-baseline.png"');
    expect(resultsHtml).toContain(
      'src="/images/thesis/platform-replay-simpler.png"',
    );
    expect(analysisHtml).toContain(
      'src="/images/thesis/platform-config-summary.png"',
    );
    expect(conclusionHtml).toContain(
      'src="/images/thesis/platform-overview.png"',
    );

    expect(resultsHtml).toContain(
      'poster="/images/thesis/video_storyboards/simpler_spoon_storyboard.png"',
    );
    expect(resultsHtml).toContain(
      'poster="/images/thesis/video_storyboards/rmbench_nice_storyboard.png"',
    );
    expect(analysisHtml).not.toContain('src="/images/thesis/3-7.png"');
    expect(analysisHtml).not.toContain('src="/images/thesis/3-8.png"');
  });

  test("does not render text-only evidence placeholders without images", () => {
    const html = [
      renderToStaticMarkup(<WhyMemoryPage />),
      renderToStaticMarkup(<MethodPage />),
      renderToStaticMarkup(<MemorySystemsPage />),
      renderToStaticMarkup(<ResultsPage />),
      renderToStaticMarkup(<AnalysisPage />),
      renderToStaticMarkup(<ConclusionPage />),
    ].join("");

    expect(html).not.toContain("画面证据");
    expect(html).not.toContain("整体架构总图");
    expect(html).not.toContain("工具截图轮播");
    expect(html).not.toContain("机制对比图");
    expect(html).not.toContain("论文与代码入口");
  });

  test("renders benchmark results as concrete tables with videos before scores", () => {
    const html = renderToStaticMarkup(<ResultsPage />);

    expect(html).toContain("SimplerEnv WidowX");
    expect(html).toContain("RMBench 双臂交换方块");
    expect(html).toContain('src="/video/simpler/spoon.mp4"');
    expect(html).toContain('src="/video/rmbench/nice.mp4"');
    expect(html).toContain('src="/video/real/episode_000009.mp4"');
    expect(html).toContain('src="/images/thesis/acone-real-task-scene.png"');
    expect(html).toContain('data-acone-rmse-chart="html"');
    expect(html).toContain("均方根误差");
    expect(html).toContain("0.696");
    expect(html).toContain("ACONE 双臂真机 ");
    expect(html).toContain("<table");
    expect(html).toContain("64.6%");
    expect(html).toContain("20.0%");
    expect(html.indexOf('src="/video/rmbench/nice.mp4"')).toBeLessThan(
      html.indexOf("Diffusion Policy"),
    );
    expect(html).not.toContain("数据待补充");
  });

  test("omits the results page key clues summary", () => {
    const html = renderToStaticMarkup(<ResultsPage />);

    expect(html).not.toContain("关键线索");
    expect(html).not.toContain(
      "SimplerEnv WidowX 在抓取、放置、堆叠、入篮四类桌面操作上平均成功率达到 64.6%，超越所有对比方法。",
    );
    expect(html).not.toContain(
      "RMBench Swap Blocks 要求模型持续追踪两个方块的位置与任务进度，本文方法达到 20.0%，分别为 DP 和 π₀.5-LoRA 的 10 倍和 5 倍。",
    );
    expect(html).not.toContain(
      "基于 ACONE 双臂机器人平台手工采集 37 条高质量轨迹，总计 34205 帧，平均每回合约 924.5 帧。",
    );
    expect(html).not.toContain(
      "真机开环评测中 14 维控制自由度中 12 维 RMSE 低于 0.1，仅夹爪开合维度预测误差偏高。",
    );
  });

  test("renders SimplerEnv success charts without the old average table", () => {
    const html = renderToStaticMarkup(<ResultsPage />);

    expect(html).toContain("将勺子放到毛巾上成功率 (%)");
    expect(html).toContain("将胡萝卜放到盘子上成功率 (%)");
    expect(html).toContain("将绿色方块放到黄色方块上成功率 (%)");
    expect(html).toContain("将茄子放进黄色篮子里成功率 (%)");
    expect(html).toContain("四任务平均成功率 (%)");
    expect(html).not.toContain(
      '<h2 class="text-xl font-semibold text-[#2a211c]">四任务平均成功率对比</h2>',
    );
  });

  test("autoplays benchmark demonstration videos", () => {
    const html = renderToStaticMarkup(<ResultsPage />);

    for (const src of [
      "/video/simpler/spoon.mp4",
      "/video/simpler/carrot.mp4",
      "/video/simpler/cube.mp4",
      "/video/simpler/eggplant.mp4",
      "/video/rmbench/nice.mp4",
    ]) {
      const videoStart = html.indexOf(`<video src="${src}"`);
      const videoMarkup = html.slice(
        videoStart,
        html.indexOf("</video>", videoStart),
      );

      expect(videoMarkup).toContain('autoPlay=""');
      expect(videoMarkup).toContain('muted=""');
      expect(videoMarkup).toContain('loop=""');
      expect(videoMarkup).toContain('playsInline=""');
    }
  });

  test("renders platform links across story pages with loading states", () => {
    render(<MethodPage />);

    const link = screen.getByRole("link", { name: "打开训练配置" });
    expect(link.getAttribute("href")).toBe("/evaluation/training");

    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);

    expect(
      screen
        .getByRole("link", { name: "正在打开训练配置" })
        .getAttribute("aria-busy"),
    ).toBe("true");
  });
});
