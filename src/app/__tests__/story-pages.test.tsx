// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

import WhyMemoryPage from "@/app/why-memory/page";
import MethodPage from "@/app/method/page";
import MemorySystemsPage from "@/app/memory-systems/page";
import DatasetAndToolingPage from "@/app/dataset-and-tooling/page";
import ResultsPage from "@/app/results/page";
import AnalysisPage from "@/app/analysis/page";
import ConclusionPage from "@/app/conclusion/page";

describe("story pages", () => {
  afterEach(() => {
    cleanup();
  });

  test("renders independent thesis routes with shared navigation", () => {
    const pages = [
      renderToStaticMarkup(<WhyMemoryPage />),
      renderToStaticMarkup(<MethodPage />),
      renderToStaticMarkup(<MemorySystemsPage />),
      renderToStaticMarkup(<DatasetAndToolingPage />),
      renderToStaticMarkup(<ResultsPage />),
      renderToStaticMarkup(<AnalysisPage />),
      renderToStaticMarkup(<ConclusionPage />),
    ];

    expect(pages[0]).toContain("让机器人取杯倒水，它会忘记自己刚开过柜门。");
    expect(pages[1]).toContain("把“记忆”拆成一个三阶段流水线");
    expect(pages[2]).toContain("为了找到最好的方案，我们把四条路全走了一遍。");
    expect(pages[3]).toContain("写代码之前，我们先建了一个数据清洗网页应用。");
    expect(pages[3]).toContain("打开数据清洗工具");
    expect(pages[3]).toContain(
      'href="/local/pick_X_times_filterd_twice/episode_0"',
    );
    expect(pages[3].indexOf("故事推进")).toBeLessThan(
      pages[3].indexOf('href="/local/pick_X_times_filterd_twice/episode_0"'),
    );
    expect(pages[3]).toContain('src="/images/thesis/3-3.png"');
    expect(pages[3]).not.toContain('href="/dataset-cleaning"');
    expect(pages[4]).toContain("在三个平台上，我们分别问了三个不同的问题。");
    expect(pages[5]).toContain(
      "Comp 在平均分上接近 GCA，但它有一个根本性缺陷。",
    );
    expect(pages[6]).toContain("做了什么，没做完什么，下一步去哪。");

    for (const html of pages) {
      expect(html).toContain('href="/why-memory"');
      expect(html).toContain('href="/conclusion"');
      expect(html).toContain('href="/evaluation"');
      expect(html).toContain("进入评测平台");
      expect(html.includes("下一页") || html.includes("返回首页")).toBe(true);
    }

    for (const html of [
      pages[0],
      pages[1],
      pages[2],
      pages[4],
      pages[5],
      pages[6],
    ]) {
      expect(html).not.toContain('href="/dataset-cleaning"');
    }
  });

  test("uses audience-facing narrative copy instead of implementation notes", () => {
    const html = [
      renderToStaticMarkup(<WhyMemoryPage />),
      renderToStaticMarkup(<MethodPage />),
      renderToStaticMarkup(<MemorySystemsPage />),
      renderToStaticMarkup(<DatasetAndToolingPage />),
      renderToStaticMarkup(<ResultsPage />),
      renderToStaticMarkup(<AnalysisPage />),
      renderToStaticMarkup(<ConclusionPage />),
    ].join("");

    expect(html).not.toContain("这一页");
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
    expect(html).toContain("故事推进");
    expect(html).toContain("留下的结论");
    expect(html).toContain("rounded-[2rem]");
  });

  test("renders selected thesis figures as page evidence", () => {
    const methodHtml = renderToStaticMarkup(<MethodPage />);
    const systemsHtml = renderToStaticMarkup(<MemorySystemsPage />);
    const datasetHtml = renderToStaticMarkup(<DatasetAndToolingPage />);

    expect(methodHtml).toContain('src="/images/thesis/2-1.png"');
    expect(methodHtml).toContain('src="/images/thesis/2-2.png"');
    expect(methodHtml).toContain('src="/images/thesis/2-3.png"');

    expect(systemsHtml).toContain('src="/images/thesis/2-5.png"');

    expect(datasetHtml).toContain('src="/images/thesis/3-3.png"');
  });

  test("renders figure titles and concise captions without generic figure labels", () => {
    const html = [
      renderToStaticMarkup(<MethodPage />),
      renderToStaticMarkup(<MemorySystemsPage />),
      renderToStaticMarkup(<DatasetAndToolingPage />),
    ].join("");

    expect(html).not.toContain("插图证据");
    expect(html).toContain("VLA模型整体框架");
    expect(html).toContain("记忆系统整体架构");
    expect(html).toContain("历史矩阵构建与块级因果注意力掩码");
    expect(html).toContain("三种记忆融合方式结构对比");
    expect(html).toContain("Acone双臂机器人平台");
    expect(html).toContain("图中区分视觉-语言模型");
    expect(html).toContain("记忆词元提取当前帧信息");
    expect(html).toContain("Acone 平台包含两条七自由度机械臂");
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
    expect(html.indexOf('src="/images/thesis/2-1.png"')).toBeLessThan(
      html.indexOf('src="/images/thesis/2-3.png"'),
    );
  });

  test("does not render text-only evidence placeholders without images", () => {
    const html = [
      renderToStaticMarkup(<WhyMemoryPage />),
      renderToStaticMarkup(<MethodPage />),
      renderToStaticMarkup(<MemorySystemsPage />),
      renderToStaticMarkup(<DatasetAndToolingPage />),
      renderToStaticMarkup(<ResultsPage />),
      renderToStaticMarkup(<AnalysisPage />),
      renderToStaticMarkup(<ConclusionPage />),
    ].join("");

    expect(html).not.toContain("画面证据");
    expect(html).not.toContain("整体架构总图");
    expect(html).not.toContain("工具截图轮播");
    expect(html).not.toContain("结果表与柱状图");
    expect(html).not.toContain("机制对比图");
    expect(html).not.toContain("论文与代码入口");
  });

  test("renders benchmark results as html tables with reserved data slots", () => {
    const html = renderToStaticMarkup(<ResultsPage />);

    expect(html).toContain("SimplerEnv Benchmark");
    expect(html).toContain("RMBench Benchmark");
    expect(html).toContain("<table");
    expect(html).toContain("数据待补充");
    expect(html).not.toContain("3-6_dim_rmse_bar.png");
    expect(html).not.toContain("3-7.png");
    expect(html).not.toContain("3-8.png");
  });

  test("shows a loading state when opening the data cleaning project", () => {
    render(<DatasetAndToolingPage />);

    const link = screen.getByRole("link", { name: "打开数据清洗工具" });
    expect(link.getAttribute("href")).toBe(
      "/local/pick_X_times_filterd_twice/episode_0",
    );

    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);

    expect(
      screen
        .getByRole("link", { name: "正在打开数据清洗工具" })
        .getAttribute("aria-busy"),
    ).toBe("true");
  });
});
