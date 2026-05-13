import React from "react";

import { MathText } from "./math-text";
import {
  BenchmarkSection,
  PlatformCallout,
  SplitNarrative,
} from "./shared-sections";
import { PageKicker, StoryShell } from "./story-navigation";
import type { StoryPageProps } from "./types";

export function ResultsPage({ page }: StoryPageProps) {
  return (
    <StoryShell page={page}>
      <section className="mx-auto max-w-7xl">
        <PageKicker page={page} label="主结果实验" />
        <div className="mt-7 grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h1 className="text-4xl font-semibold leading-tight tracking-normal text-[#1f1a17] md:text-5xl">
              {page.title}
            </h1>
            <p className="mt-6 text-xl leading-9 text-[#3a3029]">
              <MathText text={page.hook} />
            </p>
          </div>
          <p className="border-y border-[#d8ccbb] py-6 text-base leading-8 text-[#665c52]">
            <MathText text={page.summary} />
          </p>
        </div>
      </section>

      <div className="mx-auto mt-10 grid max-w-7xl gap-8">
        {page.benchmarkSections?.map((section) => (
          <BenchmarkSection key={section.name} section={section} />
        ))}
      </div>

      <section className="mx-auto mt-8 max-w-7xl rounded-[1.5rem] border border-[#d8ccbb] bg-[#fffaf4] p-5">
        <p className="text-sm font-medium text-[#c15f3c]">
          ACONE 双臂真机 · 迁移性快报
        </p>
        <p className="mt-4 text-xl font-semibold leading-9 text-[#2a211c]">
          14 维关节中 12 维 RMSE &lt; 0.1，仅夹爪开合维度仍有改进空间。
        </p>
      </section>

      <SplitNarrative page={page} label="关键线索" />
      <PlatformCallout platform={page.platform} />
    </StoryShell>
  );
}
