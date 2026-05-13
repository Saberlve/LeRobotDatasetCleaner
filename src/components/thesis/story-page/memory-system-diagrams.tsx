import React from "react";

import { type MemorySystemDiagram, memorySystemDiagrams } from "./story-data";

export function MemorySystemDiagramGrid() {
  return (
    <section className="mx-auto mt-8 max-w-7xl border-y border-[#d8ccbb] py-6">
      <style>{`
        .thesis-diagram-font * {
          font-family: "SimSun", "STSong", serif !important;
          font-weight: bold !important;
        }
      `}</style>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[#c15f3c]">
            四种记忆接入方式
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-[#2a211c]">
            从历史缓存到动作注入
          </h2>
        </div>
        <p className="max-w-xl text-sm leading-7 text-[#665c52]">
          每个方案对应一条完整的数据流路径：缓存什么、在哪压缩、如何注入动作生成。
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

      <div className="thesis-diagram-font mt-5 overflow-x-auto pb-1">
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

// Token Rendering Helpers
function renderTokenHTML(token: string) {
  if (token === "...") return token;
  const match = token.match(/^([a-zA-Z′]+)([0-9a-z])$/);
  if (match) {
    return (
      <>
        {match[1]}
        <sub className="ml-0.5 text-[0.75em] opacity-85">{match[2]}</sub>
      </>
    );
  }
  return token;
}

function SvgTokenText({
  token,
  x,
  y,
  fill,
}: {
  token: string;
  x: number;
  y: number;
  fill: string;
}) {
  if (token === "...") {
    return (
      <text x={x} y={y} textAnchor="middle" fontSize="18" fill={fill}>
        ...
      </text>
    );
  }
  const match = token.match(/^([a-zA-Z′]+)([0-9a-z])$/);
  if (match) {
    return (
      <text
        x={x}
        y={y}
        textAnchor="middle"
        fontFamily="serif"
        fontSize="21"
        fontStyle="italic"
        fill={fill}
      >
        {match[1]}
        <tspan dy="6" fontSize="13" fontStyle="normal">
          {match[2]}
        </tspan>
      </text>
    );
  }
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fontFamily="serif"
      fontSize="21"
      fontStyle="italic"
      fill={fill}
    >
      {token}
    </text>
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
      {label && (
        <p className="mb-1 text-center text-xs font-semibold text-[#3a3029]">
          {label}
        </p>
      )}
      <div className="flex justify-center">
        {tokens.map((token, index) => (
          <span
            key={`${token}-${index}`}
            className={`-ml-px flex h-9 min-w-10 items-center justify-center border px-2 font-serif text-lg italic first:ml-0 first:rounded-l-[0.6rem] last:rounded-r-[0.6rem] ${toneClass}`}
          >
            {renderTokenHTML(token)}
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
      <div className="grid grid-cols-[1fr_1fr_0.9fr] items-end gap-0">
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
  cellHeight = 40,
}: {
  x: number;
  y: number;
  label: string;
  tokens: string[];
  tone: "vision" | "memory" | "action";
  cellWidth: number;
  cellHeight?: number;
}) {
  const colors =
    tone === "vision"
      ? { fill: "#e7f1df", stroke: "#4f8a47", text: "#20361c" }
      : tone === "memory"
        ? { fill: "#f8ded0", stroke: "#c76524", text: "#4a2615" }
        : { fill: "#e4e4e1", stroke: "#9a9a9a", text: "#33302c" };

  return (
    <g>
      {label && (
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
      )}
      {tokens.map((token, index) => {
        const isFirst = index === 0;
        const isLast = index === tokens.length - 1;
        const currentX = x + index * (cellWidth - 1);

        return (
          <g key={`${label}-${token}-${index}`} transform={`translate(${currentX} ${y})`}>
            <rect
              width={cellWidth}
              height={cellHeight}
              rx={isFirst || isLast ? 10 : 0}
              fill={colors.fill}
              stroke={colors.stroke}
              strokeWidth="1"
            />
            <SvgTokenText
              token={token}
              x={cellWidth / 2}
              y={cellHeight / 2 + 7}
              fill={colors.text}
            />
          </g>
        );
      })}
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
            viewBox="0 0 620 420"
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
            <rect width="620" height="420" fill="#eef5fb" />
            <path
              d="M510 330 V40 H418"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              markerEnd="url(#clean-gca-arrow)"
            />
            <path
              d="M405 76 V53"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              markerEnd="url(#clean-gca-arrow)"
            />
            <path
              d="M405 165 V134"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              markerEnd="url(#clean-gca-arrow)"
            />
            <path
              d="M405 330 V191"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              markerEnd="url(#clean-gca-arrow)"
            />
            <path
              d="M405 27 V15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              markerEnd="url(#clean-gca-arrow)"
            />
            <path
              d="M326 330 V208 H194 V185"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              markerEnd="url(#clean-gca-arrow)"
            />
            <path
              d="M159 330 V185"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              markerEnd="url(#clean-gca-arrow)"
            />
            <path
              d="M260 177 H388"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              markerEnd="url(#clean-gca-arrow)"
            />
            <text x="260" y="202" textAnchor="middle" fontSize="15" fontWeight="700">
              查询
            </text>
            <text x="145" y="225" fontSize="15" fontWeight="700">
              键值
            </text>
            <text x="325" y="170" fontSize="18">
              × γ
            </text>
            <circle
              cx="405"
              cy="40"
              r="13"
              fill="#eef5fb"
              stroke="currentColor"
              strokeWidth="2"
            />
            <text x="405" y="47" textAnchor="middle" fontSize="22">
              +
            </text>
            <rect
              x="282"
              y="76"
              width="206"
              height="58"
              rx="12"
              fill="#ffeaa1"
              stroke="currentColor"
              strokeWidth="2"
            />
            <text
              x="385"
              y="112"
              textAnchor="middle"
              fontSize="28"
              fontWeight="700"
            >
              前馈网络
            </text>
            <circle
              cx="405"
              cy="178"
              r="13"
              fill="#eef5fb"
              stroke="currentColor"
              strokeWidth="2"
            />
            <text x="405" y="185" textAnchor="middle" fontSize="22">
              +
            </text>
            <rect
              x="80"
              y="132"
              width="180"
              height="52"
              rx="12"
              fill="#bed0e7"
              stroke="currentColor"
              strokeWidth="2"
            />
            <text
              x="170"
              y="167"
              textAnchor="middle"
              fontSize="27"
              fontWeight="700"
            >
              交叉注意力
            </text>

            <text
              x={320 + (4 * 54) / 2}
              y={375}
              textAnchor="middle"
              fontSize="15"
              fontWeight="700"
              fill="#3a3029"
            >
              动作词元
            </text>
            <SvgTokenRow
              x={320}
              y={315}
              label=""
              tokens={["a1", "a2", "...", "ah"]}
              tone="action"
              cellWidth={54}
            />

            <text
              x={92 + (4 * 48) / 2}
              y={375}
              textAnchor="middle"
              fontSize="15"
              fontWeight="700"
              fill="#3a3029"
            >
              记忆词元
            </text>
            <SvgTokenRow
              x={92}
              y={315}
              label=""
              tokens={["m1", "m2", "...", "mn"]}
              tone="memory"
              cellWidth={48}
            />

          
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

