import React from "react";
import Link from "next/link";

import {
  type ThesisBenchmarkSection,
  type ThesisBenchmarkTable,
  type ThesisFigure,
  type ThesisPlatformCallout,
  type ThesisStoryPage,
  getNextStoryPage,
  thesisNavItems,
} from "@/content/thesis-site";
import { PlatformProjectLink } from "@/components/thesis/platform-project-link";
import { SamplingComparisonAnimation } from "@/components/thesis/sampling-comparison-animation";
import { SimplerEnvSuccessRateCharts } from "@/components/thesis/success-rate-charts";
import {
  AttentionDistributionChart,
  AttentionOverTimeChart,
} from "@/components/thesis/attention-charts";

type StoryPageProps = {
  page: ThesisStoryPage;
};

type StoryShellProps = StoryPageProps & {
  children: React.ReactNode;
};

type MemoryDiagramStep = {
  label: string;
  detail: string;
  tone: string;
  tokens?: string[];
};

type MemorySystemDiagram = {
  title: string;
  badge: string;
  caption: string;
  steps: MemoryDiagramStep[];
  notes: string[];
};

function MathText({ text }: { text: string }) {
  if (!text) return null;

  // Split by common math symbols and VLA/VLM keywords
  const parts = text.split(
    /(\$N\$|\$t\$|\$\\tau\s+\\le\s+t\$|\$\\tau\$|\$\\le\$|H_t|m_t|o_t|a_t|φ|ℓ|π_θ|π-GCA|ℝ\^N|VLA|VLM|φ\(H_t\))/g,
  );

  return (
    <>
      {parts.map((part, i) => {
        if (part === "$N$")
          return (
            <span key={i} className="font-serif italic">
              N
            </span>
          );
        if (part === "$t$")
          return (
            <span key={i} className="font-serif italic">
              t
            </span>
          );
        if (/^\$\\tau\s+\\le\s+t\$$/.test(part))
          return (
            <span key={i} className="font-serif">
              <span className="italic">τ</span> ≤{" "}
              <span className="italic">t</span>
            </span>
          );
        if (part === "$\\tau$")
          return (
            <span key={i} className="font-serif italic">
              τ
            </span>
          );
        if (part === "$\\le$")
          return (
            <span key={i} className="font-serif">
              ≤
            </span>
          );
        if (part === "H_t")
          return (
            <span key={i} className="font-serif">
              <span className="italic">H</span>
              <sub className="text-[0.7em]">t</sub>
            </span>
          );
        if (part === "m_t")
          return (
            <span key={i} className="font-serif">
              <span className="italic">m</span>
              <sub className="text-[0.7em]">t</sub>
            </span>
          );
        if (part === "o_t")
          return (
            <span key={i} className="font-serif">
              <span className="italic">o</span>
              <sub className="text-[0.7em]">t</sub>
            </span>
          );
        if (part === "a_t")
          return (
            <span key={i} className="font-serif">
              <span className="italic">a</span>
              <sub className="text-[0.7em]">t</sub>
            </span>
          );
        if (part === "φ")
          return (
            <span key={i} className="font-serif italic">
              φ
            </span>
          );
        if (part === "φ(H_t)")
          return (
            <span key={i} className="font-serif">
              <span className="italic">φ</span>(
              <span className="italic">H</span>
              <sub className="text-[0.7em]">t</sub>)
            </span>
          );
        if (part === "ℓ")
          return (
            <span key={i} className="font-serif italic">
              ℓ
            </span>
          );
        if (part === "π_θ")
          return (
            <span key={i} className="font-serif">
              <span className="italic">π</span>
              <sub className="text-[0.7em] italic">θ</sub>
            </span>
          );
        if (part === "π-GCA")
          return (
            <span key={i} className="font-serif">
              <span className="italic">π</span>-GCA
            </span>
          );
        if (part === "ℝ^N")
          return (
            <span key={i} className="font-serif">
              ℝ<sup className="text-[0.7em]">N</sup>
            </span>
          );
        if (part === "VLA" || part === "VLM")
          return (
            <span key={i} className="font-sans font-medium">
              {part}
            </span>
          );
        return part;
      })}
    </>
  );
}

const pageIndex = (href: string) =>
  Math.max(
    0,
    thesisNavItems.findIndex((item) => item.href === href),
  );

const pageNumber = (href: string) =>
  String(pageIndex(href) + 1).padStart(2, "0");

const methodStages = [
  {
    title: "从当前观测提取信息",
    detail:
      "输入序列末尾添加 N 个可学习的词元，通过 VLM 的因果注意力机制，将当前观测信息写入固定长度的记忆词元。",
  },
  {
    title: "历史信息的时序聚合",
    detail:
      "双层 Transformer 对历史的记忆词元进行时序聚合，采用块级因果注意力，进一步抽象历史信息。",
  },
  {
    title: "历史信息的注入",
    detail:
      "通过门控交叉注意力，将压缩后的历史信息注入动作专家，生成记忆增强后的动作。",
  },
];

const systemRows = [
  ["注入位置", "VLM 前缀", "VLM 前缀", "VLM 内部 LayerNorm", "动作专家"],
  ["记忆形式", "历史 token", "压缩 N 词元", "压缩后生成 γβ", "压缩 N 词元"],
  ["序列长度", "显著增长", "固定 N", "不变", "不变"],
  ["训练成本", "高", "中", "低", "低"],
  ["改 VLM 骨干", "否", "否", "是", "否"],
  ["与图像通道", "同池竞争", "同池竞争", "改归一化", "独立并行"],
  ["捷径风险", "中", "高", "低", "低"],
];

const memorySystemDiagrams: MemorySystemDiagram[] = [
  {
    title: "缓存上下文记忆",
    badge: "Cache",
    caption:
      "历史 moment token 的 KV 状态直接接到下一步 VLM 前缀里，路径最短，但上下文随窗口变长。",
    steps: [
      {
        label: "当前观测",
        detail: "图像 + 语言输入",
        tone: "bg-[#dfeff1]",
        tokens: ["Frame t", "Prompt"],
      },
      {
        label: "VLM Prefix",
        detail: "生成 moment block",
        tone: "bg-[#9fcad2]",
        tokens: ["m1", "m2", "m3", "m4"],
      },
      {
        label: "KV Cache",
        detail: "HistoryCache 滚动保存",
        tone: "bg-[#fff7be]",
        tokens: ["K/V", "K/V", "K/V"],
      },
      {
        label: "动作专家",
        detail: "读取扩展前缀",
        tone: "bg-[#dbe9d5]",
        tokens: ["a_t"],
      },
    ],
    notes: ["历史以 prefix cache 形式保留", "序列长度随缓存窗口增长"],
  },
  {
    title: "压缩式上下文记忆",
    badge: "Comp",
    caption:
      "先抽取每步 moment tokens，再用轻量 MemoryModule 聚合成固定数量 Memory Tokens。",
    steps: [
      {
        label: "Moment Tokens",
        detail: "每帧末尾学习词元",
        tone: "bg-[#dfeff1]",
        tokens: ["m_t-3", "m_t-2", "m_t-1", "m_t"],
      },
      {
        label: "History Matrix",
        detail: "T x N 拼接",
        tone: "bg-[#f1e5d8]",
        tokens: ["T", "N"],
      },
      {
        label: "MemoryModule",
        detail: "块级因果聚合",
        tone: "bg-[#fff7be]",
        tokens: ["RMS", "Attn", "MLP"],
      },
      {
        label: "Memory Tokens",
        detail: "固定 N 个压缩词元",
        tone: "bg-[#dbe9d5]",
        tokens: ["M1", "M2", "M3", "M4"],
      },
    ],
    notes: [
      "长度固定，训练成本低于直接缓存",
      "仍容易与图像语言 token 同池竞争",
    ],
  },
  {
    title: "自适应归一化",
    badge: "Norm",
    caption:
      "记忆不作为额外上下文参与竞争，而是转成调制向量，改变模型内部层的归一化输出。",
    steps: [
      {
        label: "Memory Tokens",
        detail: "历史压缩表示",
        tone: "bg-[#dfeff1]",
        tokens: ["M1", "M2", "M3", "M4"],
      },
      {
        label: "Memory Attn",
        detail: "得到 modulation",
        tone: "bg-[#fff7be]",
        tokens: ["q", "k", "v"],
      },
      {
        label: "Adaptive Norm",
        detail: "生成 scale / shift",
        tone: "bg-[#f3d8c7]",
        tokens: ["γ", "β"],
      },
      {
        label: "模型内部层",
        detail: "调制 hidden states",
        tone: "bg-[#dbe9d5]",
        tokens: ["LayerNorm"],
      },
    ],
    notes: ["推理序列长度不增加", "注入点绑定到底层 Gemma 层结构"],
  },
  {
    title: "门控交叉注意力",
    badge: "GCA",
    caption:
      "动作专家隐藏状态查询压缩记忆，再用小门控残差注入，让记忆通道与 VLM 主路径解耦。",
    steps: [
      {
        label: "HistoryCache",
        detail: "按 episode / stride 取历史",
        tone: "bg-[#dfeff1]",
        tokens: ["t-3k", "t-2k", "t-k"],
      },
      {
        label: "MemoryModule",
        detail: "块级因果 Transformer",
        tone: "bg-[#fff7be]",
        tokens: ["RoPE", "KV", "Mask"],
      },
      {
        label: "Gated Cross Attention",
        detail: "动作专家查询记忆",
        tone: "bg-[#f3d8c7]",
        tokens: ["Q_action", "K_mem", "V_mem"],
      },
      {
        label: "动作专家",
        detail: "gate * memory residual",
        tone: "bg-[#dbe9d5]",
        tokens: ["a_t"],
      },
    ],
    notes: ["不改 VLM 主干输入通道", "后注入降低注意力捷径风险"],
  },
];

const contributionRows = [
  ["方法", "POMDP 压缩 + 三步走 GCA", "Ch2"],
  ["实验", "SimplerEnv 64.6% / RMBench 20.0%", "Ch3.1-3.3"],
  ["洞察", "注意力捷径现象 + 后注入原则", "Ch3.4"],
  ["工程", "数据、训练、评测一体化平台", "Ch4"],
];

const nextSteps = [
  "多模态记忆：视觉、触觉和语言联合压缩。",
  "长时记忆：面向小时级 episode 的分层压缩。",
  "平台扩展：接入更多机器人机型与评测基准。",
];

export function StoryPage({ page }: StoryPageProps) {
  if (page.href === "/why-memory") return <ProblemPage page={page} />;
  if (page.href === "/method") return <MethodPage page={page} />;
  if (page.href === "/memory-systems") return <SystemsPage page={page} />;
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

function MethodPage({ page }: StoryPageProps) {
  const [architectureFigure, ...remainingFigures] = page.figures ?? [];
  const stageEnglish = ["Extract", "Aggregate", "Inject"] as const;

  return (
    <StoryShell page={page}>
      <section className="mx-auto max-w-7xl">
        <PageKicker page={page} label="方法结构" />
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-start">
          <div>
            <h1 className="max-w-xl text-3xl font-semibold leading-snug text-[#1f1a17] md:text-4xl">
              {page.title}
            </h1>
            <p className="mt-4 max-w-xl text-lg leading-8 text-[#3a3029]">
              <MathText text={page.hook} />
            </p>
          </div>
          <p className="max-w-2xl text-base leading-7 text-[#665c52] lg:pt-2">
            <MathText text={page.summary} />
          </p>
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-7xl">
        <div className="rounded-[1.5rem] border border-[#d8ccbb] bg-[#fffaf4] p-5 md:p-7">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-end">
            <div>
              <p className="text-sm font-medium text-[#c15f3c]">
                形式化 · 策略建模对比
              </p>
              <h2 className="mt-2 text-2xl font-semibold leading-snug text-[#1f1a17]">
                记忆=巧妙压缩的历史上下文
              </h2>
            </div>
          </div>

          <div className="mx-auto mt-6 grid max-w-6xl gap-4">
            <article className="min-w-0 rounded-[1rem] border border-[#e6dccb] bg-[#fbf4eb] p-4 md:p-5">
              <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-3 text-center">
                <div>
                  <h3 className="text-lg font-semibold text-[#1f1a17]">
                    压缩函数建模
                  </h3>
                  <p className="mt-1 font-mono text-[0.62rem] uppercase tracking-[0.2em] text-[#a89a8b]">
                    From history to memory
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <div className="rounded-[0.85rem] bg-[#f1e5d8] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-[0.16em] text-[#8a7565]">
                      完整交互历史
                    </p>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ead0bf] px-2.5 py-0.5 text-[0.65rem] font-medium text-[#9b3826]">
                      <span aria-hidden="true" className="font-bold">
                        ✕
                      </span>
                      容易上下文爆炸
                    </span>
                  </div>
                  <div className="mt-3 overflow-x-auto pb-1 font-serif text-xl leading-relaxed text-[#3a2e25] md:text-[1.55rem]">
                    <span className="whitespace-nowrap">
                      <span className="italic">H</span>
                      <sub className="text-[0.62em]">t</sub>
                      <span className="mx-2">=</span>
                      <span>(</span>
                      <span className="italic">o</span>
                      <sub className="text-[0.62em]">1</sub>
                      <span>,&thinsp;</span>
                      <span className="italic">o</span>
                      <sub className="text-[0.62em]">2</sub>
                      <span>,&thinsp;…,&thinsp;</span>
                      <span className="italic">o</span>
                      <sub className="text-[0.62em]">t</sub>
                      <span>)</span>
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-[#7a6354]">
                    长度 |<span className="font-serif italic">H</span>
                    <sub className="text-[0.7em]">t</sub>| 随时间步{" "}
                    <span className="font-serif italic">t</span>{" "}
                    线性增长，序列上下文很快超出 VLA 窗口。
                  </p>
                </div>

                <div className="rounded-[0.85rem] border border-[#efcdb8] bg-[#fffaf4] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#c15f3c]">
                      固定长度的压缩历史
                    </p>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fbe2d2] px-2.5 py-0.5 text-[0.65rem] font-medium text-[#c15f3c]">
                      <span aria-hidden="true" className="font-bold">
                        ✓
                      </span>
                      本文采用
                    </span>
                  </div>
                  <div className="mt-3 overflow-x-auto pb-1 font-serif text-xl leading-relaxed text-[#1f1a17] md:text-[1.55rem]">
                    <span className="whitespace-nowrap">
                      <span className="rounded-md bg-[#fbe2d2] px-1.5 py-0.5 italic">
                        m
                      </span>
                      <sub className="text-[0.62em]">t</sub>
                      <span className="mx-2">=</span>
                      <span className="italic">φ</span>
                      <span>(</span>
                      <span className="italic">H</span>
                      <sub className="text-[0.62em]">t</sub>
                      <span>)</span>
                      <span className="mx-2">∈</span>
                      <span>ℝ</span>
                      <sup className="text-[0.62em]">N*D</sup>
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-[#665c52]">
                    通过学习压缩函数{" "}
                    <span className="font-serif italic">φ</span>
                    ，只保留历史上下文中的关键信息，输出固定长度的记忆状态{" "}
                  </p>
                </div>
              </div>
            </article>

            <article className="min-w-0 rounded-[1rem] border border-[#e6dccb] bg-[#fbf4eb] p-4 md:p-5">
              <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-3 text-center">
                <div>
                  <h3 className="text-lg font-semibold text-[#1f1a17]">
                    带有记忆的VLA建模
                  </h3>
                  <p className="mt-1 font-mono text-[0.62rem] uppercase tracking-[0.2em] text-[#a89a8b]">
                    From memory to action
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <div className="rounded-[0.85rem] bg-[#f1e5d8] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-[0.16em] text-[#8a7565]">
                      无记忆
                    </p>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ead0bf] px-2.5 py-0.5 text-[0.65rem] font-medium text-[#9b3826]">
                      <span aria-hidden="true" className="font-bold">
                        ✕
                      </span>
                      历史缺失
                    </span>
                  </div>
                  <div className="mt-3 overflow-x-auto pb-1 font-serif text-[1.55rem] leading-relaxed text-[#3a2e25]">
                    <span className="whitespace-nowrap">
                      <span className="italic">a</span>
                      <sub className="text-[0.62em]">t</sub>
                      <span className="mx-2">∼</span>
                      <span className="italic">π</span>
                      <sub className="text-[0.62em] italic">θ</sub>
                      <span>(·</span>
                      <span className="mx-1.5">|</span>
                      <span className="italic">o</span>
                      <sub className="text-[0.62em]">t</sub>
                      <span>,&thinsp;</span>
                      <span className="italic">ℓ</span>
                      <span>)</span>
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-[#7a6354]">
                    模型只看当前观测{" "}
                    <span className="font-serif italic">o</span>
                    <sub className="text-[0.7em]">t</sub> 与语言指令{" "}
                    <span className="font-serif italic">ℓ</span>
                    ；对于相同画面会给出相同动作。
                  </p>
                </div>

                <div className="rounded-[0.85rem] border border-[#efcdb8] bg-[#fffaf4] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#c15f3c]">
                      带记忆
                    </p>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fbe2d2] px-2.5 py-0.5 text-[0.65rem] font-medium text-[#c15f3c]">
                      <span aria-hidden="true" className="font-bold">
                        ✓
                      </span>
                      本文采用
                    </span>
                  </div>
                  <div className="mt-3 overflow-x-auto pb-1 font-serif text-[1.55rem] leading-relaxed text-[#1f1a17]">
                    <span className="whitespace-nowrap">
                      <span className="italic">a</span>
                      <sub className="text-[0.62em]">t</sub>
                      <span className="mx-2">∼</span>
                      <span className="italic">π</span>
                      <sub className="text-[0.62em] italic">θ</sub>
                      <span>(·</span>
                      <span className="mx-1.5">|</span>
                      <span className="rounded-md bg-[#fbe2d2] px-1.5 py-0.5 italic">
                        m
                      </span>
                      <sub className="text-[0.62em]">t</sub>
                      <span>,&thinsp;</span>
                      <span className="italic">o</span>
                      <sub className="text-[0.62em]">t</sub>
                      <span>,&thinsp;</span>
                      <span className="italic">ℓ</span>
                      <span>)</span>
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-[#665c52]">
                    在观察之外引入压缩记忆{" "}
                    <span className="font-serif italic">m</span>
                    <sub className="text-[0.7em]">t</sub>
                    ；同一画面模型可以根据不同历史产生不同动作。
                  </p>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-7xl">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-sm font-medium text-[#c15f3c]">
            记忆系统的三个关键步骤
          </p>
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.22em] text-[#a89a8b]">
            Extract · Aggregate · Inject
          </p>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {methodStages.map((stage, index) => (
            <article
              key={stage.title}
              className="rounded-[1.25rem] bg-[#2a211c] p-6 text-[#f4eee7]"
            >
              <div className="flex items-baseline justify-between">
                <p className="font-mono text-xs text-[#f0cbb8]">0{index + 1}</p>
                <p className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-[#a89a8b]">
                  {stageEnglish[index]}
                </p>
              </div>
              <h2 className="mt-6 text-2xl font-semibold text-[#fffaf4]">
                {stage.title}
              </h2>
              <p className="mt-4 text-sm leading-7 text-[#d8ccc0]">
                {stage.detail}
              </p>
            </article>
          ))}
        </div>
      </section>

      {architectureFigure ? (
        <section className="mx-auto mt-8 grid max-w-7xl gap-5 lg:grid-cols-[minmax(0,0.72fr)_minmax(18rem,0.28fr)] lg:items-start">
          <figure className="overflow-hidden rounded-[1.5rem] border border-[#d8ccbb] bg-[#fffaf4]">
            <div className="flex flex-wrap items-baseline justify-between gap-3 px-6 pt-6">
              <p className="text-sm font-medium text-[#c15f3c]">
                {architectureFigure.title}
              </p>
              <p className="font-mono text-[0.65rem] uppercase tracking-[0.22em] text-[#a89a8b]">
                Architecture
              </p>
            </div>
            {architectureFigure.src ? (
              <div className="mt-5 bg-[#efe6d9]">
                <img
                  src={architectureFigure.src}
                  alt={architectureFigure.title}
                  className="block h-auto w-full object-contain"
                />
              </div>
            ) : null}
            <figcaption className="border-t border-[#d8ccbb] px-6 py-4">
              <p className="text-sm leading-7 text-[#665c52]">
                {architectureFigure.caption}
              </p>
            </figcaption>
          </figure>

          <aside className="rounded-[1.5rem] border border-[#d8ccbb] bg-[#fffaf4] p-5">
            <p className="text-sm font-medium text-[#c15f3c]">系统流程</p>
            <div className="mt-4 grid gap-0">
              {page.highlights.map((item, index) => (
                <article
                  key={item}
                  className="border-t border-[#d8ccbb] py-4 text-sm leading-7 text-[#3a3029]"
                >
                  <span className="mb-2 block text-xs font-semibold text-[#c15f3c]">
                    0{index + 1}
                  </span>
                  {item}
                </article>
              ))}
            </div>
          </aside>
        </section>
      ) : null}

      <section className="mx-auto mt-8 grid max-w-7xl gap-5 lg:grid-cols-2">
        <article className="rounded-[1.5rem] border border-[#d8ccbb] bg-[#fffaf4] p-5">
          <p className="text-sm font-medium text-[#c15f3c]">
            实现细节 · 块级因果掩码
          </p>
          <div className="mt-5">
            <BlockCausalMaskDiagram />
          </div>
        </article>
        <article className="rounded-[1.5rem] border border-[#d8ccbb] bg-[#fffaf4] p-5">
          <p className="text-sm font-medium text-[#c15f3c]">
            实现细节 · 连续回合采样
          </p>
          <div className="mt-5">
            <SamplingComparisonAnimation />
          </div>
        </article>
      </section>

      <FigureEvidence page={{ ...page, figures: remainingFigures }} />
      <BenchmarkTables tables={page.benchmarkTables} />
      <PlatformCallout platform={page.platform} />
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
                      key={`${row[0]}-${cell}`}
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

function MemorySystemDiagramGrid() {
  return (
    <section className="mx-auto mt-8 max-w-7xl border-y border-[#d8ccbb] py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[#c15f3c]">
            四种 memory 接入路径
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-[#2a211c]">
            从历史保存到动作注入
          </h2>
        </div>
        <p className="max-w-xl text-sm leading-7 text-[#665c52]">
          每张图只画一条真实代码路径：缓存什么、在哪里压缩、最后如何进入动作预测。
        </p>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        {memorySystemDiagrams.map((diagram) => (
          <MemorySystemDiagramCard key={diagram.badge} diagram={diagram} />
        ))}
      </div>
    </section>
  );
}

function MemorySystemDiagramCard({
  diagram,
}: {
  diagram: MemorySystemDiagram;
}) {
  return (
    <article className="overflow-hidden rounded-[1.5rem] border border-[#d8ccbb] bg-[#f7f1e8] p-5 text-[#2a211c] shadow-[0_18px_45px_rgba(42,33,28,0.06)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-[0.45rem] border border-[#2a211c] bg-[#fffaf4] px-2.5 py-1 font-mono text-[0.65rem] font-semibold">
              {diagram.badge}
            </span>
            <h3 className="text-lg font-semibold text-[#1f1a17]">
              {diagram.title}
            </h3>
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#665c52]">
            {diagram.caption}
          </p>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto pb-1">
        <div className="min-w-[430px]">
          {diagram.badge === "Cache" ? <CacheContextDiagram /> : null}
          {diagram.badge === "Comp" ? <CompressedContextDiagram /> : null}
          {diagram.badge === "Norm" ? <AdaptiveNormDiagramClean /> : null}
          {diagram.badge === "GCA" ? <GatedCrossAttentionDiagramClean /> : null}
        </div>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {diagram.notes.map((note, index) => (
          <p
            key={note}
            className="rounded-[0.75rem] border border-[#e6dccb] bg-[#fffaf4] px-3 py-2 text-xs leading-5 text-[#665c52]"
          >
            <span className="mr-2 font-mono text-[#c15f3c]">0{index + 1}</span>
            {note}
          </p>
        ))}
      </div>
    </article>
  );
}

function TokenGroup({
  label,
  tokens,
  tone,
}: {
  label: string;
  tokens: string[];
  tone: "vision" | "memory" | "action";
}) {
  const toneClass =
    tone === "vision"
      ? "border-[#4f8a47] bg-[#e7f1df] text-[#20361c]"
      : tone === "memory"
        ? "border-[#c76524] bg-[#f8ded0] text-[#4a2615]"
        : "border-[#9a9a9a] bg-[#e4e4e1] text-[#33302c]";

  return (
    <div>
      <p className="mb-1 text-center text-xs font-semibold text-[#3a3029]">
        {label}
      </p>
      <div className="flex justify-center">
        {tokens.map((token) => (
          <span
            key={token}
            className={`-ml-px flex h-9 min-w-10 items-center justify-center border px-2 font-serif text-lg italic first:ml-0 first:rounded-l-[0.6rem] last:rounded-r-[0.6rem] ${toneClass}`}
          >
            {token}
          </span>
        ))}
      </div>
    </div>
  );
}

function ModuleBox({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex min-h-24 items-center justify-center rounded-[0.75rem] border-2 border-[#2a211c] px-3 py-4 text-center text-xl font-semibold leading-7 ${className}`}
    >
      {children}
    </div>
  );
}

function DownArrow({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center py-2 text-center">
      {label ? (
        <span className="mb-1 text-sm font-medium text-[#3a3029]">{label}</span>
      ) : null}
      <span className="h-8 border-l-2 border-[#2a211c]" />
      <span className="-mt-1 font-mono text-xl leading-none text-[#2a211c]">
        v
      </span>
    </div>
  );
}

function OutputActionTokens() {
  return (
    <div className="flex flex-col items-center">
      <TokenGroup
        label="增强后的动作词元"
        tone="action"
        tokens={["a′1", "a′2", "...", "a′m"]}
      />
    </div>
  );
}

function CacheContextDiagram() {
  return (
    <div className="rounded-[1rem] bg-[#fffaf4] p-4">
      <div className="rounded-[1rem] border-2 border-[#2a211c] bg-[#dce9f5] p-4">
        <p className="text-center text-xl font-semibold">记忆缓存库</p>
        <p className="text-center font-mono text-xs text-[#665c52]">
          HistoryCache / KV Cache
        </p>
        <div className="mt-3 grid grid-cols-[0.9fr_1.5fr] gap-3">
          <div className="flex flex-col justify-center text-base leading-7">
            <span>记忆t-(T-1)k</span>
            <span>......</span>
            <span>记忆t-k</span>
          </div>
          <div className="rounded-[0.9rem] border-2 border-dashed border-[#397aa3] bg-[#bdd7ec] p-3">
            {[0, 1].map((row) => (
              <div key={row} className="mb-2 flex gap-3 last:mb-0">
                <span className="rounded-[0.35rem] border-2 border-[#2a211c] bg-[#fffaf4] px-5 py-1 text-lg shadow-[0_3px_0_rgba(42,33,28,0.22)]">
                  键
                </span>
                <span className="rounded-[0.35rem] border-2 border-[#2a211c] bg-[#fffaf4] px-5 py-1 text-lg shadow-[0_3px_0_rgba(42,33,28,0.22)]">
                  值
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-5 px-12 text-center">
        <DownArrow label="加载" />
        <div className="flex flex-col items-center py-2">
          <span className="mb-1 text-sm font-medium text-[#3a3029]">添加</span>
          <span className="font-mono text-xl leading-none text-[#2a211c]">
            ^
          </span>
          <span className="-mt-1 h-8 border-l-2 border-[#2a211c]" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TokenGroup
          label="视觉语言词元"
          tone="vision"
          tokens={["v1", "v2", "...", "vm"]}
        />
        <TokenGroup
          label="记忆词元"
          tone="memory"
          tokens={["m1", "m2", "...", "mn"]}
        />
      </div>
      <div className="mt-4 grid grid-cols-[1fr_1fr_0.85fr]">
        <ModuleBox className="rounded-r-none bg-[#e8f0f8]">
          视觉语言模型
        </ModuleBox>
        <ModuleBox className="rounded-none bg-[#dce9f5]">
          拼接记忆缓存
        </ModuleBox>
        <ModuleBox className="rounded-l-none bg-[#fbefdd]">动作专家</ModuleBox>
      </div>
      <DownArrow />
      <OutputActionTokens />
    </div>
  );
}

function CompressedContextDiagram() {
  return (
    <div className="rounded-[1rem] bg-[#fffaf4] p-4">
      <div className="grid grid-cols-2 gap-4">
        <TokenGroup
          label="视觉语言词元"
          tone="vision"
          tokens={["v1", "v2", "...", "vm"]}
        />
        <TokenGroup
          label="记忆词元"
          tone="memory"
          tokens={["m1", "m2", "...", "mn"]}
        />
      </div>
      <DownArrow />
      <div className="grid grid-cols-[1fr_1fr_0.9fr] gap-0">
        <TokenGroup label="" tone="vision" tokens={["v1", "v2", "...", "vm"]} />
        <TokenGroup label="" tone="memory" tokens={["m1", "m2", "...", "mn"]} />
        <TokenGroup
          label="动作词元"
          tone="action"
          tokens={["a1", "a2", "..."]}
        />
      </div>
      <div className="mt-4 grid grid-cols-[1.4fr_0.72fr]">
        <ModuleBox className="rounded-r-none bg-[#e8f0f8]">
          视觉语言模型
        </ModuleBox>
        <ModuleBox className="rounded-l-none bg-[#fbefdd]">动作专家</ModuleBox>
      </div>
      <div className="mt-5 grid grid-cols-[70px_1fr] items-center gap-3">
        <p
          aria-label="块级注意力"
          className="text-center text-xl font-semibold leading-8"
        >
          块级
          <br />
          注意力
        </p>
        <div>
          <p className="mb-1 text-center font-mono text-xs text-[#665c52]">
            MemoryModule / block causal mask
          </p>
          <div className="mx-auto grid w-52 grid-cols-8 border border-[#2a211c]/60">
            {Array.from({ length: 64 }).map((_, index) => {
              const row = Math.floor(index / 8);
              const col = index % 8;
              const color =
                row < 3 && col < 3
                  ? "bg-[#dfeee0]"
                  : row >= 3 && row < 6 && col >= 3 && col < 6
                    ? "bg-[#f5d8c9]"
                    : row >= 6
                      ? "bg-[#cfe1ef]"
                      : "bg-[#eeeeeb]";
              return (
                <span
                  key={index}
                  className={`aspect-square border border-[#2a211c]/35 ${color}`}
                />
              );
            })}
          </div>
        </div>
      </div>
      <DownArrow />
      <OutputActionTokens />
    </div>
  );
}

function SvgTokenRow({
  x,
  y,
  label,
  tokens,
  tone,
  cellWidth,
}: {
  x: number;
  y: number;
  label: string;
  tokens: string[];
  tone: "memory" | "action";
  cellWidth: number;
}) {
  const colors =
    tone === "memory"
      ? { fill: "#f8ded0", stroke: "#c76524", text: "#4a2615" }
      : { fill: "#e4e4e1", stroke: "#9a9a9a", text: "#33302c" };

  return (
    <g>
      <text
        x={x + (tokens.length * cellWidth) / 2}
        y={y - 12}
        textAnchor="middle"
        fontSize="15"
        fontWeight="700"
        fill="#3a3029"
      >
        {label}
      </text>
      {tokens.map((token, index) => (
        <g
          key={`${label}-${token}`}
          transform={`translate(${x + index * cellWidth} ${y})`}
        >
          <rect
            width={cellWidth}
            height="38"
            rx={index === 0 || index === tokens.length - 1 ? 10 : 0}
            fill={colors.fill}
            stroke={colors.stroke}
          />
          <text
            x={cellWidth / 2}
            y="25"
            textAnchor="middle"
            fontFamily="serif"
            fontSize="21"
            fontStyle="italic"
            fill={colors.text}
          >
            {token}
          </text>
        </g>
      ))}
    </g>
  );
}

function AdaptiveNormDiagramClean() {
  return (
    <div className="rounded-[1rem] bg-[#fffaf4] p-4">
      <div className="mx-auto w-full max-w-[620px]">
        <div className="overflow-hidden rounded-[0.25rem] bg-[#eef5fb]">
          <svg
            className="h-auto w-full text-[#2a211c]"
            viewBox="0 0 620 470"
            role="img"
            aria-label="自适应归一化模块图"
          >
            <defs>
              <marker
                id="clean-norm-arrow"
                markerHeight="8"
                markerWidth="8"
                orient="auto"
                refX="7"
                refY="4"
              >
                <path d="M0,0 L8,4 L0,8 Z" fill="currentColor" />
              </marker>
            </defs>
            <rect width="620" height="470" fill="#eef5fb" />
            <SvgTokenRow
              x={55}
              y={52}
              label="动作词元"
              tokens={["a1", "a2", "...", "ah"]}
              tone="action"
              cellWidth={54}
            />
            <path
              d="M163 94 V164"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              markerEnd="url(#clean-norm-arrow)"
            />
            <rect
              x="45"
              y="178"
              width="235"
              height="72"
              rx="12"
              fill="#d6ecd0"
              stroke="#1f5f91"
              strokeWidth="2"
            />
            <text
              x="162"
              y="222"
              textAnchor="middle"
              fontSize="28"
              fontWeight="700"
            >
              层归一化
            </text>
            <path
              d="M163 252 V324"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              markerEnd="url(#clean-norm-arrow)"
            />
            <rect
              x="55"
              y="338"
              width="215"
              height="68"
              rx="12"
              fill="#ffeaa1"
              stroke="currentColor"
              strokeWidth="2"
            />
            <text
              x="162"
              y="381"
              textAnchor="middle"
              fontSize="27"
              fontWeight="700"
            >
              前馈网络
            </text>
            <SvgTokenRow
              x={380}
              y={52}
              label="记忆词元"
              tokens={["m1", "m2", "...", "mn"]}
              tone="memory"
              cellWidth={48}
            />
            <path
              d="M470 94 V119"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              markerEnd="url(#clean-norm-arrow)"
            />
            <rect
              x="350"
              y="132"
              width="240"
              height="66"
              rx="10"
              fill="#fff1df"
              stroke="#efcdb8"
              strokeWidth="2"
            />
            <text
              x="470"
              y="173"
              textAnchor="middle"
              fontSize="27"
              fontWeight="700"
            >
              多层感知机
            </text>
            <path
              d="M470 200 V226"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              markerEnd="url(#clean-norm-arrow)"
            />
            <rect
              x="330"
              y="240"
              width="125"
              height="60"
              rx="10"
              fill="#fff1df"
              stroke="#efcdb8"
              strokeWidth="2"
            />
            <rect
              x="468"
              y="240"
              width="125"
              height="60"
              rx="10"
              fill="#fff1df"
              stroke="#efcdb8"
              strokeWidth="2"
            />
            <text
              x="392"
              y="278"
              textAnchor="middle"
              fontSize="23"
              fontWeight="700"
            >
              缩放参数
            </text>
            <text
              x="530"
              y="278"
              textAnchor="middle"
              fontSize="23"
              fontWeight="700"
            >
              平移参数
            </text>
            <path
              d="M330 270 H302 V214 H283"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              markerEnd="url(#clean-norm-arrow)"
            />
            <text
              x="448"
              y="342"
              textAnchor="middle"
              fontSize="17"
              fontWeight="700"
            >
              自适应层归一化公式
            </text>
            <rect
              x="315"
              y="360"
              width="275"
              height="68"
              rx="10"
              fill="#fffaf4"
              stroke="#b8b1aa"
              strokeDasharray="5 5"
            />
            <text
              x="452"
              y="402"
              textAnchor="middle"
              fontFamily="serif"
              fontSize="21"
            >
              â = γ(m) · LN(a) + β(m)
            </text>
          </svg>
        </div>
        <div className="mt-5 grid grid-cols-[1.4fr_0.72fr]">
          <ModuleBox className="rounded-r-none bg-[#e8f0f8]">
            视觉语言模型
          </ModuleBox>
          <ModuleBox className="rounded-l-none bg-[#fbefdd]">
            动作专家
          </ModuleBox>
        </div>
        <DownArrow />
        <OutputActionTokens />
      </div>
    </div>
  );
}

function GatedCrossAttentionDiagramClean() {
  return (
    <div className="rounded-[1rem] bg-[#fffaf4] p-4">
      <div className="mx-auto w-full max-w-[620px]">
        <div className="overflow-hidden rounded-[0.25rem] bg-[#eef5fb]">
          <svg
            className="h-auto w-full text-[#2a211c]"
            viewBox="0 0 620 360"
            role="img"
            aria-label="门控交叉注意力模块图"
          >
            <defs>
              <marker
                id="clean-gca-arrow"
                markerHeight="8"
                markerWidth="8"
                orient="auto"
                refX="7"
                refY="4"
              >
                <path d="M0,0 L8,4 L0,8 Z" fill="currentColor" />
              </marker>
            </defs>
            <rect width="620" height="360" fill="#eef5fb" />
            <path
              d="M92 246 V40 H202"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M215 54 V72"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              markerEnd="url(#clean-gca-arrow)"
            />
            <path
              d="M215 134 V145"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              markerEnd="url(#clean-gca-arrow)"
            />
            <path
              d="M215 173 V236"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              markerEnd="url(#clean-gca-arrow)"
            />
            <path
              d="M208 246 V188 H426 V165"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              markerEnd="url(#clean-gca-arrow)"
            />
            <path
              d="M456 246 V165"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              markerEnd="url(#clean-gca-arrow)"
            />
            <path
              d="M360 157 H232"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              markerEnd="url(#clean-gca-arrow)"
            />
            <text x="298" y="182" fontSize="15" fontWeight="700">
              查询
            </text>
            <text x="482" y="205" fontSize="15" fontWeight="700">
              键值
            </text>
            <text x="295" y="150" fontSize="18">
              × γ
            </text>
            <circle
              cx="215"
              cy="40"
              r="13"
              fill="#eef5fb"
              stroke="currentColor"
              strokeWidth="2"
            />
            <text x="215" y="47" textAnchor="middle" fontSize="22">
              +
            </text>
            <rect
              x="132"
              y="76"
              width="206"
              height="58"
              rx="12"
              fill="#ffeaa1"
              stroke="currentColor"
              strokeWidth="2"
            />
            <text
              x="235"
              y="112"
              textAnchor="middle"
              fontSize="28"
              fontWeight="700"
            >
              前馈网络
            </text>
            <circle
              cx="215"
              cy="158"
              r="13"
              fill="#eef5fb"
              stroke="currentColor"
              strokeWidth="2"
            />
            <text x="215" y="165" textAnchor="middle" fontSize="22">
              +
            </text>
            <rect
              x="360"
              y="112"
              width="180"
              height="52"
              rx="12"
              fill="#bed0e7"
              stroke="currentColor"
              strokeWidth="2"
            />
            <text
              x="450"
              y="147"
              textAnchor="middle"
              fontSize="27"
              fontWeight="700"
            >
              交叉注意力
            </text>
            {["a1", "a2", "...", "ah"].map((token, index) => (
              <g
                key={`gca-action-${token}`}
                transform={`translate(${105 + index * 54} 246)`}
              >
                <rect
                  width="54"
                  height="38"
                  rx={index === 0 || index === 3 ? 10 : 0}
                  fill="#e4e4e1"
                  stroke="#9a9a9a"
                />
                <text
                  x="27"
                  y="25"
                  textAnchor="middle"
                  fontFamily="serif"
                  fontSize="21"
                  fontStyle="italic"
                  fill="#33302c"
                >
                  {token}
                </text>
              </g>
            ))}
            <text
              x="213"
              y="306"
              textAnchor="middle"
              fontSize="15"
              fontWeight="700"
            >
              动作词元
            </text>
            {["m1", "m2", "...", "mn"].map((token, index) => (
              <g
                key={`gca-memory-${token}`}
                transform={`translate(${365 + index * 48} 246)`}
              >
                <rect
                  width="48"
                  height="38"
                  rx={index === 0 || index === 3 ? 10 : 0}
                  fill="#f8ded0"
                  stroke="#c76524"
                />
                <text
                  x="24"
                  y="25"
                  textAnchor="middle"
                  fontFamily="serif"
                  fontSize="21"
                  fontStyle="italic"
                  fill="#4a2615"
                >
                  {token}
                </text>
              </g>
            ))}
            <text
              x="461"
              y="306"
              textAnchor="middle"
              fontSize="15"
              fontWeight="700"
            >
              记忆词元
            </text>
            <text
              x="310"
              y="336"
              textAnchor="middle"
              fontFamily="monospace"
              fontSize="13"
              fill="#665c52"
            >
              Gated Cross Attention
            </text>
            <text x="-999" y="-999">
              查询：动作词元。键值：记忆词元。memory residual gate
            </text>
          </svg>
        </div>
        <div className="mt-5 grid grid-cols-[1.4fr_0.72fr]">
          <ModuleBox className="rounded-r-none bg-[#e8f0f8]">
            视觉语言模型
          </ModuleBox>
          <ModuleBox className="rounded-l-none bg-[#fbefdd]">
            动作专家
          </ModuleBox>
        </div>
        <DownArrow />
        <OutputActionTokens />
      </div>
    </div>
  );
}

function AdaptiveNormDiagram() {
  return (
    <div className="overflow-x-auto rounded-[1rem] bg-[#fffaf4] p-4">
      <div className="mx-auto w-[600px] shrink-0">
        <div className="relative h-[430px] overflow-hidden rounded-[0.25rem] bg-[#eef5fb] p-4">
          <svg
            className="pointer-events-none absolute inset-0 z-0 h-full w-full text-[#2a211c]"
            viewBox="0 0 600 430"
            role="img"
            aria-label="自适应归一化模块连线"
          >
            <defs>
              <marker
                id="norm-arrow"
                markerHeight="8"
                markerWidth="8"
                orient="auto"
                refX="7"
                refY="4"
              >
                <path d="M0,0 L8,4 L0,8 Z" fill="currentColor" />
              </marker>
            </defs>
            <path
              d="M165 86 V162"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              markerEnd="url(#norm-arrow)"
            />
            <path
              d="M165 242 V312"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              markerEnd="url(#norm-arrow)"
            />
            <path
              d="M460 86 V113"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              markerEnd="url(#norm-arrow)"
            />
            <path
              d="M460 191 V214"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              markerEnd="url(#norm-arrow)"
            />
            <path
              d="M320 249 H283 V209 H282"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              markerEnd="url(#norm-arrow)"
            />
          </svg>

          <div className="absolute left-[3.75rem] top-5 z-10 w-[13rem]">
            <TokenGroup
              label="动作词元"
              tone="action"
              tokens={["a1", "a2", "...", "ah"]}
            />
          </div>

          <ModuleBox className="absolute left-[3.1rem] top-[10.9rem] z-10 !min-h-16 w-[14.4rem] border-[#1f5f91] bg-[#d6ecd0] text-lg">
            层归一化
          </ModuleBox>

          <ModuleBox className="absolute left-[4.35rem] top-[20.2rem] z-10 !min-h-16 w-[12.5rem] bg-[#ffeaa1] text-lg">
            前馈网络
          </ModuleBox>

          <div className="absolute right-[2.2rem] top-5 z-10 w-[13rem]">
            <TokenGroup
              label="记忆词元"
              tone="memory"
              tokens={["m1", "m2", "...", "mn"]}
            />
          </div>

          <ModuleBox className="absolute right-[1.9rem] top-[7.45rem] z-10 !min-h-16 w-[15rem] border-[#efcdb8] bg-[#fff1df] text-lg">
            多层感知机
          </ModuleBox>

          <div className="absolute right-[1.2rem] top-[13.9rem] z-10 grid w-[16.3rem] grid-cols-2 gap-2">
            <ModuleBox className="!min-h-12 border-[#efcdb8] bg-[#fff1df] py-2 text-base">
              缩放参数
            </ModuleBox>
            <ModuleBox className="!min-h-12 border-[#efcdb8] bg-[#fff1df] py-2 text-base">
              平移参数
            </ModuleBox>
          </div>

          <div className="absolute bottom-7 right-[1.5rem] z-10 w-[17rem]">
            <p className="mb-3 text-center text-sm font-semibold text-[#3a3029]">
              自适应层归一化公式
            </p>
            <div className="rounded-[0.75rem] border border-dashed border-[#b8b1aa] bg-[#fffaf4] px-4 py-3 text-center font-serif text-lg">
              a&#770; = γ(m) · LN(a) + β(m)
            </div>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-[1.4fr_0.72fr]">
          <ModuleBox className="rounded-r-none bg-[#e8f0f8]">
            视觉语言模型
          </ModuleBox>
          <ModuleBox className="rounded-l-none bg-[#fbefdd]">
            动作专家
          </ModuleBox>
        </div>
        <DownArrow />
        <OutputActionTokens />
      </div>
    </div>
  );
}

function GatedCrossAttentionDiagram() {
  return (
    <div className="overflow-x-auto rounded-[1rem] bg-[#fffaf4] p-4">
      <div className="mx-auto w-[600px] shrink-0">
        <div className="relative h-[360px] overflow-hidden rounded-[0.25rem] bg-[#eef5fb] p-4">
          <svg
            className="pointer-events-none absolute inset-0 z-0 h-full w-full text-[#2a211c]"
            viewBox="0 0 600 360"
            role="img"
            aria-label="门控交叉注意力模块连线"
          >
            <defs>
              <marker
                id="gca-arrow"
                markerHeight="8"
                markerWidth="8"
                orient="auto"
                refX="7"
                refY="4"
              >
                <path d="M0,0 L8,4 L0,8 Z" fill="currentColor" />
              </marker>
            </defs>
            <path
              d="M78 270 V46 H174"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M185 48 V68"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              markerEnd="url(#gca-arrow)"
            />
            <path
              d="M185 143 V157"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              markerEnd="url(#gca-arrow)"
            />
            <path
              d="M185 177 V244"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              markerEnd="url(#gca-arrow)"
            />
            <path
              d="M205 244 V216 H365"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              markerEnd="url(#gca-arrow)"
            />
            <path
              d="M456 244 V202"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              markerEnd="url(#gca-arrow)"
            />
            <path
              d="M368 166 H205"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              markerEnd="url(#gca-arrow)"
            />
            <text
              x="280"
              y="207"
              fill="currentColor"
              fontSize="14"
              fontWeight="600"
            >
              查询
            </text>
            <text
              x="468"
              y="221"
              fill="currentColor"
              fontSize="14"
              fontWeight="600"
            >
              键值
            </text>
            <text x="266" y="156" fill="currentColor" fontSize="18">
              × γ
            </text>
          </svg>

          <span className="absolute left-[10.72rem] top-[2.05rem] z-20 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#2a211c] bg-[#eef5fb] text-lg leading-none">
            +
          </span>

          <ModuleBox className="absolute left-[6.9rem] top-[4.25rem] z-10 !min-h-16 w-[12rem] bg-[#ffeaa1] text-lg">
            前馈网络
          </ModuleBox>

          <span className="absolute left-[10.72rem] top-[9.65rem] z-20 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#2a211c] bg-[#eef5fb] text-lg leading-none">
            +
          </span>

          <div className="absolute left-[5.8rem] top-[15.5rem] z-10 w-[13.5rem]">
            <TokenGroup
              label="动作词元"
              tone="action"
              tokens={["a1", "a2", "...", "ah"]}
            />
          </div>

          <ModuleBox className="absolute right-[3.8rem] top-[7.9rem] z-10 !min-h-16 w-[11.5rem] bg-[#bed0e7] text-lg">
            交叉注意力
          </ModuleBox>

          <div className="absolute right-[2.9rem] top-[15.5rem] z-10 w-[13.5rem]">
            <TokenGroup
              label="记忆词元"
              tone="memory"
              tokens={["m1", "m2", "...", "mn"]}
            />
          </div>

          <p className="absolute bottom-2 left-1/2 -translate-x-1/2 font-mono text-xs text-[#665c52]">
            Gated Cross Attention
          </p>
          <div className="sr-only">
            查询：动作词元。键值：记忆词元。memory residual gate
          </div>
        </div>
        <div className="mt-5 grid grid-cols-[1.4fr_0.72fr]">
          <ModuleBox className="rounded-r-none bg-[#e8f0f8]">
            视觉语言模型
          </ModuleBox>
          <ModuleBox className="rounded-l-none bg-[#fbefdd]">
            动作专家
          </ModuleBox>
        </div>
        <DownArrow />
        <OutputActionTokens />
      </div>
    </div>
  );
}

function ResultsPage({ page }: StoryPageProps) {
  return (
    <StoryShell page={page}>
      <section className="mx-auto max-w-7xl">
        <PageKicker page={page} label="主结果实验" />
        <div className="mt-7 grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h1 className="text-4xl font-semibold leading-tight tracking-normal text-[#1f1a17] md:text-5xl">
              {page.title}
            </h1>
            <p className="mt-6 text-xl leading-9 text-[#3a3029]">
              <MathText text={page.hook} />
            </p>
          </div>
          <p className="border-y border-[#d8ccbb] py-6 text-base leading-8 text-[#665c52]">
            <MathText text={page.summary} />
          </p>
        </div>
      </section>

      <div className="mx-auto mt-10 grid max-w-7xl gap-8">
        {page.benchmarkSections?.map((section) => (
          <BenchmarkSection key={section.name} section={section} />
        ))}
      </div>

      <section className="mx-auto mt-8 max-w-7xl rounded-[1.5rem] border border-[#d8ccbb] bg-[#fffaf4] p-5">
        <p className="text-sm font-medium text-[#c15f3c]">
          ACONE 双臂真机 · 迁移性快报
        </p>
        <p className="mt-4 text-xl font-semibold leading-9 text-[#2a211c]">
          14 维关节中 12 维 RMSE &lt; 0.1，仅夹爪开合维度仍有改进空间。
        </p>
      </section>

      <SplitNarrative page={page} label="关键线索" />
      <PlatformCallout platform={page.platform} />
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
            <p className="mt-6 text-xl leading-9 text-[#3a3029]">
              <MathText text={page.hook} />
            </p>
          </div>
          <div className="border-y border-[#d8ccbb] py-7">
            <p className="text-base leading-8 text-[#665c52]">
              <MathText text={page.summary} />
            </p>
          </div>
        </div>
      </section>

      <BenchmarkTables tables={page.benchmarkTables} />

      <section className="mx-auto mt-12 grid max-w-7xl gap-8 lg:grid-cols-2">
        <article className="rounded-[1.5rem] border border-[#d8ccbb] bg-[#fffaf4] p-6 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="text-sm font-medium text-[#c15f3c]">
              机制剖析 · 注意力分布
            </p>
            <p className="font-mono text-[0.6rem] uppercase tracking-widest text-[#a89a8b]">
              Figure 3-7
            </p>
          </div>
          <h3 className="mt-4 text-xl font-bold text-[#2a211c]">
            注意力捷径：Comp 方案的偏移
          </h3>
          <p className="mt-2 text-sm leading-7 text-[#665c52]">
            将记忆词元放在 VLM
            前缀时，动作专家倾向于直接从中读取压缩后的历史信息，而大幅减少对当前视觉观测的关注。
          </p>
          <div className="mt-8">
            <AttentionDistributionChart />
          </div>
        </article>

        <article className="rounded-[1.5rem] border border-[#d8ccbb] bg-[#fffaf4] p-6 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="text-sm font-medium text-[#c15f3c]">
              机制剖析 · 时序稳定性
            </p>
            <p className="font-mono text-[0.6rem] uppercase tracking-widest text-[#a89a8b]">
              Figure 3-8
            </p>
          </div>
          <h3 className="mt-4 text-xl font-bold text-[#2a211c]">
            捷径现象在整个 Episode 中持续存在
          </h3>
          <p className="mt-2 text-sm leading-7 text-[#665c52]">
            记忆注意力始终稳定在 87% 至
            92%，说明捷径不是单帧偶然现象，而是结构性偏移，会导致模型忽略环境变化。
          </p>
          <div className="mt-8">
            <AttentionOverTimeChart />
          </div>
        </article>
      </section>

      <FigureEvidence page={page} />
      <SplitNarrative page={page} label="关键线索" />
      <PlatformCallout platform={page.platform} />
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
            <MathText text={item} />
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
      className={`overflow-hidden rounded-[1rem] border border-[#d8ccbb] bg-[#fffaf4] ${
        figure.layout === "wide" ? "lg:col-span-2" : ""
      }`}
    >
      <div className="bg-[#efe6d9] p-2">
        {figure.src ? (
          <img
            src={figure.src}
            alt={figure.title}
            className={`w-full rounded-[0.75rem] object-contain ${
              figure.layout === "wide"
                ? "max-h-[360px]"
                : figure.layout === "portrait"
                  ? "max-h-[560px]"
                  : "max-h-[300px]"
            }`}
          />
        ) : null}
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
  );
}

function BenchmarkSection({ section }: { section: ThesisBenchmarkSection }) {
  return (
    <section className="rounded-[1.5rem] border border-[#d8ccbb] bg-[#fffaf4] p-5">
      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        <div>
          <p className="text-sm font-medium text-[#c15f3c]">{section.kicker}</p>
          <h2 className="mt-3 text-3xl font-semibold text-[#2a211c]">
            {section.name}
          </h2>
        </div>
        <div className="space-y-3 text-base leading-8 text-[#665c52]">
          {section.intro.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </div>
      </div>
      <VideoGrid section={section} />
      {section.name === "SimplerEnv WidowX" && <SimplerEnvSuccessRateCharts />}
      {section.table ? (
        <div className="mt-5">
          <BenchmarkTable table={section.table} />
        </div>
      ) : null}
    </section>
  );
}

function VideoGrid({ section }: { section: ThesisBenchmarkSection }) {
  return (
    <div
      className={`mt-6 grid gap-4 ${
        section.videoColumns === 4 ? "lg:grid-cols-4" : "lg:grid-cols-1"
      }`}
    >
      {section.videos.map((video) => (
        <article
          key={video.src}
          className="overflow-hidden rounded-2xl border border-[#d8ccbb] bg-[#f8f3ea]"
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
          <div className="p-4">
            <p className="font-semibold text-[#2a211c]">{video.title}</p>
            <p className="mt-1 text-sm text-[#665c52]">{video.caption}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

function BenchmarkTables({ tables }: { tables?: ThesisBenchmarkTable[] }) {
  if (!tables?.length) {
    return null;
  }

  return (
    <section className="mx-auto mt-10 max-w-7xl border-t border-[#d8ccbb] pt-6">
      <div className="grid gap-5">
        {tables.map((table) => (
          <BenchmarkTable key={table.title} table={table} />
        ))}
      </div>
    </section>
  );
}

function BenchmarkTable({ table }: { table: ThesisBenchmarkTable }) {
  return (
    <article className="overflow-hidden rounded-[1.5rem] border border-[#d8ccbb] bg-[#fffaf4]">
      <div className="px-5 py-4">
        <h2 className="text-xl font-semibold text-[#2a211c]">{table.title}</h2>
        <p className="mt-2 text-sm leading-7 text-[#665c52]">{table.caption}</p>
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
  );
}

function PlatformCallout({
  platform,
}: {
  platform: ThesisPlatformCallout | undefined;
}) {
  if (!platform) {
    return null;
  }

  return (
    <section className="mx-auto mt-10 max-w-7xl rounded-[1.5rem] border border-[#d8ccbb] bg-[#fffaf4] p-6">
      <div className="grid gap-5 lg:grid-cols-[320px_1fr_auto] lg:items-center">
        <img
          src={platform.image}
          alt={platform.title}
          className="aspect-video w-full rounded-[1rem] border border-[#d8ccbb] bg-[#f8f3ea] object-cover"
        />
        <div>
          <p className="text-sm font-medium text-[#c15f3c]">一体化平台入口</p>
          <h2 className="mt-3 text-2xl font-semibold text-[#2a211c]">
            {platform.title}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[#665c52]">
            {platform.caption}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {platform.chips.map((chip) => (
              <span
                key={chip}
                className="rounded-full border border-[#d8ccbb] bg-[#f8f3ea] px-3 py-1 text-xs text-[#665c52]"
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

function BlockCausalMaskDiagram() {
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
