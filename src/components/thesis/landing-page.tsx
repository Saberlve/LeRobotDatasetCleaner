import React from "react";
import Link from "next/link";

import {
  thesisMetrics,
  thesisHeroVideoSrc,
  thesisNavItems,
  thesisResultPanels,
  thesisSubtitle,
  thesisTitle,
} from "@/content/thesis-site";
import { HeroVideo } from "@/components/thesis/hero-video";

const methodSteps = [
  "当前观察",
  "Memory Tokens",
  "History Aggregator",
  "Gated Cross-Attention",
  "Action Expert",
];

const demoPanels = [
  {
    title: "当前帧歧义",
    caption: "三次拿起小包的画面高度相似，只看当前帧很难判断任务阶段。",
  },
  {
    title: "记忆时间轴",
    caption: "拿起 1、放下、拿起 2、放下、拿起 3 被组织成可追踪历史。",
  },
  {
    title: "动作判断",
    caption: "GCA 读取历史后判断下一步应进入触碰绿色圆环阶段。",
  },
];

export function LandingPage() {
  const primaryEvidence = thesisMetrics.slice(0, 3);
  const supportingEvidence = thesisMetrics.slice(3);

  return (
    <main className="bg-[#f8f3ea] text-[#2a211c]">
      <section className="relative isolate overflow-hidden bg-[#2a211c] text-white">
        <div className="absolute inset-0">
          <HeroVideo src={thesisHeroVideoSrc} playbackRate={0.5} />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.30)_0%,rgba(0,0,0,0.82)_100%)]" />
          <div className="absolute inset-0 bg-[#2a211c]/20" />
        </div>

        <div className="relative mx-auto flex min-h-[82vh] max-w-7xl flex-col justify-center gap-10 px-4 py-16 md:px-6">
          <div className="max-w-5xl">
            <p className="w-fit rounded-full border border-white/18 bg-white/10 px-3 py-1 text-sm font-medium text-[#f0cbb8] backdrop-blur">
              毕业设计论文展示
            </p>
            <h1 className="mt-5 max-w-5xl text-5xl font-semibold tracking-normal text-white md:text-7xl">
              {thesisTitle}
            </h1>
            <p className="mt-6 max-w-3xl text-xl leading-8 text-[#f4eee7]">
              {thesisSubtitle}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3 text-sm text-[#e2d7cc]">
              <span>王树勋</span>
              <span className="h-1 w-1 rounded-full bg-[#c15f3c]" />
              <span>导师 郭长勇</span>
              <span className="h-1 w-1 rounded-full bg-[#c15f3c]" />
              <span>VLA 记忆增强</span>
            </div>
          </div>

          <div className="grid max-w-5xl gap-3 md:grid-cols-3">
            {[
              "提取：从当前观察中读出可复用的记忆表示。",
              "聚合：在滑动窗口内组织历史，形成阶段感知。",
              "注入：用门控交叉注意力送入动作专家，不改 VLM 骨干。",
            ].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-white/16 bg-[#2a211c]/68 p-5 text-sm leading-7 text-[#f8f4ec] shadow-[0_18px_45px_rgba(0,0,0,0.20)] backdrop-blur"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-[#ded6c8] bg-[#f8f3ea] px-4 py-18 md:px-6">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.95fr_1.35fr]">
          <div>
            <p className="text-sm font-medium text-[#c15f3c]">成果证据链</p>
            <h2 className="mt-3 max-w-xl text-4xl font-semibold tracking-normal text-[#2a211c] md:text-5xl">
              记忆模块带来了稳定的任务收益。
            </h2>
            <p className="mt-5 max-w-xl text-base leading-8 text-[#665c52]">
              在 SimplerEnv、RMBench 和 ARX Acone
              三类场景中，方法从短程操作、强记忆依赖任务到真机数据链路都给出了可追溯证据。
            </p>
          </div>

          <div>
            <div className="grid gap-4 md:grid-cols-3">
              {primaryEvidence.map((metric) => (
                <article
                  key={metric.value}
                  className="rounded-[2rem] border border-[#dfd4c5] bg-[#fffaf4] p-6 shadow-[0_16px_42px_rgba(42,33,28,0.07)]"
                >
                  <p className="text-5xl font-semibold tracking-normal text-[#2a211c]">
                    {metric.value}
                  </p>
                  <p className="mt-4 text-base font-semibold text-[#2a211c]">
                    {metric.label}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#6c6258]">
                    {metric.caption}
                  </p>
                </article>
              ))}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              {supportingEvidence.map((metric) => (
                <div
                  key={metric.value}
                  className="rounded-2xl border border-[#dfd4c5] bg-white/45 px-5 py-4"
                >
                  <span className="block text-2xl font-semibold text-[#c15f3c]">
                    {metric.value}
                  </span>
                  <span className="mt-2 block text-sm leading-5 text-[#665c52]">
                    {metric.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-[#ded6c8] bg-[#fffaf4] px-4 py-18 md:px-6">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <article>
            <p className="text-sm font-medium text-[#c15f3c]">方法主线</p>
            <h2 className="mt-3 text-4xl font-semibold tracking-normal text-[#2a211c]">
              提取、聚合、注入。
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-8 text-[#665c52]">
              整体架构图在首页先讲清这条路径：当前观察和指令进入
              VLM，记忆词元读取信息，历史聚合器组织过去，再由 Gated
              Cross-Attention 注入动作专家。
            </p>
            <div className="mt-9 grid gap-3 md:grid-cols-5">
              {methodSteps.map((step, index) => (
                <div
                  key={step}
                  className="rounded-2xl border border-[#dfd4c5] bg-[#f8f3ea] p-4"
                >
                  <p className="text-xs text-[#c15f3c]">0{index + 1}</p>
                  <p className="mt-4 text-base font-semibold leading-6 text-[#2a211c]">
                    {step}
                  </p>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-[2rem] bg-[#2a211c] p-8 text-white shadow-[0_20px_50px_rgba(42,33,28,0.18)]">
            <p className="text-sm font-medium text-[#f0cbb8]">结果速览</p>
            <div className="mt-5 divide-y divide-white/12">
              {thesisResultPanels.map((panel) => (
                <div key={panel.title} className="py-5">
                  <p className="text-xl font-semibold text-white">
                    {panel.title}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-[#e6dbd0]">
                    {panel.caption}
                  </p>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="border-b border-[#ded6c8] bg-[#f8f3ea] px-4 py-18 md:px-6">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <p className="text-sm font-medium text-[#c15f3c]">实际应用演示</p>
            <h2 className="mt-3 text-4xl font-semibold tracking-normal text-[#2a211c]">
              MemoryVLA Demo
            </h2>
            <p className="mt-5 max-w-xl text-base leading-8 text-[#665c52]">
              这个演示把论文方法转成一个可讲解的长程任务应用：用户不需要现场跑模型，也能看到记忆如何帮助
              VLA 判断任务阶段。
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {demoPanels.map((panel, index) => (
              <article
                key={panel.title}
                className="rounded-[2rem] border border-[#dfd4c5] bg-[#fffaf4] p-6 shadow-[0_16px_42px_rgba(42,33,28,0.07)]"
              >
                <p className="text-sm font-semibold text-[#c15f3c]">
                  0{index + 1}
                </p>
                <h3 className="mt-5 text-2xl font-semibold text-[#2a211c]">
                  {panel.title}
                </h3>
                <p className="mt-4 text-sm leading-7 text-[#665c52]">
                  {panel.caption}
                </p>
              </article>
            ))}
          </div>
        </div>
        <div className="mx-auto mt-8 max-w-7xl overflow-x-auto rounded-[2rem] border border-[#dfd4c5] bg-[#fffaf4] p-5">
          <div className="grid min-w-[760px] grid-cols-6 gap-3">
            {["拿起 1", "放下", "拿起 2", "放下", "拿起 3", "触碰圆环"].map(
              (step, index) => (
                <div key={`${step}-${index}`} className="relative">
                  <div className="rounded-2xl border border-[#dfd4c5] bg-[#f8f3ea] px-4 py-3 text-sm font-medium text-[#2a211c]">
                    {step}
                  </div>
                  {index < 5 ? (
                    <div className="absolute top-1/2 -right-3 h-px w-3 bg-[#c15f3c]" />
                  ) : null}
                </div>
              ),
            )}
          </div>
        </div>
      </section>

      <section className="bg-[#f8f3ea] px-4 py-18 md:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <p className="text-sm font-medium text-[#c15f3c]">继续阅读</p>
              <h2 className="mt-3 text-4xl font-semibold tracking-normal text-[#2a211c]">
                从长程记忆问题走向最终结论。
              </h2>
            </div>
            <p className="max-w-xl text-base leading-8 text-[#665c52]">
              从问题开始，到方法、系统实现、真机数据、实验结果、机制分析，再回到贡献与局限。
            </p>
          </div>

          <div className="mt-9 grid gap-3">
            {thesisNavItems.map((item, index) => (
              <Link
                key={item.href}
                href={item.href}
                className="grid gap-3 rounded-2xl border border-[#dfd4c5] bg-[#fffaf4] px-5 py-5 transition hover:-translate-y-0.5 hover:border-[#c15f3c] hover:shadow-[0_14px_34px_rgba(42,33,28,0.08)] md:grid-cols-[90px_260px_1fr_36px] md:items-center"
              >
                <p className="text-sm text-[#c15f3c]">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <h3 className="text-xl font-semibold text-[#2a211c]">
                  {item.label}
                </h3>
                <p className="text-sm leading-7 text-[#665c52]">{item.hook}</p>
                <p className="text-xl text-[#c15f3c] md:text-right">→</p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
