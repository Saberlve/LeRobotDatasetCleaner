// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("evaluation launch page", () => {
  test("renders without loading the evaluation dashboard summary", async () => {
    vi.doMock("@/server/eval-results/summary", () => ({
      loadEvaluationDashboard: vi.fn(async () => {
        throw new Error("launch route should not load evaluation dashboard");
      }),
    }));

    const { default: EvaluationLaunchPage } = await import(
      "@/app/evaluation/launch/page"
    );

    const page = await EvaluationLaunchPage();
    const html = renderToStaticMarkup(page);

    expect(html).toContain("常驻模型服务");
    expect(html).toContain("启动评测");
    expect(html).toContain('data-launch-row="controls"');
  });
});
