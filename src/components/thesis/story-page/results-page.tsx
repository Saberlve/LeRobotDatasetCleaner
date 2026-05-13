import React from "react";

import { MathText } from "./math-text";
import {
  BenchmarkSection,
  PlatformCallout,
  SplitNarrative,
} from "./shared-sections";
import { PageKicker, StoryShell } from "./story-navigation";
import type { StoryPageProps } from "./types";

const aconeEvidenceItems = [
  {
    kind: "image" as const,
    title: "真机任务现场",
    caption: "ACONE 双臂平台上的 pick X times 任务实拍，先确认迁移对象和操作场景。",
    src: "/images/thesis/acone-real-task-scene.png",
    alt: "ACONE 双臂真机任务现场",
  },
  {
    kind: "video" as const,
    title: "数据采集视频",
    caption: "episode_000009 的真实采集片段，保留连续操作节奏和阶段变化。",
    src: "/video/real/episode_000009.mp4",
    poster: "/images/thesis/video_storyboards/real_episode_000009_storyboard.png",
  },
  {
    kind: "image" as const,
    title: "开环误差结果",
    caption: "pi05_arx_13000 checkpoint 的 14 维动作 RMSE，夹爪维度是主要误差来源。",
    src: "/images/thesis/acone-open-loop-dim-rmse.png",
    alt: "ACONE 开环评测动作维度 RMSE 柱状图",
  },
];

const aconeMetrics = [
  ["37", "高质量回合"],
  ["34,205", "真实采集帧"],
  ["1,124", "开环评测窗口"],
  ["12 / 14", "RMSE < 0.1 的动作维度"],
];

export function ResultsPage({ page }: StoryPageProps) {
  return (
    <StoryShell page={page}>
      <section className="mx-auto max-w-7xl pb-12 pt-8 text-center">
        <div className="flex justify-center">
          <PageKicker page={page} label="主实验结果" />
        </div>
        <div className="mt-8">
          <h1 className="text-4xl font-semibold leading-tight tracking-normal text-[#1f1a17] md:text-6xl lg:text-7xl">
            {page.title}
          </h1>
          <p className="mx-auto mt-8 max-w-4xl text-xl leading-relaxed text-[#3a3029] md:text-2xl">
            <MathText text={page.hook} />
          </p>
        </div>
      </section>

      <div className="mx-auto mt-10 grid max-w-7xl gap-8">
        {page.benchmarkSections?.map((section) => (
          <BenchmarkSection key={section.name} section={section} />
        ))}
      </div>

      <AconeTransferReport />

      <SplitNarrative page={page} label="关键线索" />
      <PlatformCallout platform={page.platform} />
    </StoryShell>
  );
}

function AconeTransferReport() {
  return (
    <section className="mx-auto mt-12 max-w-7xl rounded-2xl border border-[#e8e0d5] bg-[#fffcf8] p-6 shadow-sm ring-1 ring-[#2c2421]/5 md:p-8">
      <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
        <div>
          <p className="text-sm font-medium text-[#c15f3c]">
            ACONE 双臂真机 · 迁移性快报
          </p>
          <h2 className="mt-3 text-2xl font-semibold leading-8 text-[#2a211c] md:text-3xl">
            从实拍、采集视频到开环误差，形成一条真机迁移证据链。
          </h2>
          <p className="mt-4 text-sm leading-7 text-[#665c52]">
            这组结果把 ACONE 平台上的真实任务、采集数据和 pi05_arx_13000
            checkpoint 的开环评测放在同一处。模型在多数关节维度能贴住真实动作，误差主要集中在夹爪开合。
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            {aconeMetrics.map(([value, label]) => (
              <div
                key={label}
                className="rounded-xl border border-[#e8e0d5] bg-[#f8f3ea]/55 px-4 py-3"
              >
                <p className="text-xl font-semibold text-[#2a211c]">{value}</p>
                <p className="mt-1 text-xs leading-5 text-[#665c52]">{label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          {aconeEvidenceItems.map((item) => (
            <figure
              key={item.title}
              className="overflow-hidden rounded-xl border border-[#e8e0d5] bg-[#f8f3ea]"
            >
              {item.kind === "video" ? (
                <video
                  src={item.src}
                  poster={item.poster}
                  autoPlay
                  controls
                  loop
                  muted
                  playsInline
                  preload="metadata"
                  className="aspect-video w-full bg-[#2a211c] object-cover"
                />
              ) : (
                <img
                  src={item.src}
                  alt={item.alt}
                  className="aspect-video w-full bg-[#f8f3ea] object-cover"
                />
              )}
              <figcaption className="border-t border-[#e8e0d5] px-5 py-4">
                <p className="text-sm font-semibold leading-6 text-[#2a211c]">
                  {item.title}
                </p>
                <p className="mt-1.5 text-sm leading-6 text-[#665c52]">
                  {item.caption}
                </p>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
