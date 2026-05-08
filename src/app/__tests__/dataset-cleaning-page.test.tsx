// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: navigation.push,
  }),
  useSearchParams: () => new URLSearchParams(),
}));

import DatasetCleaningPage from "@/app/dataset-cleaning/page";
import { ThesisSiteShell } from "@/components/thesis/site-shell";

describe("dataset cleaning page", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    navigation.push.mockReset();
  });

  test("is not linked from the global thesis navigation", () => {
    const html = renderToStaticMarkup(
      <ThesisSiteShell>
        <main />
      </ThesisSiteShell>,
    );

    expect(html).not.toContain('href="/dataset-cleaning"');
  });

  test("restores the local dataset cleaning entrypoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ entries: [] }))),
    );

    render(<DatasetCleaningPage />);

    expect(
      await screen.findByRole("heading", { name: "数据清洗工具" }),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "打开数据集" })).toBeDefined();
    expect(
      screen.getByRole("button", { name: "选择本地文件夹" }),
    ).toBeDefined();
    expect(
      screen
        .getByRole("link", { name: "浏览 LeRobot 列表" })
        .getAttribute("href"),
    ).toBe("/explore");
  });
});
