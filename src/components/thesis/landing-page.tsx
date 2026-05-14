import React from "react";
import Image from "next/image";
import {
  thesisHeroVideoSrc,
  thesisMetrics,
  thesisResultPanels,
  thesisSubtitle,
  thesisTitle,
} from "@/content/thesis-site";
import { HeroVideo } from "@/components/thesis/hero-video";

export function LandingPage() {
  // Filter metrics to keep only the 6 requested ones
  const requestedMetricLabels = [
    "SimplerEnv 平均成功率",
    "RMBench Swap Blocks 提升",
    "记忆方案实现并对比",
    "真机数据自采与清洗",
    "自研 URDF 三维数据清洗工具",
    "预训练 VLM 骨干参数",
  ];

  const filteredMetrics = thesisMetrics.filter((m) =>
    requestedMetricLabels.includes(m.label),
  );

  return (
    <main className="relative min-h-screen text-white">
      {/* Global Video Background with DARK overlay */}
      <div className="fixed inset-0 -z-10 overflow-hidden bg-[#1a1512]">
        <HeroVideo src={thesisHeroVideoSrc} playbackRate={0.5} />
        <div className="absolute inset-0 bg-[#1a1512]/75" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#1a1512]/40 to-[#1a1512]/80" />
      </div>

      {/* 1. Header Section */}
      <section className="mx-auto max-w-7xl px-6 pt-32 pb-16">
        <div className="space-y-6">
          <div className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium tracking-wide text-[#f0cbb8] backdrop-blur-sm">
            毕业设计论文展示
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-white md:text-5xl lg:text-6xl">
            {thesisTitle}
          </h1>
          <p className="max-w-3xl text-xl font-medium leading-relaxed text-[#f4eee7]">
            {thesisSubtitle}
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-2 text-sm text-[#e2d7cc]">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white">王树勋</span>
              <span className="opacity-40">|</span>
              <span>导师 郭长勇</span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Unified Evidence & Architecture Row */}
      <section className="border-y border-white/5 bg-white/5 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <div className="grid gap-10 lg:grid-cols-[0.95fr_1.35fr]">
            {/* Left Column: Summary & Metrics */}
            <div className="space-y-8">
              <div className="space-y-3">
                <h2 className="text-xl font-semibold text-[#f4ece2]">
                  结果概览
                </h2>
                <p className="max-w-3xl text-sm leading-relaxed text-[#dcd3cb]">
                  记忆模块在仿真与真机场景均提升了模型性能。
                </p>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-3">
                {filteredMetrics.map((metric) => (
                  <div
                    key={metric.label}
                    className="group flex flex-col justify-between rounded-2xl border border-white/10 bg-white/5 p-3.5 transition-all hover:bg-white/10"
                  >
                    <div>
                      <div className="text-xl font-bold text-white leading-none">
                        {metric.value}
                      </div>
                      <div className="mt-2 text-[10px] font-bold text-[#f0cbb8] uppercase tracking-wider leading-tight">
                        {metric.label}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column: Architecture Diagram */}
            <div className="flex flex-col">
              <div className="flex items-center justify-between px-1 mb-4">
                <h2 className="text-sm font-semibold text-[#f4ece2]">
                  方案架构
                </h2>
              </div>
              <div className="relative aspect-[16/11] w-full overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl">
                <Image
                  src="/images/thesis/2-2.png"
                  alt="Memory System Architecture"
                  fill
                  className="object-contain p-4"
                  priority
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Result Quick Look (Grid) */}
      <section className="bg-transparent">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <div className="flex flex-col gap-2 mb-10">
            <h2 className="text-2xl font-semibold text-[#f4ece2]">结果速览</h2>
            <p className="text-sm text-[#8c8279]">
              基于不同维度的定量与定性证据
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {thesisResultPanels.map((panel) => (
              <div
                key={panel.title}
                className="group rounded-2xl border border-white/10 bg-white/5 p-6 transition-colors hover:bg-white/10 backdrop-blur-sm"
              >
                <h3 className="text-lg font-semibold text-[#f0cbb8]">
                  {panel.title}
                </h3>
                <p className="mt-4 text-sm leading-6 text-[#dcd3cb]">
                  {panel.caption}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mx-auto max-w-7xl px-6 py-12 text-center border-t border-white/5">
        <p className="text-sm text-[#8c8279]">
          © 2026 王树勋 · 机器人记忆增强研究
        </p>
      </footer>
    </main>
  );
}
