import React from "react";

import { AblationAggregationChart } from "@/components/thesis/ablation-charts";
import {
  AttentionDistributionChart,
  AttentionOverTimeChart,
} from "@/components/thesis/attention-charts";
import {
  GateGradNormChart,
  GateValueChart,
} from "@/components/thesis/gate-analysis-charts";
import { ModulationAnalysisCharts } from "@/components/thesis/modulation-charts";

import {
  BenchmarkTables,
  FigureEvidence,
  PlatformCallout,
} from "./shared-sections";
import { PageKicker, StoryShell } from "./story-navigation";
import type { StoryPageProps } from "./types";

const analysisOverviewItems = [
  {
    number: "01",
    title: "记忆聚合模块的作用",
    text: "记忆聚合模块融合历史信息，去掉后任务成功率显著下降。",
  },
  {
    number: "02",
    title: "连续回合采样的重要性",
    text: "连续回合采样能够缩小训练和推理的差异，让记忆门控逐步打开；固定窗口采样会让记忆门控梯度消失。",
  },
  {
    number: "03",
    title: "上下文记忆的注意力捷径",
    text: "压缩式上下文令动作专家更关注高层抽象的记忆特征，反而削弱了对当前观测的感知。",
  },
  {
    number: "04",
    title: "归一化调制的扰动强度分析",
    text: "自适应层归一化的全路径干预具有高扰动强度，会系统性扰动 VLM 表示空间；而 门控交叉注意力 通过解耦注入位置，确保了预训练特征的稳定性。",
  },
];

export function AnalysisPage({ page }: StoryPageProps) {
  const ablationTable = page.benchmarkTables?.find((t) =>
    t.title.includes("消融实验：记忆聚合模块的作用"),
  );
  const otherTables = page.benchmarkTables?.filter(
    (t) => !t.title.includes("消融实验：记忆聚合模块的作用"),
  );

  return (
    <StoryShell page={page}>
      <section className="mx-auto max-w-7xl pb-4 pt-8">
        <PageKicker page={page} label="机制剖析" />
        <div className="mt-6 border-b border-[#d8ccbb] pb-8">
          <h1 className="text-4xl font-semibold leading-tight tracking-normal text-[#1f1a17] md:text-5xl md:leading-[1.1]">
            {page.title}
          </h1>
        </div>
        <div className="mt-6">
          <div className="grid md:grid-cols-2 lg:grid-cols-4">
            {analysisOverviewItems.map((item, index) => (
              <article
                key={item.number}
                className={[
                  "py-4 md:px-6",
                  index % 2 === 1 ? "md:border-l md:border-[#d8ccbb]" : "",
                  index > 0 ? "lg:border-l lg:border-[#d8ccbb]" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className="flex items-start gap-5">
                  <span className="shrink-0 font-mono text-5xl font-semibold leading-none text-[#c15f3c]">
                    {item.number}
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-[#2a211c]">
                      {item.title}
                    </h2>
                    <p className="mt-4 text-sm leading-7 text-[#665c52]">
                      {item.text}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto mt-6 max-w-7xl border-t border-[#d8ccbb] pt-6">
        {ablationTable && (
          <article className="mb-12 overflow-hidden rounded-2xl border border-[#e8e0d5] bg-[#fffcf8] shadow-sm ring-1 ring-[#2c2421]/5">
            <div className="px-8 py-6">
              <h2 className="text-xl font-semibold text-[#2a211c]">
                {ablationTable.title}
              </h2>
              <p className="mt-2 text-sm leading-7 text-[#665c52]">
                {ablationTable.caption}
              </p>
            </div>
            <div className="border-t border-[#e8e0d5] bg-[#fffaf4] p-8">
              <div className="mb-12 overflow-hidden rounded-xl border border-[#d8ccbb] bg-white shadow-sm">
                <div className="border-b border-[#f0e8dc] bg-[#f8f3ea]/50 px-6 py-3 flex justify-between items-center">
                  <h4 className="text-sm font-bold text-[#2a211c]">
                    去除记忆聚合模块的流程示意图
                  </h4>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-[#a89a8b]">
                    Ablation Architecture
                  </span>
                </div>
                <div className="p-8">
                  <div className="mx-auto max-w-4xl">
                    <img
                      src="/images/thesis/remove_mm.jpg"
                      alt="Removed Aggregation Module Architecture"
                      className="w-full object-contain"
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-8 pt-4 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="flex flex-col rounded-xl border border-[#e8e0d5] bg-white p-6 shadow-sm">
                  <h4 className="mb-2 text-sm font-bold text-[#2a211c]">
                    五项仿真任务平均成功率对比 (%)
                  </h4>
                  <p className="mb-6 text-xs leading-5 text-[#8a7e72]">
                    下图展示了聚合模块对整体性能的贡献。在几乎所有任务中，缺失该模块都会导致模型性能出现断崖式下跌，证明了记忆特征映射的必要性。
                  </p>
                  <div className="flex-1">
                    <AblationAggregationChart />
                  </div>
                </div>
                <div className="flex flex-col rounded-xl border border-[#e8ccba] bg-[#fdf5f0] p-8">
                  <h4 className="text-lg font-bold text-[#c15f3c]">
                    为什么去掉聚合模块会导致性能下降？
                  </h4>
                  <div className="mt-6 flex-1 text-sm leading-6 text-[#8a5d4b]">
                    <p>记忆聚合做了两件事：</p>
                    <p className="mt-2 font-semibold text-[#2a211c]">
                      1. 把分散的历史词元融合成记忆
                    </p>
                    <p className="mt-1 font-semibold text-[#2a211c]">
                      2. 把融合后的记忆映射到动作专家熟悉的特征空间
                    </p>
                    <p className="mt-4">
                      去掉它之后，整合历史的工作就需要动作专家承担。但动作专家在预训练时只学过用当前观测做动作去噪，没见过历史信息该怎么用，微调时也很难学到相关知识。
                    </p>
                    <p className="mt-4 font-semibold text-[#c15f3c]">
                      在 RMBench 这类重度依赖历史状态识别的任务上，成功率从 20%
                      跌到 0.8%，几乎丧失了记忆能力。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </article>
        )}
        <BenchmarkTables tables={otherTables} noBorder />
      </section>

      <section className="mx-auto mt-12 max-w-7xl border-t border-[#d8ccbb] pt-8">
        <article className="overflow-hidden rounded-2xl border border-[#e8e0d5] bg-[#fffcf8] shadow-sm ring-1 ring-[#2c2421]/5">
          <div className="px-8 py-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p className="text-sm font-medium text-[#c15f3c]">
                机制剖析 · 采样策略
              </p>
              <p className="font-mono text-[0.6rem] uppercase tracking-widest text-[#a89a8b]">
                Continuous vs Fixed Window
              </p>
            </div>
            <h3 className="mt-4 text-2xl font-bold text-[#2a211c]">
              分析实验：为什么「连续回合采样」是记忆注入的关键？
            </h3>
            <p className="mt-3 text-sm leading-8 text-[#665c52]">
              在常规固定窗口采样下，模型在每个训练步面对的是孤立的固定长度片段，记忆状态在片段间被重置，拉大了训练和推理的不一致性。而连续回合采样通过在在一个batch内构建滑动窗口式的样本，缩小了这一不一致性，并使得记忆门控逐渐开放，形成了更稳健的记忆利用策略。
            </p>
          </div>
          <div className="border-t border-[#e8e0d5] bg-[#fffaf4] p-8">
            <div className="grid gap-8 lg:grid-cols-2">
              <div className="flex flex-col rounded-xl border border-[#e8e0d5] bg-white p-6 shadow-sm">
                <h4 className="mb-2 text-sm font-bold text-[#2a211c]">
                  门控系数平均值随训练步数变化
                </h4>
                <p className="mb-6 text-xs leading-5 text-[#8a7e72]">
                  观察门控系数的演变曲线，可以看到连续回合采样如何让模型从“拒绝记忆”转向“主动利用记忆”。
                </p>
                <div className="flex-1">
                  <GateValueChart />
                </div>
                <p className="mt-4 text-xs leading-6 text-[#8a7e72]">
                  连续回合采样下的
                  门控系数逐渐增大，表明模型正在主动利用历史信息；而固定窗口方案的门控系数长期处于极低值。
                </p>
              </div>
              <div className="flex flex-col rounded-xl border border-[#e8e0d5] bg-white p-6 shadow-sm">
                <h4 className="mb-2 text-sm font-bold text-[#2a211c]">
                  梯度范数分析：打破「记忆梯度消失」
                </h4>
                <p className="mb-6 text-xs leading-5 text-[#8a7e72]">
                  下图对比了两种采样方案下的梯度稳定性。固定窗口会导致严重的梯度消失，使记忆分支无法获得有效更新。
                </p>
                <div className="flex-1">
                  <GateGradNormChart />
                </div>
                <p className="mt-4 text-xs leading-6 text-[#8a7e72]">
                  在固定窗口采样下，由于片段间状态被截断，梯度范数迅速衰减，模型无法学习如何有效利用长期记忆。
                </p>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="mx-auto mt-12 max-w-7xl border-t border-[#d8ccbb] pt-8">
        <div className="mb-8">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="text-sm font-medium text-[#c15f3c]">
              机制剖析 · 压缩式上下文记忆的捷径诊断
            </p>
            <p className="font-mono text-[0.6rem] uppercase tracking-widest text-[#a89a8b]">
              Figure 3-7, 3-8
            </p>
          </div>
          <h3 className="mt-4 text-2xl font-bold text-[#2a211c]">
            压缩式上下文的注意力捷径：模型过度依赖压缩记忆，削弱对当前观测的感知
          </h3>
          <p className="mt-4 text-sm leading-8 text-[#665c52]">
            压缩式上下文记忆通过拼接上下文把历史信息注入模型，但这种方法相当于是凭借了低层嵌入和高层特征，形成了一条直接读取历史信息的捷径，导致模型过度依赖记忆特征，忽视了当前观测。
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <article className="flex flex-col rounded-2xl border border-[#e8e0d5] bg-[#fffcf8] p-8 shadow-sm ring-1 ring-[#2c2421]/5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p className="text-sm font-medium text-[#c15f3c]">
                机制剖析 · 注意力分布
              </p>
              <p className="font-mono text-[0.6rem] uppercase tracking-widest text-[#a89a8b]">
                Figure 3-7
              </p>
            </div>
            <h3 className="mt-4 text-xl font-bold text-[#2a211c]">
              注意力分布对比
            </h3>
            <p className="mt-3 text-sm leading-7 text-[#665c52]">
              下图量化了动作专家对不同词元的关注权重。可以看到，压缩式方案导致了视觉权重的显著流失。
            </p>
            <div className="mt-8 flex-1">
              <AttentionDistributionChart />
            </div>
          </article>

          <article className="flex flex-col rounded-2xl border border-[#e8e0d5] bg-[#fffcf8] p-8 shadow-sm ring-1 ring-[#2c2421]/5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p className="text-sm font-medium text-[#c15f3c]">
                机制剖析 · 时序稳定性
              </p>
              <p className="font-mono text-[0.6rem] uppercase tracking-widest text-[#a89a8b]">
                Figure 3-8
              </p>
            </div>
            <h3 className="mt-4 text-xl font-bold text-[#2a211c]">
              捷径现象在整个回合中持续存在
            </h3>
            <p className="mt-3 text-sm leading-7 text-[#665c52]">
              在整个任务回合中，这种过度依赖记忆的“捷径”表现出极高的稳定性，形成了一种结构性的注意力偏移。
            </p>
            <div className="mt-8 flex-1">
              <AttentionOverTimeChart />
            </div>
          </article>
        </div>
      </section>

      <section className="mx-auto mt-12 max-w-7xl border-t border-[#d8ccbb] pt-8">
        <div className="mb-8">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="text-sm font-medium text-[#c15f3c]">
              机制剖析 · 自适应层归一化记忆对动作的扰动分析
            </p>
            <p className="font-mono text-[0.6rem] uppercase tracking-widest text-[#a89a8b]">
              Figure 3-12, 3-13, 3-14
            </p>
          </div>
          <h3 className="mt-4 text-2xl font-bold text-[#2a211c]">
            分析实验：自适应层归一化调制对动作分布的扰动
          </h3>
          <p className="mt-4 text-sm leading-8 text-[#665c52]">
            自适应层归一化记忆的性能下降，根源在于其
            <strong className="text-[#2a211c]">过度扰动了动作分布</strong>。
          </p>
        </div>

        {/* Structural comparison */}
        <div className="mb-12 overflow-hidden rounded-2xl border border-[#e8e0d5] bg-white shadow-sm transition-all hover:shadow-md">
          <div className="p-8">
            <div className="mx-auto max-w-4xl">
              <img
                src="/images/thesis/normalization-comparison.jpg"
                alt="自适应层归一化vs 门控交叉注意力 Architecture Comparison"
                className="w-full object-contain"
              />
            </div>
          </div>
        </div>

        <div className="mb-6">
          <h4 className="text-lg font-bold text-[#2a211c]">
            记忆注入强度的定量分析
          </h4>
          <p className="mt-2 text-sm leading-7 text-[#665c52]">
            为了公平地对比扰动强度，本课题对两种机制定义了统一的测量指标：
            <strong className="text-[#2a211c]">
              调制贡献比例 ρ<sub>mod</sub>
            </strong>
            。该指标反映了记忆信号对模型原始表征空间的干预程度。
          </p>
          <div className="my-6 overflow-hidden rounded-xl border border-[#e8e0d5] bg-[#f8f3ea]">
            <div className="flex flex-col items-center justify-center border-b border-[#e8e0d5] py-6 text-center">
              <div className="font-mono text-2xl font-bold text-[#c15f3c]">
                ρ<sub>mod</sub> = ‖Δh<sub>mod</sub>‖ / ‖Δh‖
              </div>
              <p className="mt-2 text-xs text-[#8a7e72]">
                （其中 ‖Δh<sub>mod</sub>‖ 是注入机制引入的状态变化量，‖Δh‖
                是该层隐藏状态的总规模）
              </p>
            </div>
            <div className="grid gap-px bg-[#e8e0d5] lg:grid-cols-2">
              <div className="bg-[#fcfaf7] p-5">
                <p className="text-sm font-bold text-[#2a211c]">
                  对于 自适应层归一化调制：
                </p>
                <p className="mt-2 text-xs leading-6 text-[#8a7e72]">
                  Δh<sub>mod</sub>{" "}
                  为仿射变换引入的偏移。由于调制作用于所有通道且逐层叠加，ρ
                  <sub>mod</sub> 极易在深层累积并突破阈值。
                </p>
              </div>
              <div className="bg-[#fcfaf7] p-5">
                <p className="text-sm font-bold text-[#2a211c]">
                  对于 门控交叉注意力（GCA）：
                </p>
                <p className="mt-2 text-xs leading-6 text-[#8a7e72]">
                  Δh<sub>mod</sub>{" "}
                  为门控记忆残差。得益于解耦的架构和极小的初始门控系数，其 ρ
                  <sub>mod</sub> 始终保持在极低水平。
                </p>
              </div>
            </div>
          </div>
          <p className="text-sm leading-7 text-[#665c52]">
            基于统一的指标，我们可以直接对比不同机制对模型内部状态的干预强度：
          </p>
        </div>

        <ModulationAnalysisCharts />
      </section>

      <FigureEvidence page={page} />
      <PlatformCallout platform={page.platform} />
    </StoryShell>
  );
}
