import React from "react";

import { PlatformProjectLink } from "@/components/thesis/platform-project-link";
import { SimplerEnvSuccessRateCharts } from "@/components/thesis/success-rate-charts";
import {
  type ThesisBenchmarkSection,
  type ThesisBenchmarkTable,
  type ThesisFigure,
  type ThesisPlatformCallout,
  type ThesisStoryPage,
} from "@/content/thesis-site";

import { MathText } from "./math-text";
import type { StoryPageProps } from "./types";

export function SplitNarrative({
  page,
  label,
}: {
  page: ThesisStoryPage;
  label: string;
}) {
  return (
    <section className="mx-auto mt-16 max-w-7xl">
      <p className="text-sm font-medium text-[#c15f3c]">{label}</p>
      <div className="mt-8 grid gap-x-16 gap-y-0 md:grid-cols-2">
        {page.highlights.map((item, index) => (
          <article
            key={item}
            className="border-t border-[#e8e0d5] py-6 text-base leading-8 text-[#3a3029]"
          >
            <span className="mb-4 block text-sm font-semibold text-[#c15f3c]">
              0{index + 1}
            </span>
            <MathText text={item} />
          </article>
        ))}
      </div>
    </section>
  );
}

export function FigureEvidence({ page }: StoryPageProps) {
  if (!page.figures?.length) {
    return null;
  }

  const hasPortraitFigures = page.figures.some(
    (figure) => figure.layout === "portrait",
  );

  return (
    <section
      className={`mx-auto mt-8 border-y border-[#d8ccbb] py-5 ${
        hasPortraitFigures ? "max-w-7xl" : "max-w-5xl"
      }`}
    >
      <div
        className={`grid gap-4 ${
          hasPortraitFigures
            ? "md:grid-cols-2 xl:grid-cols-4"
            : "lg:grid-cols-2"
        }`}
      >
        {page.figures.map((figure) => (
          <FigureCard key={figure.title} figure={figure} />
        ))}
      </div>
    </section>
  );
}

function FigureCard({ figure }: { figure: ThesisFigure }) {
  return (
    <figure
      className={`overflow-hidden rounded-2xl border border-[#e8e0d5] bg-[#fffcf8] shadow-sm ring-1 ring-[#2c2421]/5 ${
        figure.layout === "wide" ? "lg:col-span-2" : ""
      }`}
    >
      <div className="bg-[#f8f3ea] p-3">
        {figure.src ? (
          <img
            src={figure.src}
            alt={figure.title}
            className={`w-full rounded-xl object-contain ${
              figure.layout === "wide"
                ? "max-h-[360px]"
                : figure.layout === "portrait"
                  ? "max-h-[560px]"
                  : "max-h-[300px]"
            }`}
          />
        ) : null}
      </div>
      <figcaption className="border-t border-[#e8e0d5] px-6 py-4">
        <p className="text-sm font-semibold leading-6 text-[#2a211c]">
          {figure.title}
        </p>
        <p className="mt-1.5 text-sm leading-6 text-[#665c52]">
          {figure.caption}
        </p>
      </figcaption>
    </figure>
  );
}

export function BenchmarkSection({
  section,
}: {
  section: ThesisBenchmarkSection;
}) {
  return (
    <section className="rounded-2xl border border-[#e8e0d5] bg-[#fffcf8] p-8 shadow-sm ring-1 ring-[#2c2421]/5">
      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        <div>
          <p className="text-sm font-medium text-[#c15f3c]">{section.kicker}</p>
          <h2 className="mt-3 text-3xl font-semibold text-[#2a211c]">
            {section.name}
          </h2>
        </div>
        <div className="space-y-4 text-base leading-8 text-[#665c52]">
          {section.intro.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </div>
      </div>
      <VideoGrid section={section} />
      {section.name === "SimplerEnv WidowX" && <SimplerEnvSuccessRateCharts />}
      {section.table ? (
        <div className="mt-8">
          <BenchmarkTable table={section.table} />
        </div>
      ) : null}
    </section>
  );
}

function VideoGrid({ section }: { section: ThesisBenchmarkSection }) {
  return (
    <div
      className={`mt-8 grid gap-4 ${
        section.videoColumns === 4 ? "lg:grid-cols-4" : "lg:grid-cols-1"
      }`}
    >
      {section.videos.map((video) => (
        <article
          key={video.src}
          className="overflow-hidden rounded-xl border border-[#e8e0d5] bg-[#f8f3ea]"
        >
          <video
            src={video.src}
            poster={video.poster}
            autoPlay
            controls
            loop
            muted
            playsInline
            preload="metadata"
            className="aspect-video w-full bg-[#2a211c] object-cover"
          />
          <div className="p-5">
            <p className="font-semibold text-[#2a211c]">{video.title}</p>
            <p className="mt-1 text-sm text-[#665c52]">{video.caption}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

export function BenchmarkTables({
  tables,
}: {
  tables?: ThesisBenchmarkTable[];
}) {
  if (!tables?.length) {
    return null;
  }

  return (
    <section className="mx-auto mt-12 max-w-7xl border-t border-[#d8ccbb] pt-8">
      <div className="grid gap-8">
        {tables.map((table) => (
          <BenchmarkTable key={table.title} table={table} />
        ))}
      </div>
    </section>
  );
}

function BenchmarkTable({ table }: { table: ThesisBenchmarkTable }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-[#e8e0d5] bg-[#fffcf8] shadow-sm ring-1 ring-[#2c2421]/5">
      <div className="px-8 py-6">
        <h2 className="text-xl font-semibold text-[#2a211c]">{table.title}</h2>
        <p className="mt-2 text-sm leading-7 text-[#665c52]">{table.caption}</p>
      </div>
      <div className="overflow-x-auto border-t border-[#e8e0d5]">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead className="bg-[#f8f3ea]/50 text-[#2c2421]">
            <tr>
              {table.columns.map((column) => (
                <th key={column} className="px-8 py-4 font-semibold text-[#2a211c]">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr
                key={row.join("-")}
                className="border-t border-[#e8e0d5] text-[#3a3029] transition-colors hover:bg-[#f8f3ea]/20"
              >
                {row.map((cell, index) => (
                  <td
                    key={`${cell}-${index}`}
                    className="px-8 py-5 align-top leading-6"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

export function PlatformCallout({
  platform,
}: {
  platform: ThesisPlatformCallout | undefined;
}) {
  if (!platform) {
    return null;
  }

  return (
    <section className="mx-auto mt-12 max-w-7xl rounded-2xl border border-[#e8e0d5] bg-[#fffcf8] p-8 shadow-sm ring-1 ring-[#2c2421]/5">
      <div className="grid gap-8 lg:grid-cols-[320px_1fr_auto] lg:items-center">
        <img
          src={platform.image}
          alt={platform.title}
          className="aspect-video w-full rounded-xl border border-[#e8e0d5] bg-[#f8f3ea] object-cover"
        />
        <div>
          <p className="text-sm font-medium text-[#c15f3c]">一体化平台入口</p>
          <h2 className="mt-3 text-2xl font-semibold text-[#2a211c]">
            {platform.title}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[#665c52]">
            {platform.caption}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {platform.chips.map((chip) => (
              <span
                key={chip}
                className="rounded-full border border-[#e8e0d5] bg-[#f8f3ea] px-4 py-1.5 text-xs font-medium text-[#665c52]"
              >
                {chip}
              </span>
            ))}
          </div>
        </div>
        <PlatformProjectLink href={platform.href} label={platform.action} />
      </div>
    </section>
  );
}

export function BlockCausalMaskDiagram() {
  const steps = [0, 1, 2, 3]; // 4 time steps
  const labels = ["T-4", "T-3", "T-2", "T-1"];

  return (
    <div className="rounded-[1.25rem] bg-[#efe6d9] p-5 md:p-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-[#2a211c]">注意权重矩阵</h3>
          <p className="font-mono text-xs text-[#665c52]">
            Block-Causal Mask (T-4 → T-1)
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-sm bg-[#c15f3c]" />
            <span className="text-xs font-medium text-[#665c52]">1 (计算)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-sm border border-[#d8ccbb] bg-[#efe6d9]" />
            <span className="text-xs font-medium text-[#665c52]">0 (掩码)</span>
          </div>
        </div>
      </div>

      <div className="mt-8 flex gap-5">
        {/* Y-axis label */}
        <div className="flex flex-col justify-around py-4 font-mono text-sm font-bold text-[#a89a8b]">
          {labels.map((label) => (
            <div key={label} className="flex h-0 items-center justify-end">
              <span className="-rotate-90 whitespace-nowrap px-1">{label}</span>
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-hidden">
          <div className="grid grid-cols-4 gap-2.5">
            {steps.map((row) =>
              steps.map((col) => {
                const isAllowed = row >= col;
                return (
                  <div
                    key={`${row}-${col}`}
                    className={`aspect-square rounded-lg border transition-all duration-500 ${
                      isAllowed
                        ? "border-[#c15f3c]/30 bg-[#f4ece1]"
                        : "border-transparent bg-black/5"
                    }`}
                  >
                    <div className="grid h-full w-full grid-cols-4 grid-rows-4 gap-0.5 p-1.5">
                      {Array.from({ length: 16 }).map((_, i) => (
                        <div
                          key={i}
                          className={`rounded-[1.5px] ${
                            isAllowed ? "bg-[#c15f3c]" : "bg-[#d8ccbb]/40"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                );
              }),
            )}
          </div>

          {/* X-axis label */}
          <div className="mt-4 grid grid-cols-4 gap-2.5 text-center font-mono text-sm font-bold text-[#a89a8b]">
            {labels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-8 border-t border-[#d8ccbb] pt-5 text-sm leading-7 text-[#665c52]">
        <div className="flex gap-3">
          <strong className="shrink-0 text-[#2a211c]">块内双向：</strong>
          <div>
            <MathText text="每个4x4方块代表一个时间步的 $N$ 个记忆词元，块内双向注意力。" />
          </div>
        </div>
        <div className="mt-2 flex gap-3">
          <strong className="shrink-0 text-[#2a211c]">块间因果：</strong>
          <div>
            <MathText text="第 $t$ 步的词元只能注意到 $\tau$ $\le$ $t$ 的历史词元。" />
          </div>
        </div>
      </div>
    </div>
  );
}
