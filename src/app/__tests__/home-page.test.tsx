// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

import Home from "@/app/page";

describe("home page", () => {
  test("renders the thesis promo landing page instead of the dataset opener", () => {
    const html = renderToStaticMarkup(<Home />);

    expect(html).toContain("面向长程任务的 VLM-VLA 通用记忆系统");
    expect(html).toContain("给 VLA 装上一个轻量、解耦、可插拔的记忆模块");
    expect(html).toContain("64.6%");
    expect(html).toContain("37 条 / 34205 帧");
    expect(html).toContain("背景与研究动机");
    expect(html).toContain("真机平台与数据清洗工具");
    expect(html).not.toContain("打开数据集");
    expect(html).not.toContain("选择本地文件夹");
    expect(html).not.toContain("最近导入");
  });

  test("keeps seven landing entry cards while avoiding the removed story route", () => {
    const html = renderToStaticMarkup(<Home />);

    expect(html).toContain('href="/why-memory"');
    expect(html).toContain('href="/method"');
    expect(html).toContain('href="/memory-systems"');
    expect(html).toContain('href="/results"');
    expect(html).toContain('href="/analysis"');
    expect(html).toContain('href="/conclusion"');
    expect(html).toContain("真机平台与数据清洗工具");
    expect(html).not.toContain('href="/dataset-and-tooling"');
  });

  test("keeps the required video hero and audience-facing evidence copy", () => {
    const html = renderToStaticMarkup(<Home />);

    expect(html).toContain("/videos/nice.mp4");
    expect(html).toContain('data-playback-rate="0.5"');
    expect(html).not.toContain("huggingface.co/datasets");
    expect(html).toContain('preload="auto"');
    expect(html).toContain("radial-gradient(ellipse_at_center");
    expect(html).toContain("成果证据链");
    expect(html).toContain("超越 11 个对比方法");
    expect(html).not.toContain("结果先开口");
    expect(html).not.toContain("主页不再");
    expect(html).not.toContain("数字塞成一墙卡片");
    expect(html).not.toContain("30 秒内看懂工作量和结果");
    expect(html).not.toContain("Key Metrics");
  });

  test("uses a Claude-style research demo visual system", () => {
    const html = renderToStaticMarkup(<Home />);

    expect(html).toContain("bg-[#f8f3ea]");
    expect(html).toContain("bg-[#2a211c]");
    expect(html).toContain("text-[#c15f3c]");
    expect(html).toContain("实际应用演示");
    expect(html).toContain("MemoryVLA Demo");
    expect(html).toContain("当前帧歧义");
    expect(html).toContain("记忆时间轴");
  });
});
