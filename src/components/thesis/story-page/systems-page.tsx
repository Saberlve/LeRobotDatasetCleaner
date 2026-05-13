import React from "react";

import { MathText } from "./math-text";
import { MemorySystemComparisonTrack } from "./memory-system-diagrams";
import { PlatformCallout, SplitNarrative } from "./shared-sections";
import { PageKicker, StoryShell } from "./story-navigation";
import type { StoryPageProps } from "./types";

export function SystemsPage({ page }: StoryPageProps) {
  return (
    <StoryShell page={page}>
      <section className="mx-auto max-w-7xl pb-12 pt-8">
        <PageKicker page={page} label="Architectural Comparison" />
        <div className="mt-6 border-b border-[#d8ccbb] pb-8">
          <h1 className="text-4xl font-semibold leading-tight tracking-normal text-[#1f1a17] md:text-5xl md:leading-[1.1]">
            其他记忆系统架构探索
          </h1>
        </div>
        <div className="mt-8 grid gap-12 md:grid-cols-[1.2fr_1fr]">
          <p className="text-xl leading-9 text-[#3a3029]">
            除了门控交叉注意力，本课题还探索了缓存式上下文记忆、压缩式缓存式上下文记忆和自适应归一化记忆这三种不同的架构。
          </p>
          <div className="text-base leading-8 text-[#665c52]">
            针对记忆如何使用这一核心问题，它们分别代表了在模型中注入记忆的不同位置和方式，展示了在长程任务中维持一致性的不同权衡。
          </div>
        </div>

        <div className="mt-12">
          <MemorySystemComparisonTrack />
        </div>
      </section>

      <div className="mt-16 border-t border-[#d8ccbb] pt-12">
        <SplitNarrative page={page} label="Critical Decisions" />
      </div>
      
      <PlatformCallout platform={page.platform} />
    </StoryShell>
  );
}
