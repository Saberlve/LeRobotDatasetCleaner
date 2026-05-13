import React from "react";
import Link from "next/link";

import {
  type ThesisStoryPage,
  getNextStoryPage,
  thesisNavItems,
} from "@/content/thesis-site";

import type { StoryPageProps } from "./types";

type StoryShellProps = StoryPageProps & {
  children: React.ReactNode;
};

const pageIndex = (href: string) =>
  Math.max(
    0,
    thesisNavItems.findIndex((item) => item.href === href),
  );

export const pageNumber = (href: string) =>
  String(pageIndex(href) + 1).padStart(2, "0");

export function StoryShell({ page, children }: StoryShellProps) {
  const nextPage = getNextStoryPage(page.href);

  return (
    <main className="bg-[#f8f3ea] px-4 py-8 text-[#2a211c] md:px-6 md:py-10">
      {children}
      <ChapterNav page={page} />
      <NextPageLink nextPage={nextPage} />
    </main>
  );
}

export function PageKicker({
  page,
  label,
}: {
  page: ThesisStoryPage;
  label: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm text-[#7a6f64]">
      <span className="font-semibold text-[#c15f3c]">
        {pageNumber(page.href)}
      </span>
      <span>{label}</span>
      <span>{page.eyebrow}</span>
    </div>
  );
}

function ChapterNav({ page }: StoryPageProps) {
  return (
    <section className="mx-auto mt-10 max-w-7xl border-t border-[#d8ccbb] pt-5">
      <div className="flex flex-wrap gap-2">
        {thesisNavItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-full border px-4 py-2 text-sm transition ${
              item.href === page.href
                ? "border-[#2a211c] bg-[#2a211c] text-[#fffaf4]"
                : "border-[#d8ccbb] bg-[#fffaf4] text-[#665c52] hover:border-[#c15f3c] hover:text-[#2a211c]"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

function NextPageLink({ nextPage }: { nextPage: ThesisStoryPage | null }) {
  if (!nextPage) {
    return (
      <section className="mx-auto mt-6 max-w-7xl">
        <Link
          href="/"
          className="grid gap-4 rounded-[2rem] border border-[#d8ccbb] bg-[#fffaf4] p-6 transition hover:border-[#c15f3c] md:grid-cols-[180px_1fr]"
        >
          <p className="text-sm font-medium text-[#c15f3c]">返回首页</p>
          <div>
            <h2 className="text-2xl font-semibold">重新查看整站总览</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[#665c52]">
              回到首页重新进入论文故事，或跳转到任意章节。
            </p>
          </div>
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-auto mt-6 max-w-7xl">
      <Link
        href={nextPage.href}
        className="grid gap-4 rounded-[2rem] border border-[#d8ccbb] bg-[#fffaf4] p-6 transition hover:border-[#c15f3c] md:grid-cols-[180px_1fr]"
      >
        <p className="text-sm font-medium text-[#c15f3c]">
          下一页 / {pageNumber(nextPage.href)}
        </p>
        <div>
          <h2 className="text-2xl font-semibold">{nextPage.label}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[#665c52]">
            {nextPage.hook}
          </p>
        </div>
      </Link>
    </section>
  );
}
