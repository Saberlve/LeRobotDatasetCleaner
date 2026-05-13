import React from "react";

import { MathText } from "./math-text";
import { PageKicker, StoryShell } from "./story-navigation";
import type { StoryPageProps } from "./types";

export function ProblemPage({ page }: StoryPageProps) {
  return (
    <StoryShell page={page}>
      <section className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_1fr] lg:items-start">
        <div>
          <PageKicker page={page} label="背景与研究动机" />
          <h1 className="mt-6 max-w-xl text-3xl font-semibold leading-snug text-[#1f1a17] md:text-4xl">
            {page.title}
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-8 text-[#3a3029]">
            <MathText text={page.hook} />
          </p>
        </div>
        <div className="lg:pt-10">
          <p className="max-w-2xl text-base leading-7 text-[#665c52]">
            <MathText text={page.summary} />
          </p>
        </div>
      </section>

      <section className="mx-auto mt-12 grid max-w-7xl gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <VlaNoMemoryDiagram />
        <MemoryTaskCard />
      </section>

      <VlaArchitectureLimitSection />
      <MemoryUrgencySection />
    </StoryShell>
  );
}

function VlaNoMemoryDiagram() {
  const visualInputFrames = [
    {
      frame: 0,
      label: "第 t-2 帧",
      caption: "已到达",
      active: false,
      src: "/images/thesis/vla-input-frame-000.jpg",
    },
    {
      frame: 60,
      label: "第 t-1 帧",
      caption: "已到达",
      active: false,
      src: "/images/thesis/vla-input-frame-060.jpg",
    },
    {
      frame: 120,
      label: "第 t 帧",
      caption: "当前输入",
      active: true,
      src: "/images/thesis/vla-input-frame-120.jpg",
    },
  ];
  const actionValues = ["-1.7", "1.25", "3.14", "1.42"];

  return (
    <article className="overflow-hidden rounded-[1.5rem] border border-[#d8ccbb] bg-[#f7f1e8] p-5 text-[#2a211c] shadow-[0_22px_55px_rgba(42,33,28,0.08)]">
      <style>{`
        @keyframes piFrameAdvance {
          0%, 18% { opacity: 0.44; transform: translateY(0) scale(0.97); }
          28%, 48% { opacity: 1; transform: translateY(-5px) scale(1); }
          60%, 100% { opacity: 0.56; transform: translateY(0) scale(0.97); }
        }

        @keyframes piFrameCarousel {
          0%, 8% { opacity: 0; transform: translateX(28%); }
          18%, 34% { opacity: 1; transform: translateX(0); }
          48%, 100% { opacity: 0; transform: translateX(-8%); }
        }

        @keyframes piTokenSlide {
          0% { transform: translateX(0); opacity: 0; }
          16% { opacity: 1; }
          86% { opacity: 1; }
          100% { transform: translateX(84%); opacity: 0; }
        }

        @keyframes piDottedArrow {
          0%, 30% { stroke-dashoffset: 18; opacity: 0.36; }
          50% { opacity: 0.95; }
          100% { stroke-dashoffset: 0; opacity: 0.52; }
        }

        @keyframes piActionDenoise {
          0%, 32% { opacity: 0.35; transform: translateY(6px); }
          46%, 74% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0.52; transform: translateY(0); }
        }

        .pi-frame-advance {
          animation: piFrameAdvance 5.1s cubic-bezier(0.22, 1, 0.36, 1) infinite;
        }

        .pi-frame-carousel {
          animation: piFrameCarousel 9s cubic-bezier(0.22, 1, 0.36, 1) infinite;
        }

        .pi-token-slide {
          animation: piTokenSlide 5.1s cubic-bezier(0.16, 1, 0.3, 1) infinite;
        }

        .pi-dotted-arrow {
          animation: piDottedArrow 2.6s linear infinite;
        }

        .pi-action-denoise {
          animation: piActionDenoise 5.1s cubic-bezier(0.16, 1, 0.3, 1) infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .pi-frame-advance,
          .pi-frame-carousel,
          .pi-token-slide,
          .pi-dotted-arrow,
          .pi-action-denoise {
            animation: none;
          }

          .pi-frame-carousel:not(:last-child) {
            opacity: 0;
          }
        }
      `}</style>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-sm text-[#3a3029]">主流 VLA 数据流图</p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#665c52]">
            多帧依次到达，但每次只输入最新一帧。
          </p>
        </div>
        <div className="rounded-[0.45rem] border border-[#2a211c] bg-[#fffaf4] px-3 py-1 font-mono text-xs">
          无记忆缓存
        </div>
      </div>

      <div className="mt-7 overflow-x-auto md:overflow-x-hidden">
        <div className="min-w-[630px] md:min-w-0">
          <div className="grid grid-cols-[minmax(0,1fr)_180px] items-start gap-y-1">
            <div>
              <div className="h-[4.25rem]" />
            </div>
            <div className="self-end">
              <p className="mb-1 text-center font-mono text-xs">连续动作</p>
              <div className="flex justify-center gap-1">
                {actionValues.map((value, index) => (
                  <span
                    key={value}
                    className="pi-action-denoise rounded-full border border-[#2a211c] bg-[#f4d65f] px-1 py-1 text-center font-mono text-[0.55rem]"
                    style={{ animationDelay: `${index * 0.16}s` }}
                  >
                    {value}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <div className="flex h-[12rem] flex-col justify-between rounded-[0.5rem] rounded-r-none border border-[#2a211c] bg-[#9fcad2] p-2.5">
                <div className="flex gap-1.5">
                  {Array.from({ length: 16 }).map((_, index) => (
                    <span
                      key={index}
                      className="h-3 flex-1 rounded-full border border-[#2a211c]/70 bg-[#bfe0e5]"
                    />
                  ))}
                </div>
                <div className="my-3 rounded-[0.5rem] border border-[#2a211c] bg-[#fffaf4] px-6 py-5 text-center">
                  <p className="font-mono text-base font-semibold">
                    预训练 VLM
                  </p>
                  <p className="mt-1 font-mono text-sm text-[#6c6258]">
                    视觉编码器 + LLM
                  </p>
                </div>
                <div className="flex gap-1.5">
                  {Array.from({ length: 16 }).map((_, index) => (
                    <span
                      key={index}
                      className="h-3 flex-1 rounded-full border border-[#2a211c]/70 bg-[#bfe0e5]"
                    />
                  ))}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-[220px_150px] justify-center gap-3">
                <div>
                  <div
                    className="mx-auto flex h-8 w-[58%] items-center justify-center rounded-t-[0.35rem] border border-[#2a211c] bg-[#9cc9d2] font-mono text-[0.65rem] font-semibold text-[#2a211c]"
                    style={{
                      clipPath: "polygon(14% 0, 86% 0, 100% 100%, 0 100%)",
                    }}
                  >
                    视觉编码器
                  </div>
                  <div className="rounded-[0.5rem] border border-[#2a211c] bg-[#dfeff1] px-2.5 py-2 font-mono text-xs">
                    <p className="text-center">视觉输入</p>
                    <div className="relative mt-2 aspect-[16/9] overflow-hidden rounded-[0.35rem] border border-[#2a211c]/45 bg-[#eef7f8]">
                      {visualInputFrames.map((frame, index) => (
                        <div
                          key={frame.src}
                          className="pi-frame-carousel absolute inset-0"
                          style={{ animationDelay: `${index * 3}s` }}
                        >
                          <img
                            src={frame.src}
                            alt={`nice.mp4 第 ${frame.frame} 帧`}
                            className="h-full w-full object-cover"
                          />
                          <div className="absolute bottom-1 left-1 rounded-[0.25rem] border border-[#2a211c]/45 bg-[#fffaf4]/90 px-1.5 py-0.5 text-[0.55rem] text-[#2a211c]">
                            {frame.label} · {frame.caption}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex h-16 w-[150px] flex-col items-center justify-center gap-0.5 rounded-[0.5rem] border border-dashed border-[#2a211c] bg-[#fff7be] px-2 text-center font-mono text-[0.6rem]">
                  <span className="whitespace-nowrap">语言指令</span>
                  <span className="whitespace-nowrap font-sans text-xs">
                    交换方块
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col">
              <div className="flex h-[12rem] flex-col justify-between rounded-[0.5rem] rounded-l-none border border-l-0 border-[#2a211c] bg-[#dbe9d5] p-2.5">
                <div className="grid grid-cols-4 gap-1.5">
                  {Array.from({ length: 8 }).map((_, index) => (
                    <span
                      key={index}
                      className="h-6 rounded-[0.3rem] border border-[#2a211c]/45 bg-[#eef5e9]"
                    />
                  ))}
                </div>
                <div className="rounded-[0.45rem] border border-[#2a211c] bg-[#fffaf4] px-2.5 py-3 text-center">
                  <p className="font-mono text-sm font-semibold">动作头</p>
                  <p className="font-mono text-xs text-[#665c52]">动作专家</p>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {Array.from({ length: 8 }).map((_, index) => (
                    <span
                      key={index}
                      className="h-6 rounded-[0.3rem] border border-[#2a211c]/45 bg-[#eef5e9]"
                    />
                  ))}
                </div>
              </div>

              <div className="mt-3 flex justify-center">
                <div className="h-9 border-l border-[#2a211c]" />
              </div>
              <p className="text-center font-mono text-xs">噪声</p>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function MemoryTaskCard() {
  return (
    <article className="rounded-[1.5rem] border border-[#d8ccbb] bg-[#fffaf4] p-6">
      <p className="text-sm font-medium text-[#c15f3c]">交换方块任务</p>
      <h2 className="mt-5 text-3xl font-semibold leading-tight text-[#2a211c]">
        四个关键步骤都依赖过去状态。
      </h2>
      <div className="mt-6 grid gap-3 text-sm leading-7 text-[#3a3029]">
        {[
          "记住两个方块的起始位置。",
          "移动 A 到第三个格子。",
          "把 B 放回 A 原来的位置。",
          "按按钮，结束任务。",
        ].map((item, index) => (
          <p key={item} className="border-t border-[#d8ccbb] pt-3">
            <span className="mr-3 font-semibold text-[#c15f3c]">
              0{index + 1}
            </span>
            {item}
          </p>
        ))}
      </div>
    </article>
  );
}

function VlaArchitectureLimitSection() {
  const limits = [
    "每帧只看当前画面。之前动过哪个方块、搬到了哪里，下一步完全不知道。",
    "交换方块必须记住起点、走到哪一步、已经做完了什么。",
    "出错的根因在于整个架构压根没有给 VLA 模型获取历史信息的途径",
  ];

  return (
    <section className="mx-auto mt-12 grid max-w-7xl gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
      <div className="border-y border-[#d8ccbb] py-6">
        <p className="text-sm font-medium text-[#c15f3c]">当前 VLA 架构限制</p>
        <h2 className="mt-4 max-w-xl text-3xl font-semibold leading-tight text-[#2a211c]">
          每一步对于VLA都是新的开始
        </h2>
        <p className="mt-5 max-w-xl text-base leading-8 text-[#665c52]">
          交换方块任务其实已经完成了，但模型不知道初始状态是什么，还在操纵机器臂移动方块。
          现在的 VLA
          只能获取当前观测，之前发生过什么一概不管，遇到需要记忆信息的长程任务就会出错。
        </p>
        <div className="mt-7 grid gap-3">
          {limits.map((item, index) => (
            <p
              key={item}
              className="border-t border-[#d8ccbb] pt-3 text-sm leading-7 text-[#3a3029]"
            >
              <span className="mr-3 font-semibold text-[#c15f3c]">
                0{index + 1}
              </span>
              {item}
            </p>
          ))}
        </div>
      </div>

      <figure className="overflow-hidden rounded-[1.5rem] border border-[#d8ccbb] bg-[#fffaf4] shadow-[0_18px_45px_rgba(42,33,28,0.08)]">
        <figcaption className="border-t border-[#d8ccbb] px-5 py-4">
          <p className="text-sm font-semibold text-[#2a211c]">
            交换方块失败案例 —— 完成任务后继续执行多余动作
          </p>
        </figcaption>
        <div className="bg-[#2a211c] p-2">
          <video
            src="/videos/failure.mp4"
            controls
            preload="metadata"
            playsInline
            aria-label="交换方块失败回放"
            className="aspect-video w-full rounded-[1rem] bg-[#2a211c] object-contain"
          >
            交换方块失败回放
          </video>
        </div>
      </figure>
    </section>
  );
}

function MemoryUrgencySection() {
  return (
    <section className="mx-auto mt-12 max-w-7xl rounded-[1.5rem] bg-[#2a211c] px-6 py-7 text-[#f4eee7] md:px-8 md:py-8">
      <p className="text-center text-lg font-semibold leading-9 text-[#fffaf4] md:text-xl">
        给 VLA 添加记忆系统，才能让它真正理解和完成长程任务。
      </p>
    </section>
  );
}
