import React from "react";

import { MathText } from "./math-text";
import { MemorySystemDiagramGrid } from "./memory-system-diagrams";
import { PlatformCallout, SplitNarrative } from "./shared-sections";
import { systemRows } from "./story-data";
import { PageKicker, StoryShell } from "./story-navigation";
import type { StoryPageProps } from "./types";

export function SystemsPage({ page }: StoryPageProps) {
  return (
    <StoryShell page={page}>
      <section className="mx-auto max-w-7xl">
        <PageKicker page={page} label="方案矩阵" />
        <div className="mt-7 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <h1 className="text-4xl font-semibold leading-tight tracking-normal text-[#1f1a17] md:text-5xl">
              {page.title}
            </h1>
            <p className="mt-6 text-xl leading-9 text-[#3a3029]">
              <MathText text={page.hook} />
            </p>
          </div>
          <p className="border-t border-[#d8ccbb] pt-5 text-base leading-8 text-[#665c52] lg:mt-10">
            <MathText text={page.summary} />
          </p>
        </div>

        <div className="mt-10 overflow-x-auto rounded-[1.5rem] border border-[#d8ccbb] bg-[#fffaf4]">
          <table className="min-w-[900px] w-full border-collapse text-left text-sm">
            <thead className="bg-[#2a211c] text-[#f4eee7]">
              <tr>
                {["维度", "Cache", "Comp", "Norm", "GCA(本文)"].map(
                  (column) => (
                    <th key={column} className="px-5 py-4 font-medium">
                      {column}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {systemRows.map((row) => (
                <tr key={row[0]} className="border-t border-[#d8ccbb]">
                  {row.map((cell, index) => (
                    <td
                      key={`${row[0]}-${index}-${cell}`}
                      className={`px-5 py-4 leading-6 ${
                        index === 0
                          ? "font-semibold text-[#c15f3c]"
                          : "text-[#3a3029]"
                      }`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <MemorySystemDiagramGrid />
      <SplitNarrative page={page} label="关键判断" />
      <PlatformCallout platform={page.platform} />
    </StoryShell>
  );
}
