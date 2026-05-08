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
    expect(
      pages[3].indexOf('href="/local/pick_X_times_filterd_twice/episode_0"'),
    ).toBeLessThan(pages[3].indexOf("画面证据"));
    expect(pages[3]).not.toContain('href="/dataset-cleaning"');
    );
    expect(pages[4]).toContain("在三个平台上，我们分别问了三个不同的问题。");
    expect(pages[5]).toContain(
      "Comp 在平均分上接近 GCA，但它有一个根本性缺陷。",
    );
    expect(pages[6]).toContain("做了什么，没做完什么，下一步去哪。");

    for (const html of pages) {
      expect(html).toContain('href="/why-memory"');
      expect(html).toContain('href="/conclusion"');
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
    expect(html).toContain("画面证据");
    expect(html).toContain("留下的结论");
    expect(html).toContain("rounded-[2rem]");
  });

  test("shows a loading state when opening the data cleaning project", () => {
    render(<DatasetAndToolingPage />);

    const link = screen.getByRole("link", { name: "打开数据清洗工具" });
    expect(link.getAttribute("href")).toBe(
      "/local/pick_X_times_filterd_twice/episode_0",
    );

    fireEvent.click(link);

    expect(
      screen.getByRole("link", { name: "正在打开数据清洗工具" }),
    ).toHaveAttribute("aria-busy", "true");
  });
});
