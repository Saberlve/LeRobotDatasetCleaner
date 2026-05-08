// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import EvaluationPage from "@/app/evaluation/page";

describe("evaluation page", () => {
  test("renders the training and evaluation dashboard", async () => {
    const page = await EvaluationPage();
    const html = renderToStaticMarkup(page);

    expect(html).toContain("训练-评测-回放一体化平台");
    expect(html).toContain("Weights &amp; Biases");
    expect(html).not.toContain("外部监控入口");
    expect(html).not.toContain("W&amp;B 项目页需要在新标签页打开");
    expect(html).not.toContain("新标签页查看训练曲线");
    expect(html).not.toContain("<iframe");
    expect(html).toContain("训练超参数配置");
    expect(html).toContain("保存配置");
    expect(html).toContain("pi05_simpler_memory_pytorch_full");
    expect(html).toContain(
      "https://wandb.ai/saberlve9-massachusetts-institute-of-technology/openpi?nw=nwusersaberlve9",
    );
    expect(html).toContain("SimplerEnv");
    expect(html).toContain("SimplerEnv 回放");
    expect(html).toContain("RMBench");
    expect(html).toContain("ACONE");
    expect(html).toContain("pick_X_times_filterd_twice");
  });
});
