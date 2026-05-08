import React from "react";
import Link from "next/link";

import {
  type ThesisStoryPage,
  dataCleaningToolNavItem,
  getNextStoryPage,
  thesisNavItems,
} from "@/content/thesis-site";

type StoryPageProps = {
  page: ThesisStoryPage;
};

export function StoryPage({ page }: StoryPageProps) {
  const nextPage = getNextStoryPage(page.href);

  return (
    <main className="bg-[#f8f3ea] px-4 py-10 text-[#2a211c] md:px-6">
      <section className="mx-auto max-w-7xl rounded-[2rem] bg-[#2a211c] p-8 text-white shadow-[0_22px_60px_rgba(42,33,28,0.20)] md:p-10">
        <p className="w-fit rounded-full border border-white/14 bg-white/8 px-3 py-1 text-sm font-medium text-[#f0cbb8]">
          {page.eyebrow}
        </p>
        <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-normal md:text-6xl">
          {page.title}
        </h1>
        <p className="mt-6 max-w-3xl text-xl leading-9 text-[#f4eee7]">
          {page.hook}
        </p>
        <p className="mt-6 max-w-3xl text-base leading-8 text-[#e2d7cc]">
          {page.summary}
        </p>
      </section>

      <section className="mx-auto mt-8 grid max-w-7xl gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <article className="rounded-[2rem] border border-[#dfd4c5] bg-[#fffaf4] p-8 shadow-[0_16px_42px_rgba(42,33,28,0.07)]">
          <p className="text-sm font-medium text-[#c15f3c]">故事推进</p>
          <div className="mt-6 space-y-4">
            {page.highlights.map((item, index) => (
              <div
                key={item}
                className="grid gap-4 border-t border-[#dfd4c5] pt-4 md:grid-cols-[72px_1fr]"
              >
                <p className="text-xs font-semibold text-[#c15f3c]">
                  0{index + 1}
                </p>
                <p className="text-base leading-7 text-[#3a3029]">{item}</p>
              </div>
            ))}
          </div>
          {page.href === "/dataset-and-tooling" ? (
            <Link
              href={dataCleaningToolNavItem.href}
              className="mt-6 inline-flex rounded-2xl bg-[#2a211c] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#3a3029]"
            >
              打开数据清洗工具
            </Link>
          ) : null}
        </article>

        <aside className="space-y-6">
          <article className="rounded-[2rem] border border-[#dfd4c5] bg-[#f8f3ea] p-8 shadow-[0_16px_42px_rgba(42,33,28,0.06)]">
            <p className="text-sm font-medium text-[#c15f3c]">画面证据</p>
            <div className="mt-5 space-y-3">
              {page.media.map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-[#dfd4c5] bg-[#fffaf4] px-4 py-3 text-sm leading-6 text-[#665c52]"
                >
                  {item}
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-[2rem] bg-[#2a211c] p-8 text-white shadow-[0_18px_48px_rgba(42,33,28,0.18)]">
            <p className="text-sm font-medium text-[#f0cbb8]">留下的结论</p>
            <p className="mt-4 text-lg leading-8 text-[#f4eee7]">
              {page.takeaway}
            </p>
          </article>
        </aside>
      </section>

      <section className="mx-auto mt-8 max-w-7xl rounded-[2rem] border border-[#dfd4c5] bg-[#fffaf4] p-8 shadow-[0_16px_42px_rgba(42,33,28,0.06)]">
        <div className="flex flex-wrap gap-3">
          {thesisNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-full border px-4 py-2 text-sm transition ${
                item.href === page.href
                  ? "border-[#2a211c] bg-[#2a211c] text-white"
                  : "border-[#dfd4c5] bg-[#f8f3ea] text-[#665c52] hover:border-[#c15f3c] hover:text-[#2a211c]"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-7xl">
        {nextPage ? (
          <Link
            href={nextPage.href}
            className="block rounded-[2rem] bg-[#c15f3c] p-8 text-white shadow-[0_18px_48px_rgba(193,95,60,0.24)] transition hover:-translate-y-1"
          >
            <p className="text-sm font-medium text-[#ffe2d4]">下一页</p>
            <h2 className="mt-3 text-3xl font-semibold">{nextPage.label}</h2>
            <p className="mt-4 max-w-3xl text-base leading-7 text-[#fff4ed]">
              {nextPage.hook}
            </p>
          </Link>
        ) : (
          <Link
            href="/"
            className="block rounded-[2rem] bg-[#2a211c] p-8 text-white shadow-[0_18px_48px_rgba(42,33,28,0.18)]"
          >
            <p className="text-sm font-medium text-[#f0cbb8]">返回首页</p>
            <h2 className="mt-3 text-3xl font-semibold">重新查看整站总览</h2>
            <p className="mt-4 max-w-3xl text-base leading-7 text-[#f4eee7]">
              从首页重新进入论文故事，或在答辩时按需要跳转到任意页面。
            </p>
          </Link>
        )}
      </section>
    </main>
  );
}
