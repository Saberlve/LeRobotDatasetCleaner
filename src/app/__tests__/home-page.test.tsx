import React from "react";
import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

import Home from "@/app/page";

describe("home page", () => {
  test("renders chinese landing page sections", () => {
    const html = renderToStaticMarkup(<Home />);

    expect(html).toContain("LeRobot 数据集可视化工具");
    expect(html).toContain("远程数据集");
    expect(html).toContain("本地数据集");
    expect(html).toContain("选择本地文件夹");
  });
});
