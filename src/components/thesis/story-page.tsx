import React from "react";
import Link from "next/link";

import {
  type ThesisStoryPage,
  dataCleaningToolNavItem,
  getNextStoryPage,
  thesisNavItems,
} from "@/content/thesis-site";
import { DatasetCleaningProjectLink } from "@/components/thesis/dataset-cleaning-project-link";

type StoryPageProps = {
  page: ThesisStoryPage;
};

type StoryShellProps = StoryPageProps & {
  children: React.ReactNode;
};

const pageIndex = (href: string) =>
  Math.max(
    0,
    thesisNavItems.findIndex((item) => item.href === href),
  );

const pageNumber = (href: string) =>
  String(pageIndex(href) + 1).padStart(2, "0");

const methodStages = [
  {
    title: "提取",
    detail: "可学习记忆词元在 VLM 末端读取当前观察，不改变骨干路径。",
  },
  {
    title: "聚合",
    detail: "块级因果注意力把滑动窗口历史压成可用的阶段上下文。",
  },
  {
    title: "注入",
    detail: "门控交叉注意力只在动作专家处使用记忆，保持模块解耦。",
  },
];

const systemRows = [
  ["Cache", "直接携带历史", "实现简单", "容易形成注意力捷径"],
  ["Comp", "压缩历史 KV", "平均分接近", "历史仍穿透骨干"],
  ["Norm", "仿射调制隐状态", "部分任务有效", "空间选择性不足"],
  ["GCA", "动作专家处交叉注意力", "结构解耦", "本文最终方案"],
];

const resultTracks = [
  ["训练过程", "loss 曲线", "确认模型真实收敛，而不是只看最终分数。"],
  ["SimplerEnv", "短程与遮挡任务", "用四类任务观察 checkpoint 的整体表现。"],
  ["RMBench", "Swap Blocks", "把强记忆依赖场景单独拿出来验证。"],
  ["ACONE", "真实数据开环测试", "把清洗后的真机轨迹接回论文证据链。"],
];

const contributionRows = [
  ["方法", "GCA 记忆注入机制"],
  ["训练", "连续回合采样"],
  ["系统", "可插拔 VLM-VLA 记忆架构"],
  ["应用", "真实数据清洗与评测入口"],
];

export function StoryPage({ page }: StoryPageProps) {
  if (page.href === "/why-memory") return <ProblemPage page={page} />;
  if (page.href === "/method") return <MethodPage page={page} />;
  if (page.href === "/memory-systems") return <SystemsPage page={page} />;
  if (page.href === "/dataset-and-tooling") return <DatasetPage page={page} />;
  if (page.href === "/results") return <ResultsPage page={page} />;
  if (page.href === "/analysis") return <AnalysisPage page={page} />;
  return <ConclusionPage page={page} />;
}

function StoryShell({ page, children }: StoryShellProps) {
  const nextPage = getNextStoryPage(page.href);

  return (
    <main className="bg-[#f8f3ea] px-4 py-8 text-[#2a211c] md:px-6 md:py-10">
      {children}
      <ChapterNav page={page} />
      <NextPageLink nextPage={nextPage} />
    </main>
  );
}

function PageKicker({ page, label }: { page: ThesisStoryPage; label: string }) {
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

function ProblemPage({ page }: StoryPageProps) {
  return (
    <StoryShell page={page}>
      <section className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
        <div className="pb-4">
          <PageKicker page={page} label="问题现场" />
          <h1 className="mt-8 max-w-2xl text-4xl font-semibold leading-tight tracking-normal text-[#1f1a17] md:text-6xl">
            {page.title}
          </h1>
          <p className="mt-6 max-w-xl text-2xl leading-10 text-[#3a3029]">
            {page.hook}
          </p>
        </div>
        <div className="border-y border-[#d8ccbb] py-6">
          <p className="max-w-3xl text-base leading-8 text-[#665c52]">
            {page.summary}
          </p>
        </div>
      </section>

      <section className="mx-auto mt-12 max-w-7xl">
        <p className="text-sm font-medium text-[#c15f3c]">故事推进</p>
        <div className="mt-5 grid gap-0 border-y border-[#d8ccbb] lg:grid-cols-3">
          {page.highlights.map((item, index) => (
            <article
              key={item}
              className="border-b border-[#d8ccbb] py-6 lg:border-b-0 lg:border-r lg:px-6 lg:first:pl-0 lg:last:border-r-0"
            >
              <p className="text-sm font-semibold text-[#c15f3c]">
                0{index + 1}
              </p>
              <p className="mt-4 text-base leading-8 text-[#3a3029]">{item}</p>
            </article>
          ))}
        </div>
      </section>

      <QuietConclusion page={page} />
    </StoryShell>
  );
}

function MethodPage({ page }: StoryPageProps) {
  return (
    <StoryShell page={page}>
      <section className="mx-auto max-w-7xl">
        <PageKicker page={page} label="方法结构" />
        <div className="mt-8 grid gap-8 lg:grid-cols-[360px_1fr]">
          <div>
            <h1 className="max-w-lg text-4xl font-semibold leading-tight tracking-normal text-[#1f1a17] md:text-5xl">
              {page.title}
            </h1>
            <p className="mt-6 text-xl leading-9 text-[#3a3029]">{page.hook}</p>
            <p className="mt-5 text-base leading-8 text-[#665c52]">
              {page.summary}
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-[#d8ccbb] bg-[#fffaf4] p-5">
            <div className="grid gap-4 md:grid-cols-3">
              {methodStages.map((stage, index) => (
                <article
                  key={stage.title}
                  className="min-h-56 rounded-[1.25rem] bg-[#2a211c] p-5 text-[#f4eee7]"
                >
                  <p className="text-sm text-[#f0cbb8]">0{index + 1}</p>
                  <h2 className="mt-8 text-3xl font-semibold text-[#fffaf4]">
                    {stage.title}
                  </h2>
                  <p className="mt-5 text-sm leading-7 text-[#d8ccc0]">
                    {stage.detail}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <SplitNarrative page={page} label="故事推进" />
      <FigureEvidence page={page} />
      <QuietConclusion page={page} />
    </StoryShell>
  );
}

function SystemsPage({ page }: StoryPageProps) {
  return (
    <StoryShell page={page}>
      <section className="mx-auto max-w-7xl">
        <PageKicker page={page} label="方案矩阵" />
        <div className="mt-7 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <h1 className="text-4xl font-semibold leading-tight tracking-normal text-[#1f1a17] md:text-5xl">
              {page.title}
            </h1>
            <p className="mt-6 text-xl leading-9 text-[#3a3029]">{page.hook}</p>
          </div>
          <p className="border-t border-[#d8ccbb] pt-5 text-base leading-8 text-[#665c52] lg:mt-10">
            {page.summary}
          </p>
        </div>

        <div className="mt-10 overflow-hidden rounded-[1.5rem] border border-[#d8ccbb] bg-[#fffaf4]">
          <div className="grid grid-cols-[0.7fr_1fr_1fr_1.1fr] bg-[#2a211c] px-5 py-4 text-sm font-medium text-[#f4eee7]">
            <span>方案</span>
            <span>历史来源</span>
            <span>优势</span>
            <span>结构风险</span>
          </div>
          {systemRows.map((row) => (
            <div
              key={row[0]}
              className="grid grid-cols-[0.7fr_1fr_1fr_1.1fr] border-t border-[#d8ccbb] px-5 py-5 text-sm leading-6 text-[#3a3029]"
            >
              <span className="font-semibold text-[#c15f3c]">{row[0]}</span>
              <span>{row[1]}</span>
              <span>{row[2]}</span>
              <span>{row[3]}</span>
            </div>
          ))}
        </div>
      </section>

      <FigureEvidence page={page} />
      <SplitNarrative page={page} label="故事推进" />
      <QuietConclusion page={page} />
    </StoryShell>
  );
}

function DatasetPage({ page }: StoryPageProps) {
  return (
    <StoryShell page={page}>
      <section className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_420px]">
        <div>
          <PageKicker page={page} label="真实应用" />
          <h1 className="mt-7 max-w-3xl text-4xl font-semibold leading-tight tracking-normal text-[#1f1a17] md:text-5xl">
            {page.title}
          </h1>
          <p className="mt-6 max-w-3xl text-xl leading-9 text-[#3a3029]">
            {page.hook}
          </p>
          <p className="mt-5 max-w-3xl text-base leading-8 text-[#665c52]">
            {page.summary}
          </p>
        </div>
        <aside className="rounded-[1.5rem] border border-[#d8ccbb] bg-[#fffaf4] p-6">
          <p className="text-sm font-medium text-[#c15f3c]">应用入口</p>
          <p className="mt-4 text-3xl font-semibold leading-tight">
            数据质量先可视化，再进入训练。
          </p>
          <p className="mt-5 text-sm leading-7 text-[#665c52]">
            直接打开 pick_X_times_filterd_twice 数据集，进入查看与清洗。
          </p>
        </aside>
      </section>

      <section className="mx-auto mt-10 max-w-7xl">
        <p className="text-sm font-medium text-[#c15f3c]">故事推进</p>
        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="space-y-3">
            {page.highlights.map((item, index) => (
              <div
                key={item}
                className="grid gap-4 border-t border-[#d8ccbb] py-4 md:grid-cols-[64px_1fr]"
              >
                <span className="font-semibold text-[#c15f3c]">
                  0{index + 1}
                </span>
                <p className="text-base leading-8 text-[#3a3029]">{item}</p>
              </div>
            ))}
          </div>
          <div className="lg:pt-1">
            <DatasetCleaningProjectLink href={dataCleaningToolNavItem.href} />
          </div>
        </div>
      </section>

      <FigureEvidence page={page} />
      <QuietConclusion page={page} />
    </StoryShell>
  );
}

function ResultsPage({ page }: StoryPageProps) {
  return (
    <StoryShell page={page}>
      <section className="mx-auto max-w-7xl">
        <PageKicker page={page} label="结果证据链" />
        <div className="mt-7 grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h1 className="text-4xl font-semibold leading-tight tracking-normal text-[#1f1a17] md:text-5xl">
              {page.title}
            </h1>
            <p className="mt-6 text-xl leading-9 text-[#3a3029]">{page.hook}</p>
          </div>
          <div className="space-y-3">
            {resultTracks.map((track) => (
              <div
                key={track[0]}
                className="grid gap-3 border-t border-[#d8ccbb] py-4 md:grid-cols-[120px_150px_1fr]"
              >
                <span className="font-semibold text-[#c15f3c]">{track[0]}</span>
                <span className="text-[#3a3029]">{track[1]}</span>
                <span className="text-[#665c52]">{track[2]}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <BenchmarkTables page={page} />
      <SplitNarrative page={page} label="故事推进" />
      <QuietConclusion page={page} />
    </StoryShell>
  );
}

function AnalysisPage({ page }: StoryPageProps) {
  return (
    <StoryShell page={page}>
      <section className="mx-auto max-w-7xl">
        <PageKicker page={page} label="机制剖析" />
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1fr]">
          <div className="border-y border-[#d8ccbb] py-7">
            <h1 className="text-4xl font-semibold leading-tight tracking-normal text-[#1f1a17] md:text-5xl">
              {page.title}
            </h1>
            <p className="mt-6 text-xl leading-9 text-[#3a3029]">{page.hook}</p>
          </div>
          <div className="border-y border-[#d8ccbb] py-7">
            <p className="text-base leading-8 text-[#665c52]">{page.summary}</p>
          </div>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          <article className="rounded-[1.5rem] bg-[#fffaf4] p-6 ring-1 ring-[#d8ccbb]">
            <p className="text-sm font-medium text-[#c15f3c]">接近但不等价</p>
            <p className="mt-5 text-2xl font-semibold leading-9">
              Comp 的平均分接近，但历史信息仍会穿透 VLM 层。
            </p>
          </article>
          <article className="rounded-[1.5rem] bg-[#2a211c] p-6 text-[#f4eee7]">
            <p className="text-sm font-medium text-[#f0cbb8]">结构决定边界</p>
            <p className="mt-5 text-2xl font-semibold leading-9 text-[#fffaf4]">
              GCA 把影响限制在动作专家处，因此更适合可插拔记忆。
            </p>
          </article>
        </div>
      </section>

      <SplitNarrative page={page} label="故事推进" />
      <QuietConclusion page={page} />
    </StoryShell>
  );
}

function ConclusionPage({ page }: StoryPageProps) {
  return (
    <StoryShell page={page}>
      <section className="mx-auto max-w-7xl">
        <PageKicker page={page} label="答辩收束" />
        <div className="mt-8 grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h1 className="text-4xl font-semibold leading-tight tracking-normal text-[#1f1a17] md:text-5xl">
              {page.title}
            </h1>
            <p className="mt-6 text-xl leading-9 text-[#3a3029]">{page.hook}</p>
            <p className="mt-5 text-base leading-8 text-[#665c52]">
              {page.summary}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {contributionRows.map((row) => (
              <article
                key={row[0]}
                className="min-h-36 rounded-[1.5rem] border border-[#d8ccbb] bg-[#fffaf4] p-5"
              >
                <p className="text-sm font-medium text-[#c15f3c]">{row[0]}</p>
                <p className="mt-8 text-xl font-semibold leading-8 text-[#2a211c]">
                  {row[1]}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <SplitNarrative page={page} label="故事推进" />
      <QuietConclusion page={page} />
    </StoryShell>
  );
}

function SplitNarrative({
  page,
  label,
}: {
  page: ThesisStoryPage;
  label: string;
}) {
  return (
    <section className="mx-auto mt-12 max-w-7xl">
      <p className="text-sm font-medium text-[#c15f3c]">{label}</p>
      <div className="mt-5 grid gap-x-10 gap-y-0 md:grid-cols-2">
        {page.highlights.map((item, index) => (
          <article
            key={item}
            className="border-t border-[#d8ccbb] py-5 text-base leading-8 text-[#3a3029]"
          >
            <span className="mb-3 block text-sm font-semibold text-[#c15f3c]">
              0{index + 1}
            </span>
            {item}
          </article>
        ))}
      </div>
    </section>
  );
}

function FigureEvidence({ page }: StoryPageProps) {
  if (!page.figures?.length) {
    return null;
  }

  return (
    <section className="mx-auto mt-8 max-w-5xl border-y border-[#d8ccbb] py-5">
      <div className="grid gap-4 lg:grid-cols-2">
        {page.figures.map((figure) => (
          <figure
            key={figure.src}
            className={`overflow-hidden rounded-[1rem] border border-[#d8ccbb] bg-[#fffaf4] ${
              figure.layout === "wide" ? "lg:col-span-2" : ""
            }`}
          >
            <div className="bg-[#efe6d9] p-2">
              <img
                src={figure.src}
                alt={figure.title}
                className={`w-full rounded-[0.75rem] object-contain ${
                  figure.layout === "wide" ? "max-h-[360px]" : "max-h-[300px]"
                }`}
              />
            </div>
            <figcaption className="border-t border-[#d8ccbb] px-4 py-3">
              <p className="text-sm font-semibold leading-6 text-[#2a211c]">
                {figure.title}
              </p>
              <p className="mt-1.5 text-sm leading-6 text-[#665c52]">
                {figure.caption}
              </p>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

function BenchmarkTables({ page }: StoryPageProps) {
  if (!page.benchmarkTables?.length) {
    return null;
  }

  return (
    <section className="mx-auto mt-10 max-w-7xl border-t border-[#d8ccbb] pt-6">
      <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
        <div>
          <p className="text-sm font-medium text-[#c15f3c]">Benchmark 表格</p>
        </div>
        <div className="grid gap-5">
          {page.benchmarkTables.map((table) => (
            <article
              key={table.title}
              className="overflow-hidden rounded-[1.5rem] border border-[#d8ccbb] bg-[#fffaf4]"
            >
              <div className="px-5 py-4">
                <h2 className="text-xl font-semibold text-[#2a211c]">
                  {table.title}
                </h2>
                <p className="mt-2 text-sm leading-7 text-[#665c52]">
                  {table.caption}
                </p>
              </div>
              <div className="overflow-x-auto border-t border-[#d8ccbb]">
                <table className="min-w-[720px] w-full border-collapse text-left text-sm">
                  <thead className="bg-[#2a211c] text-[#f4eee7]">
                    <tr>
                      {table.columns.map((column) => (
                        <th key={column} className="px-5 py-3 font-medium">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row) => (
                      <tr
                        key={row.join("-")}
                        className="border-t border-[#d8ccbb] text-[#3a3029]"
                      >
                        {row.map((cell, index) => (
                          <td
                            key={`${cell}-${index}`}
                            className="px-5 py-4 align-top leading-6"
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
          ))}
        </div>
      </div>
    </section>
  );
}

function QuietConclusion({ page }: StoryPageProps) {
  return (
    <section className="mx-auto mt-10 max-w-7xl rounded-[2rem] bg-[#2a211c] px-6 py-7 text-[#f4eee7] md:px-8">
      <p className="text-sm font-medium text-[#f0cbb8]">留下的结论</p>
      <p className="mt-4 max-w-4xl text-xl font-semibold leading-9 text-[#fffaf4]">
        {page.takeaway}
      </p>
    </section>
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
