import React from "react";

import {
  AttentionDistributionChart,
  AttentionOverTimeChart,
} from "@/components/thesis/attention-charts";

import { MathText } from "./math-text";
import {
  BenchmarkTables,
  FigureEvidence,
  PlatformCallout,
  SplitNarrative,
} from "./shared-sections";
import { PageKicker, StoryShell } from "./story-navigation";
import type { StoryPageProps } from "./types";

export function AnalysisPage({ page }: StoryPageProps) {
  return (
    <StoryShell page={page}>
      <section className="mx-auto max-w-7xl">
        <PageKicker page={page} label="机制剖析" />
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1fr]">
          <div className="border-y border-[#d8ccbb] py-7">
            <h1 className="text-4xl font-semibold leading-tight tracking-normal text-[#1f1a17] md:text-5xl">
              {page.title}
            </h1>
            <p className="mt-6 text-xl leading-9 text-[#3a3029]">
              <MathText text={page.hook} />
            </p>
          </div>
          <div className="border-y border-[#d8ccbb] py-7">
            <p className="text-base leading-8 text-[#665c52]">
              <MathText text={page.summary} />
            </p>
          </div>
        </div>
      </section>

      <BenchmarkTables tables={page.benchmarkTables} />

      <section className="mx-auto mt-12 grid max-w-7xl gap-8 lg:grid-cols-2">
        <article className="rounded-[1.5rem] border border-[#d8ccbb] bg-[#fffaf4] p-6 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="text-sm font-medium text-[#c15f3c]">
              机制剖析 · 注意力分布
            </p>
            <p className="font-mono text-[0.6rem] uppercase tracking-widest text-[#a89a8b]">
              Figure 3-7
            </p>
          </div>
          <h3 className="mt-4 text-xl font-bold text-[#2a211c]">
            注意力捷径：Comp 方案的偏移
          </h3>
          <p className="mt-2 text-sm leading-7 text-[#665c52]">
            将记忆词元放在 VLM
            前缀时，动作专家倾向于直接从中读取压缩后的历史信息，而大幅减少对当前视觉观测的关注。
          </p>
          <div className="mt-8">
            <AttentionDistributionChart />
          </div>
        </article>

        <article className="rounded-[1.5rem] border border-[#d8ccbb] bg-[#fffaf4] p-6 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="text-sm font-medium text-[#c15f3c]">
              机制剖析 · 时序稳定性
            </p>
            <p className="font-mono text-[0.6rem] uppercase tracking-widest text-[#a89a8b]">
              Figure 3-8
            </p>
          </div>
          <h3 className="mt-4 text-xl font-bold text-[#2a211c]">
            捷径现象在整个 Episode 中持续存在
          </h3>
          <p className="mt-2 text-sm leading-7 text-[#665c52]">
            记忆注意力始终稳定在 87% 至
            92%，说明捷径不是单帧偶然现象，而是结构性偏移，会导致模型忽略环境变化。
          </p>
          <div className="mt-8">
            <AttentionOverTimeChart />
          </div>
        </article>
      </section>

      <FigureEvidence page={page} />
      <SplitNarrative page={page} label="关键线索" />
      <PlatformCallout platform={page.platform} />
    </StoryShell>
  );
}
