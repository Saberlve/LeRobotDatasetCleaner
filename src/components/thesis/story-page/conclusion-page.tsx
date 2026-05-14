import React from "react";

import { MathText } from "./math-text";
import { PlatformCallout } from "./shared-sections";
import { contributionRows, limitations, nextSteps } from "./story-data";
import { PageKicker, StoryShell } from "./story-navigation";
import type { StoryPageProps } from "./types";

export function ConclusionPage({ page }: StoryPageProps) {
  return (
    <StoryShell page={page}>
      <section className="mx-auto max-w-4xl pb-12 pt-8">
        <PageKicker page={page} label="答辩收束" />
        <div className="mt-6">
          <h1 className="text-4xl font-semibold leading-tight tracking-normal text-[#1f1a17] md:text-5xl">
            {page.title}
          </h1>
          <p className="mt-6 text-xl leading-9 text-[#3a3029]">
            <MathText text={page.hook} />
          </p>
        </div>
        <div className="mt-10 border-t border-[#d8ccbb] pt-8">
          <p className="text-base leading-8 text-[#665c52]">
            <MathText text={page.summary} />
          </p>
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-7xl">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {contributionRows.map((row) => (
            <article
              key={row[0]}
              className="min-h-40 rounded-2xl border border-[#e8e0d5] bg-[#fffcf8] p-8 shadow-sm ring-1 ring-[#2c2421]/5"
            >
              <p className="text-sm font-medium text-[#c15f3c]">{row[0]}</p>
              <p className="mt-6 text-xl font-semibold leading-8 text-[#2a211c]">
                {row[1]}
              </p>
              {row[2] ? (
                <p className="mt-4 text-sm text-[#665c52]">{row[2]}</p>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-16 max-w-7xl">
        <p className="text-sm font-medium text-[#c15f3c]">局限性</p>
        <div className="mt-8 grid gap-x-16 gap-y-0 md:grid-cols-2">
          {limitations.map((item) => (
            <article
              key={item}
              className="border-t border-[#e8e0d5] py-6 text-base leading-8 text-[#3a3029]"
            >
              <MathText text={item} />
            </article>
          ))}
        </div>
      </section>

      <PlatformCallout platform={page.platform} />

      <section className="mx-auto mt-12 max-w-7xl rounded-2xl border border-[#e8e0d5] bg-[#fffcf8] p-8 shadow-sm ring-1 ring-[#2c2421]/5">
        <p className="text-sm font-medium text-[#c15f3c]">下一步工作</p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {nextSteps.map((item) => (
            <p
              key={item}
              className="rounded-xl bg-[#f8f3ea] p-5 text-sm leading-7 text-[#3a3029]"
            >
              {item}
            </p>
          ))}
        </div>
      </section>
    </StoryShell>
  );
}
