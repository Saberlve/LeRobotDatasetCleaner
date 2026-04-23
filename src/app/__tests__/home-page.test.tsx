import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

import Home from "@/app/page";

describe("home page", () => {
  test("renders original search hero plus local import section", () => {
    const html = renderToStaticMarkup(<Home />);

    expect(html).toContain("LeRobot");
    expect(html).toContain("Visualizer");
    expect(html).toContain("打开数据集");
    expect(html).toContain("本地数据集");
    expect(html).toContain("选择本地文件夹");
  });
});
