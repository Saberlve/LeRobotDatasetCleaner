import React from "react";

import { MathText } from "./math-text";
import { PlatformCallout, SplitNarrative } from "./shared-sections";
import { contributionRows, nextSteps } from "./story-data";
import { PageKicker, StoryShell } from "./story-navigation";
import type { StoryPageProps } from "./types";

export function ConclusionPage({ page }: StoryPageProps) {
  return (
    <StoryShell page={page}>
      <section className="mx-auto max-w-7xl">
        <PageKicker page={page} label="答辩收束" />
        <div className="mt-8 grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h1 className="text-4xl font-semibold leading-tight tracking-normal text-[#1f1a17] md:text-5xl">
              {page.title}
            </h1>
            <p className="mt-6 text-xl leading-9 text-[#3a3029]">
              <MathText text={page.hook} />
            </p>
            <p className="mt-5 text-base leading-8 text-[#665c52]">
              <MathText text={page.summary} />
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {contributionRows.map((row) => (
              <article
                key={row[0]}
                className="min-h-40 rounded-[1.5rem] border border-[#d8ccbb] bg-[#fffaf4] p-5"
              >
                <p className="text-sm font-medium text-[#c15f3c]">{row[0]}</p>
                <p className="mt-6 text-xl font-semibold leading-8 text-[#2a211c]">
                  {row[1]}
                </p>
                <p className="mt-4 text-sm text-[#665c52]">{row[2]}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <SplitNarrative page={page} label="四大贡献" />
      <PlatformCallout platform={page.platform} />
      <section className="mx-auto mt-8 max-w-7xl rounded-[1.5rem] border border-[#d8ccbb] bg-[#fffaf4] p-6">
        <p className="text-sm font-medium text-[#c15f3c]">下一步工作</p>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {nextSteps.map((item) => (
            <p
              key={item}
              className="rounded-2xl bg-[#f8f3ea] p-4 text-sm leading-7 text-[#3a3029]"
            >
              {item}
            </p>
          ))}
        </div>
      </section>
    </StoryShell>
  );
}
