// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

import WhyMemoryPage from "@/app/why-memory/page";
import MethodPage from "@/app/method/page";
import MemorySystemsPage from "@/app/memory-systems/page";
import ResultsPage from "@/app/results/page";
import AnalysisPage from "@/app/analysis/page";
import ConclusionPage from "@/app/conclusion/page";
import { thesisNavItems } from "@/content/thesis-site";

describe("story pages", () => {
  afterEach(() => {
    cleanup();
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

    expect(pages[0]).toContain("VLA 机器人为什么 &quot;记不住&quot; 上一帧？");
    expect(pages[1]).toContain("三步走：从一帧像素到一行动作");
    expect(pages[2]).toContain("同一个动机，四种实现：哪种最合理？");
    expect(pages[3]).toContain("SimplerEnv 常规四任务 + RMBench 长程记忆任务");
    expect(pages[4]).toContain("消融 + 注意力捷径分析：为什么 GCA 赢？");
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

  test("renders story pages with polished evidence and conclusion panels", () => {
    const html = renderToStaticMarkup(<MethodPage />);

    expect(html).toContain("bg-[#f8f3ea]");
    expect(html).toContain("bg-[#2a211c]");
    expect(html).toContain("关键线索");
    expect(html).toContain("收束判断");
    expect(html).toContain("rounded-[2rem]");
  });

  test("renders selected thesis figures as page evidence", () => {
    const methodHtml = renderToStaticMarkup(<MethodPage />);
    const systemsHtml = renderToStaticMarkup(<MemorySystemsPage />);
    const analysisHtml = renderToStaticMarkup(<AnalysisPage />);

    expect(methodHtml).toContain('src="/images/thesis/2-1.png"');
    expect(methodHtml).toContain('src="/images/thesis/2-2.png"');
    expect(methodHtml).toContain('src="/images/thesis/2-3.png"');

    expect(systemsHtml).toContain('src="/images/thesis/2-5.png"');

    expect(analysisHtml).toContain("注意力对比图");
    expect(analysisHtml).toContain("注意力随时间步变化");
  });

  test("explains the baseline VLA path as single-frame, component-shaped, and memory-free", () => {
    const html = renderToStaticMarkup(<WhyMemoryPage />);

    expect(html).toContain("视觉编码器");
    expect(html).toContain("LLM / VLA 骨干");
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
    expect(
      html.match(/clip-path:polygon\(14% 0, 86% 0, 100% 100%, 0 100%\)/g)
        ?.length,
    ).toBe(1);
    expect(
      html.indexOf('src="/images/thesis/vla-input-frame-000.jpg"'),
    ).toBeLessThan(html.indexOf("当前帧指令"));
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
    expect(html).toContain("min-w-[586px]");
    expect(html).toContain("grid-cols-[minmax(420px,1fr)_150px]");
    expect(html).toContain("grid-cols-[220px_150px]");
    expect(html).toContain("h-16 w-[150px]");
    expect(html).toContain("mt-[2.25rem]");
    expect(html).toContain("grid-cols-4 gap-1.5");
    expect(html).toContain("h-5 rounded-[0.3rem]");
    expect(html).toContain("whitespace-nowrap");
    expect(html).toContain("h-[10rem]");
    expect(html).not.toContain("min-w-[760px]");
    expect(html).not.toContain("grid-cols-[minmax(0,1fr)_180px]");
    expect(html).not.toContain("grid-cols-[minmax(520px,1fr)_180px]");
    expect(html).not.toContain("grid-cols-[260px_132px]");
    expect(html).not.toContain("grid-cols-[260px_200px]");
    expect(html).not.toContain("h-16 w-[132px]");
    expect(html).not.toContain("h-16 w-[200px]");
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

  test("renders figure titles and concise captions without generic figure labels", () => {
    const html = [
      renderToStaticMarkup(<MethodPage />),
      renderToStaticMarkup(<MemorySystemsPage />),
      renderToStaticMarkup(<AnalysisPage />),
    ].join("");

    expect(html).not.toContain("插图证据");
    expect(html).toContain("VLA模型整体框架");
    expect(html).toContain("记忆系统整体架构");
    expect(html).toContain("历史矩阵构建与块级因果注意力掩码");
    expect(html).toContain("三种记忆融合方式结构对比");
    expect(html).toContain("图中区分视觉-语言模型");
    expect(html).toContain("记忆词元提取当前帧信息");
  });

  test("keeps inserted thesis figures compact", () => {
    const html = renderToStaticMarkup(<MethodPage />);

    expect(html).toContain("max-w-5xl");
    expect(html).toContain("max-h-[360px]");
    expect(html).toContain("max-h-[300px]");
    expect(html).not.toContain("max-h-[560px]");
    expect(html).not.toContain("max-h-[420px]");
  });

  test("places supporting method figures side by side instead of stacking all figures", () => {
    const html = renderToStaticMarkup(<MethodPage />);
    const wideFigureCount = html.match(/lg:col-span-2/g)?.length ?? 0;

    expect(html).toContain("lg:grid-cols-2");
    expect(wideFigureCount).toBe(1);
    expect(html.indexOf('src="/images/thesis/2-3.png"')).toBeLessThan(
      html.indexOf('src="/images/thesis/2-1.png"'),
    );
  });

  test("renders storyboard posters and platform thumbnails from the design spec", () => {
    const methodHtml = renderToStaticMarkup(<MethodPage />);
    const systemsHtml = renderToStaticMarkup(<MemorySystemsPage />);
    const resultsHtml = renderToStaticMarkup(<ResultsPage />);
    const analysisHtml = renderToStaticMarkup(<AnalysisPage />);
    const conclusionHtml = renderToStaticMarkup(<ConclusionPage />);
    const whyHtml = renderToStaticMarkup(<WhyMemoryPage />);

    expect(whyHtml).not.toContain("平台入口");
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
    expect(analysisHtml).toContain('src="/images/thesis/3-7.png"');
    expect(analysisHtml).toContain('src="/images/thesis/3-8.png"');
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
    expect(html).toContain("<table");
    expect(html).toContain("64.6%");
    expect(html).toContain("20.0%");
    expect(html.indexOf('src="/video/simpler/spoon.mp4"')).toBeLessThan(
      html.indexOf("RT-1-X"),
    );
    expect(html).not.toContain("数据待补充");
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
