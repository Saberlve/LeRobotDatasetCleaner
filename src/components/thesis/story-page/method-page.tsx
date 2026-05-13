import React from "react";

import { SamplingComparisonAnimation } from "@/components/thesis/sampling-comparison-animation";

import { MathText } from "./math-text";
import { methodStages } from "./story-data";
import {
  BenchmarkTables,
  BlockCausalMaskDiagram,
  FigureEvidence,
  PlatformCallout,
} from "./shared-sections";
import { PageKicker, StoryShell } from "./story-navigation";
import type { StoryPageProps } from "./types";

export function MethodPage({ page }: StoryPageProps) {
  const [architectureFigure, ...remainingFigures] = page.figures ?? [];
  const stageEnglish = ["Extract", "Aggregate", "Inject"] as const;

  return (
    <StoryShell page={page}>
      <section className="mx-auto max-w-7xl pb-12 pt-8">
        <PageKicker page={page} label="方法结构" />
        <div className="mt-6 border-b border-[#d8ccbb] pb-8">
          <h1 className="text-4xl font-semibold leading-tight tracking-normal text-[#1f1a17] md:text-5xl md:leading-[1.1]">
            {page.title}
          </h1>
        </div>
        <div className="mt-8 grid gap-12 md:grid-cols-[1.2fr_1fr]">
          <p className="text-xl leading-9 text-[#3a3029]">
            <MathText text={page.hook} />
          </p>
          <div className="text-base leading-8 text-[#665c52]">
            <MathText text={page.summary} />
          </div>
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-7xl">
        <div className="rounded-2xl border border-[#e8e0d5] bg-[#fffcf8] p-8 shadow-sm ring-1 ring-[#2c2421]/5">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-end">
            <div>
              <p className="text-sm font-medium text-[#c15f3c]">
                形式化 · 策略建模对比
              </p>
              <h2 className="mt-2 text-2xl font-semibold leading-snug text-[#1f1a17]">
                记忆=巧妙压缩的历史上下文
              </h2>
            </div>
          </div>

          <div className="mx-auto mt-6 grid max-w-6xl gap-4">
            <article className="min-w-0 rounded-[1rem] border border-[#e6dccb] bg-[#fbf4eb] p-4 md:p-5">
              <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-3 text-center">
                <div>
                  <h3 className="text-lg font-semibold text-[#1f1a17]">
                    压缩函数建模
                  </h3>
                  <p className="mt-1 font-mono text-[0.62rem] uppercase tracking-[0.2em] text-[#a89a8b]">
                    From history to memory
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <div className="rounded-[0.85rem] bg-[#f1e5d8] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-[0.16em] text-[#8a7565]">
                      完整交互历史
                    </p>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ead0bf] px-2.5 py-0.5 text-[0.65rem] font-medium text-[#9b3826]">
                      <span aria-hidden="true" className="font-bold">
                        ✕
                      </span>
                      容易上下文爆炸
                    </span>
                  </div>
                  <div className="mt-3 overflow-x-auto pb-1 font-serif text-xl leading-relaxed text-[#3a2e25] md:text-[1.55rem]">
                    <span className="whitespace-nowrap">
                      <span className="italic">H</span>
                      <sub className="text-[0.62em]">t</sub>
                      <span className="mx-2">=</span>
                      <span>(</span>
                      <span className="italic">o</span>
                      <sub className="text-[0.62em]">1</sub>
                      <span>,&thinsp;</span>
                      <span className="italic">o</span>
                      <sub className="text-[0.62em]">2</sub>
                      <span>,&thinsp;…,&thinsp;</span>
                      <span className="italic">o</span>
                      <sub className="text-[0.62em]">t</sub>
                      <span>)</span>
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-[#7a6354]">
                    长度 |<span className="font-serif italic">H</span>
                    <sub className="text-[0.7em]">t</sub>| 随时间步{" "}
                    <span className="font-serif italic">t</span>{" "}
                    线性增长，序列上下文很快超出 VLA 窗口。
                  </p>
                </div>

                <div className="rounded-[0.85rem] border border-[#efcdb8] bg-[#fffaf4] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#c15f3c]">
                      固定长度的压缩历史
                    </p>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fbe2d2] px-2.5 py-0.5 text-[0.65rem] font-medium text-[#c15f3c]">
                      <span aria-hidden="true" className="font-bold">
                        ✓
                      </span>
                      本文采用
                    </span>
                  </div>
                  <div className="mt-3 overflow-x-auto pb-1 font-serif text-xl leading-relaxed text-[#1f1a17] md:text-[1.55rem]">
                    <span className="whitespace-nowrap">
                      <span className="rounded-md bg-[#fbe2d2] px-1.5 py-0.5 italic">
                        m
                      </span>
                      <sub className="text-[0.62em]">t</sub>
                      <span className="mx-2">=</span>
                      <span className="italic">φ</span>
                      <span>(</span>
                      <span className="italic">H</span>
                      <sub className="text-[0.62em]">t</sub>
                      <span>)</span>
                      <span className="mx-2">∈</span>
                      <span>ℝ</span>
                      <sup className="text-[0.62em]">N*D</sup>
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-[#665c52]">
                    通过学习压缩函数{" "}
                    <span className="font-serif italic">φ</span>
                    ，只保留历史上下文中的关键信息，输出固定长度的记忆状态{" "}
                  </p>
                </div>
              </div>
            </article>

            <article className="min-w-0 rounded-[1rem] border border-[#e6dccb] bg-[#fbf4eb] p-4 md:p-5">
              <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-3 text-center">
                <div>
                  <h3 className="text-lg font-semibold text-[#1f1a17]">
                    带有记忆的VLA建模
                  </h3>
                  <p className="mt-1 font-mono text-[0.62rem] uppercase tracking-[0.2em] text-[#a89a8b]">
                    From memory to action
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <div className="rounded-[0.85rem] bg-[#f1e5d8] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-[0.16em] text-[#8a7565]">
                      无记忆
                    </p>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ead0bf] px-2.5 py-0.5 text-[0.65rem] font-medium text-[#9b3826]">
                      <span aria-hidden="true" className="font-bold">
                        ✕
                      </span>
                      历史缺失
                    </span>
                  </div>
                  <div className="mt-3 overflow-x-auto pb-1 font-serif text-[1.55rem] leading-relaxed text-[#3a2e25]">
                    <span className="whitespace-nowrap">
                      <span className="italic">a</span>
                      <sub className="text-[0.62em]">t</sub>
                      <span className="mx-2">∼</span>
                      <span className="italic">π</span>
                      <sub className="text-[0.62em] italic">θ</sub>
                      <span>(·</span>
                      <span className="mx-1.5">|</span>
                      <span className="italic">o</span>
                      <sub className="text-[0.62em]">t</sub>
                      <span>,&thinsp;</span>
                      <span className="italic">ℓ</span>
                      <span>)</span>
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-[#7a6354]">
                    模型只看当前观测{" "}
                    <span className="font-serif italic">o</span>
                    <sub className="text-[0.7em]">t</sub> 与语言指令{" "}
                    <span className="font-serif italic">ℓ</span>
                    ；对于相同画面会给出相同动作。
                  </p>
                </div>

                <div className="rounded-[0.85rem] border border-[#efcdb8] bg-[#fffaf4] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#c15f3c]">
                      带记忆
                    </p>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fbe2d2] px-2.5 py-0.5 text-[0.65rem] font-medium text-[#c15f3c]">
                      <span aria-hidden="true" className="font-bold">
                        ✓
                      </span>
                      本文采用
                    </span>
                  </div>
                  <div className="mt-3 overflow-x-auto pb-1 font-serif text-[1.55rem] leading-relaxed text-[#1f1a17]">
                    <span className="whitespace-nowrap">
                      <span className="italic">a</span>
                      <sub className="text-[0.62em]">t</sub>
                      <span className="mx-2">∼</span>
                      <span className="italic">π</span>
                      <sub className="text-[0.62em] italic">θ</sub>
                      <span>(·</span>
                      <span className="mx-1.5">|</span>
                      <span className="rounded-md bg-[#fbe2d2] px-1.5 py-0.5 italic">
                        m
                      </span>
                      <sub className="text-[0.62em]">t</sub>
                      <span>,&thinsp;</span>
                      <span className="italic">o</span>
                      <sub className="text-[0.62em]">t</sub>
                      <span>,&thinsp;</span>
                      <span className="italic">ℓ</span>
                      <span>)</span>
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-[#665c52]">
                    在观察之外引入压缩记忆{" "}
                    <span className="font-serif italic">m</span>
                    <sub className="text-[0.7em]">t</sub>
                    ；同一画面模型可以根据不同历史产生不同动作。
                  </p>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-7xl">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-sm font-medium text-[#c15f3c]">
            记忆系统的三个关键步骤
          </p>
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.22em] text-[#a89a8b]">
            Extract · Aggregate · Inject
          </p>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {methodStages.map((stage, index) => (
            <article
              key={stage.title}
              className="rounded-2xl bg-[#2a211c] p-8 text-[#f4eee7] shadow-lg ring-1 ring-[#2c2421]/5"
            >
              <div className="flex items-baseline justify-between">
                <p className="font-mono text-xs text-[#f0cbb8]">0{index + 1}</p>
                <p className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-[#a89a8b]">
                  {stageEnglish[index]}
                </p>
              </div>
              <h2 className="mt-6 text-2xl font-semibold text-[#fffaf4]">
                {stage.title}
              </h2>
              <p className="mt-4 text-sm leading-7 text-[#d8ccc0]">
                {stage.detail}
              </p>
            </article>
          ))}
        </div>
      </section>

      {architectureFigure ? (
        <section className="mx-auto mt-12 grid max-w-7xl gap-8 lg:grid-cols-[minmax(0,0.72fr)_minmax(18rem,0.28fr)] lg:items-start">
          <figure className="overflow-hidden rounded-2xl border border-[#e8e0d5] bg-[#fffcf8] shadow-sm ring-1 ring-[#2c2421]/5">
            <div className="flex flex-wrap items-baseline justify-between gap-3 px-8 pt-8">
              <p className="text-sm font-medium text-[#c15f3c]">
                {architectureFigure.title}
              </p>
              <p className="font-mono text-[0.65rem] uppercase tracking-[0.22em] text-[#a89a8b]">
                Architecture
              </p>
            </div>
            {architectureFigure.src ? (
              <div className="mt-6 bg-[#f8f3ea]">
                <img
                  src={architectureFigure.src}
                  alt={architectureFigure.title}
                  className="block h-auto w-full object-contain"
                />
              </div>
            ) : null}
            <figcaption className="border-t border-[#e8e0d5] px-8 py-5">
              <p className="text-sm leading-7 text-[#665c52]">
                {architectureFigure.caption}
              </p>
            </figcaption>
          </figure>

          <aside className="rounded-2xl border border-[#e8e0d5] bg-[#fffcf8] p-8 shadow-sm ring-1 ring-[#2c2421]/5">
            <p className="text-sm font-medium text-[#c15f3c]">系统流程</p>
            <div className="mt-6 grid gap-0">
              {page.highlights.map((item, index) => (
                <article
                  key={item}
                  className="border-t border-[#e8e0d5] py-5 text-sm leading-7 text-[#3a3029]"
                >
                  <span className="mb-2 block text-xs font-semibold text-[#c15f3c]">
                    0{index + 1}
                  </span>
                  {item}
                </article>
              ))}
            </div>
          </aside>
        </section>
      ) : null}

      <section className="mx-auto mt-12 grid max-w-7xl gap-8 lg:grid-cols-2">
        <article className="rounded-2xl border border-[#e8e0d5] bg-[#fffcf8] p-8 shadow-sm ring-1 ring-[#2c2421]/5">
          <p className="text-sm font-medium text-[#c15f3c]">
            实现细节 · 块级因果掩码
          </p>
          <div className="mt-8">
            <BlockCausalMaskDiagram />
          </div>
        </article>
        <article className="rounded-2xl border border-[#e8e0d5] bg-[#fffcf8] p-8 shadow-sm ring-1 ring-[#2c2421]/5">
          <p className="text-sm font-medium text-[#c15f3c]">
            实现细节 · 连续回合采样
          </p>
          <div className="mt-8">
            <SamplingComparisonAnimation />
          </div>
        </article>
      </section>

      <FigureEvidence page={{ ...page, figures: remainingFigures }} />
      <BenchmarkTables tables={page.benchmarkTables} />
      <PlatformCallout platform={page.platform} />
    </StoryShell>
  );
}
