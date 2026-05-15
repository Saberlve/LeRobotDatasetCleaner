import React from "react";

import { MathText } from "./math-text";
import { BenchmarkSection, PlatformCallout } from "./shared-sections";
import { PageKicker, StoryShell } from "./story-navigation";
import type { StoryPageProps } from "./types";

const aconeEvidenceMedia = [
  {
    kind: "image" as const,
    title: "硬件平台",
    caption: "方舟无线ACONE双臂机器人",
    src: "/images/thesis/acone-real-task-scene.png",
    alt: "ACONE 双臂硬件平台",
  },
  {
    kind: "video" as const,
    title: "数据采集视频",
    caption: "真实采集片段",
    src: "/video/real/episode_000009.mp4",
    poster:
      "/images/thesis/video_storyboards/real_episode_000009_storyboard.png",
  },
];

const aconeRmseByDimension = [
  {
    label: "x",
    value: 0.045,
    errorTop: 0.09,
    color: "#68bf9f",
    band: "#eef8f1",
  },
  {
    label: "y",
    value: 0.089,
    errorTop: 0.18,
    color: "#68bf9f",
    band: "#eef8f1",
  },
  {
    label: "z",
    value: 0.027,
    errorTop: 0.06,
    color: "#f08a63",
    band: "#eef8f1",
  },
  {
    label: "rx",
    value: 0.039,
    errorTop: 0.07,
    color: "#f08a63",
    band: "#eef6fb",
  },
  {
    label: "ry",
    value: 0.016,
    errorTop: 0.03,
    color: "#9da7d9",
    band: "#eef6fb",
  },
  {
    label: "rz",
    value: 0.033,
    errorTop: 0.06,
    color: "#dc7bb8",
    band: "#eef6fb",
  },
  { label: "Δx", value: 0, errorTop: 0, color: "#e7d9c0", band: "#fbf4ec" },
  {
    label: "Δy",
    value: 0.034,
    errorTop: 0.06,
    color: "#a6d854",
    band: "#fbf4ec",
  },
  {
    label: "Δz",
    value: 0.078,
    errorTop: 0.16,
    color: "#a6d854",
    band: "#fbf4ec",
  },
  {
    label: "Δrx",
    value: 0.089,
    errorTop: 0.17,
    color: "#ffd92f",
    band: "#fcf0f5",
  },
  {
    label: "Δry",
    value: 0.097,
    errorTop: 0.19,
    color: "#e5c494",
    band: "#fcf0f5",
  },
  {
    label: "Δrz",
    value: 0.027,
    errorTop: 0.06,
    color: "#d8c2a7",
    band: "#fcf0f5",
  },
  {
    label: "g1",
    value: 0.03,
    errorTop: 0.06,
    color: "#b3b3b3",
    band: "#f0efed",
  },
  {
    label: "g2",
    value: 0.696,
    errorTop: 1.39,
    color: "#b3b3b3",
    band: "#f0efed",
  },
] as const;

const aconeRmseYAxis = [1.4, 1.2, 1.0, 0.8, 0.6, 0.4, 0.2, 0];

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

      <PlatformCallout platform={page.platform} />
    </StoryShell>
  );
}

function AconeTransferReport() {
  return (
    <section className="mx-auto mt-12 max-w-7xl rounded-2xl border border-[#e8e0d5] bg-[#fffcf8] p-6 shadow-sm ring-1 ring-[#2c2421]/5 md:p-8">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-sm font-medium text-[#c15f3c]">ACONE 双臂真机</p>
        <h2 className="mt-3 text-2xl font-semibold leading-8 text-[#2a211c] md:text-3xl">
          真机数据采集与开环评测
        </h2>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {aconeEvidenceMedia.map((item) => (
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
      <AconeRmseChart />
    </section>
  );
}

function AconeRmseChart() {
  const maxRmse = 1.45;

  return (
    <article
      className="mt-8 rounded-xl border border-[#e8e0d5] bg-[#fbf8f2] p-5 md:p-6"
      data-acone-rmse-chart="html"
    >
      <div className="text-center">
        <p className="text-lg font-semibold leading-7 text-[#2a211c]">
          开环误差结果
        </p>
        <p className="mt-1 text-sm leading-6 text-[#665c52]">
          各动作维度均方根误差，13个维度低于 0.1，只有右手夹爪存在较大误差
        </p>
      </div>

      <div className="mt-6 overflow-x-auto pb-2">
        <div className="min-w-[960px]">
          <div className="grid grid-cols-[56px_1fr] gap-4">
            <div className="relative h-[360px] border-r border-[#2a211c]/65">
              {aconeRmseYAxis.map((tick) => (
                <span
                  key={tick}
                  className="absolute right-3 translate-y-1/2 font-mono text-xs text-[#3a3029]"
                  style={{ bottom: `${(tick / maxRmse) * 100}%` }}
                >
                  {tick.toFixed(tick === 1 ? 1 : 1)}
                </span>
              ))}
              <span className="absolute -left-6 top-1/2 -translate-x-1.5 -translate-y-1/2 -rotate-90 text-sm font-semibold tracking-normal text-[#2a211c]">
                均方根误差
              </span>
            </div>

            <div>
              <div className="relative h-[360px] border-b border-l border-[#2a211c]/65">
                {aconeRmseYAxis.map((tick) => (
                  <span
                    key={tick}
                    className="absolute left-0 right-0 border-t border-dashed border-[#d8ccbb]"
                    style={{ bottom: `${(tick / maxRmse) * 100}%` }}
                  />
                ))}

                <div className="absolute inset-0 grid grid-cols-[repeat(14,minmax(0,1fr))]">
                  {aconeRmseByDimension.map((item) => (
                    <div
                      key={item.label}
                      className="relative flex items-end justify-center border-r border-[#efe7db]/80"
                      style={{ backgroundColor: item.band }}
                    >
                      <span
                        className="absolute z-10 h-px w-7 bg-[#2a211c]"
                        style={{
                          bottom: `${(item.errorTop / maxRmse) * 100}%`,
                        }}
                      />
                      <span
                        className="absolute z-10 w-px bg-[#2a211c]"
                        style={{
                          bottom: 0,
                          height: `${(item.errorTop / maxRmse) * 100}%`,
                        }}
                      />
                      <span
                        className="absolute z-10 -translate-y-1 font-mono text-xs font-semibold text-[#2a211c]"
                        style={{
                          bottom: `${Math.min(
                            (item.errorTop / maxRmse) * 100 + 1.5,
                            94,
                          )}%`,
                        }}
                      >
                        {item.value.toFixed(3)}
                      </span>
                      <span
                        className="relative z-0 mb-0 w-9 border border-[#6c6258]/60"
                        style={{
                          height: `${Math.max((item.value / maxRmse) * 100, item.value === 0 ? 0 : 1.2)}%`,
                          backgroundColor: item.color,
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-[repeat(14,minmax(0,1fr))]">
                {aconeRmseByDimension.map((item) => (
                  <div
                    key={item.label}
                    className="pt-3 text-center font-serif text-base italic leading-none text-[#2a211c]"
                  >
                    {item.label}
                  </div>
                ))}
              </div>
              <p className="mt-4 text-center text-base font-semibold text-[#2a211c]">
                动作维度
              </p>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
