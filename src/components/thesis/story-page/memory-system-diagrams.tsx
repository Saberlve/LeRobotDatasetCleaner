import React from "react";

import {
  type MemorySystemDiagram,
  memorySystemDiagrams,
  systemRows,
} from "./story-data";

export function MemorySystemComparisonTrack() {
  return (
    <section className="mx-auto mt-12 max-w-7xl">
      <style>{`
        .thesis-diagram-font * {
          font-family: "SimSun", "STSong", serif !important;
          font-weight: bold !important;
        }
        .blueprint-bg {
          background-image: 
            linear-gradient(to right, rgba(42, 33, 28, 0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(42, 33, 28, 0.03) 1px, transparent 1px);
          background-size: 20px 20px;
        }
      `}</style>

      <div className="mb-8 flex flex-wrap items-end justify-between gap-6 border-b border-[#d8ccbb] pb-6">
        <div className="max-w-xl">
          <p className="font-mono text-xs font-semibold tracking-widest text-[#c15f3c] uppercase">
            Architectural Comparison Matrix
          </p>
          <h2 className="mt-2 text-3xl font-semibold text-[#2a211c]">
            四种方案架构图解
          </h2>
        </div>
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-[#e7f1df] border border-[#4f8a47]" />
            <span className="text-xs font-medium text-[#665c52]">
              视觉语言词元
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-[#f8ded0] border border-[#c76524]" />
            <span className="text-xs font-medium text-[#665c52]">记忆词元</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-[#e4e4e1] border border-[#9a9a9a]" />
            <span className="text-xs font-medium text-[#665c52]">动作词元</span>
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {memorySystemDiagrams.map((diagram, index) => (
          <MemorySystemBlueprintCard
            key={diagram.badge}
            diagram={diagram}
            columnIndex={index + 1}
          />
        ))}
      </div>
    </section>
  );
}

function MemorySystemBlueprintCard({
  diagram,
  columnIndex,
}: {
  diagram: MemorySystemDiagram;
  columnIndex: number;
}) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-[0.5rem] border border-[#d8ccbb] bg-[#fffaf4] shadow-sm transition-shadow hover:shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#d8ccbb] bg-[#f7f1e8] px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-6 w-12 items-center justify-center rounded-full border border-[#2a211c] bg-[#fffaf4] font-mono text-[0.6rem] font-bold text-[#2a211c]">
            {diagram.badge}
          </span>
          <h3 className="text-base font-bold text-[#1f1a17]">
            {diagram.title}
          </h3>
        </div>
        <span className="font-mono text-[0.65rem] text-[#c15f3c]">
          PATH_MODE: 0{columnIndex}
        </span>
      </div>

      {/* Diagram Section */}
      <div className="blueprint-bg relative flex-1 border-b border-[#d8ccbb] p-6">
        <div className="thesis-diagram-font overflow-x-auto">
          <div className="min-w-[400px]">
            {diagram.badge === "Cache" ? <CacheContextDiagram /> : null}
            {diagram.badge === "Comp" ? <CompressedContextDiagram /> : null}
            {diagram.badge === "Norm" ? <AdaptiveNormDiagramClean /> : null}
            {diagram.badge === "GCA" ? (
              <GatedCrossAttentionDiagramClean />
            ) : null}
          </div>
        </div>
        <p className="mt-6 text-xs italic leading-5 text-[#665c52]/80">
          <span className="mr-1 font-bold">图 {columnIndex}.</span>
          {diagram.caption}
        </p>
      </div>

      {/* Specs / Table Integration */}
      <div className="grid grid-cols-2 divide-x divide-[#d8ccbb] bg-[#fffaf4]">
        {systemRows.map((row) => (
          <div key={row[0]} className="flex flex-col px-4 py-3">
            <span className="text-[0.6rem] font-bold uppercase tracking-wider text-[#c15f3c]/70">
              {row[0]}
            </span>
            <span className="mt-0.5 text-[0.8rem] font-medium text-[#2a211c]">
              {row[columnIndex]}
            </span>
          </div>
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
      <text x={x} y={y} textAnchor="middle" fontSize="22" fill={fill}>
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
        fontSize="22"
        fontStyle="italic"
        fill={fill}
      >
        {match[1]}
        <tspan dy="6" fontSize="16" fontStyle="normal">
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
      fontSize="22"
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
        <p className="mb-1 text-center text-[0.8rem] font-bold uppercase tracking-tight text-[#665c52]">
          {label}
        </p>
      )}
      <div className="flex justify-center">
        {tokens.map((token, index) => (
          <span
            key={`${token}-${index}`}
            className={`-ml-px flex h-9 min-w-10 items-center justify-center border px-2 font-serif text-lg italic first:ml-0 first:rounded-l-[0.25rem] last:rounded-r-[0.25rem] ${toneClass}`}
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
      className={`flex min-h-16 items-center justify-center rounded-[0.25rem] border border-[#2a211c] px-3 py-2 text-center text-base font-bold leading-5 shadow-[2px_2px_0px_rgba(42,33,28,1)] ${className}`}
    >
      {children}
    </div>
  );
}

function DownArrow({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center py-1 text-center">
      {label ? (
        <span className="mb-1 text-[0.8rem] font-bold text-[#665c52]">
          {label}
        </span>
      ) : null}
      <span className="h-6 border-l border-[#2a211c]" />
      <span className="-mt-1.5 font-mono text-base leading-none text-[#2a211c]">
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
    <div className="rounded-[0.5rem] bg-[#fffaf4]/50 p-4 ring-1 ring-[#d8ccbb]">
      <div className="rounded-[0.4rem] border border-[#2a211c] bg-[#dce9f5] p-3 shadow-[3px_3px_0px_rgba(42,33,28,1)]">
        <p className="text-center text-base font-bold">记忆缓存库</p>

        <div className="mt-2 grid grid-cols-[0.8fr_1.2fr] gap-3">
          <div className="flex flex-col justify-center text-[0.9rem] leading-6 font-mono">
            <span>[t-(T-1)k]</span>
            <span className="opacity-50">......</span>
            <span>[t-k]</span>
          </div>
          <div className="rounded-[0.4rem] border border-dashed border-[#397aa3] bg-[#bdd7ec] p-3">
            {[0, 1].map((row) => (
              <div key={row} className="mb-2 flex gap-3 last:mb-0">
                <span className="flex-1 rounded-[0.2rem] border border-[#2a211c] bg-[#fffaf4] py-1 text-center text-[0.85rem] font-bold shadow-[2px_2px_0_rgba(42,33,28,0.2)]">
                  键 (KEY)
                </span>
                <span className="flex-1 rounded-[0.2rem] border border-[#2a211c] bg-[#fffaf4] py-1 text-center text-[0.85rem] font-bold shadow-[2px_2px_0_rgba(42,33,28,0.2)]">
                  值 (VAL)
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-4 px-10 text-center">
        <div className="translate-x-20 translate-y-0">
          <DownArrow label="加载" />
        </div>
        <div className="-translate-x-16 translate-y-0">
          <div className="flex flex-col items-center py-1">
            <span className="mb-1 text-[0.8rem] font-bold text-[#665c52]">
              添加
            </span>
            <span className="font-mono text-base leading-none text-[#2a211c]">
              ^
            </span>
            <span className="-mt-1.5 h-6 border-l border-[#2a211c]" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <TokenGroup
          label="视觉语言词元"
          tone="vision"
          tokens={["v1", "v2", "...", "vm"]}
        />
        <div className="translate-x-1 translate-y-0">
          <TokenGroup
            label="记忆词元"
            tone="memory"
            tokens={["m1", "m2", "...", "mn"]}
          />
        </div>
        <div className="translate-x-0 translate-y-0">
          <TokenGroup
            label="动作词元"
            tone="action"
            tokens={["a1", "a2", "...", "am"]}
          />
        </div>
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
    <div className="rounded-[0.5rem] bg-[#fffaf4]/50 p-4 ring-1 ring-[#d8ccbb]">
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
        <p className="text-center text-sm font-bold leading-tight tracking-tight">
          块级
          <br />
          注意力
        </p>
        <div>
          <p className="mb-1 -translate-x-10 translate-y-0 text-center font-mono text-[0.7rem] text-[#665c52]">
            块级因果掩码
          </p>
          <div className="mx-auto grid w-48 -translate-x-10 translate-y-0 grid-cols-8 border border-[#2a211c]">
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
                  className={`aspect-square border border-[#2a211c]/15 ${color}`}
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
  cellHeight = 36,
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
          fontWeight="900"
          fill="#665c52"
          letterSpacing="0.05em"
        >
          {label}
        </text>
      )}
      {tokens.map((token, index) => {
        const isFirst = index === 0;
        const isLast = index === tokens.length - 1;
        const currentX = x + index * (cellWidth - 1);

        return (
          <g
            key={`${label}-${token}-${index}`}
            transform={`translate(${currentX} ${y})`}
          >
            <rect
              width={cellWidth}
              height={cellHeight}
              rx={isFirst || isLast ? 6 : 0}
              fill={colors.fill}
              stroke={colors.stroke}
              strokeWidth="0.5"
            />
            <SvgTokenText
              token={token}
              x={cellWidth / 2}
              y={cellHeight / 2 + 6}
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
    <div className="rounded-[0.5rem] bg-[#fffaf4]/50 p-4 ring-1 ring-[#d8ccbb]">
      <div className="mx-auto w-full max-w-[500px]">
        <div className="overflow-hidden rounded-[0.25rem] border border-[#2a211c] bg-[#eef5fb] shadow-[3px_3px_0px_rgba(42,33,28,1)]">
          <svg
            className="h-auto w-full text-[#2a211c]"
            viewBox="0 0 620 470"
            role="img"
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
              strokeWidth="1.5"
              markerEnd="url(#clean-norm-arrow)"
            />
            <rect
              x="45"
              y="178"
              width="235"
              height="72"
              rx="6"
              fill="#d6ecd0"
              stroke="#1f5f91"
              strokeWidth="1.5"
            />
            <text
              x="162"
              y="222"
              textAnchor="middle"
              fontSize="28"
              fontWeight="900"
            >
              层归一化
            </text>
            <path
              d="M163 252 V324"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              markerEnd="url(#clean-norm-arrow)"
            />
            <rect
              x="55"
              y="338"
              width="215"
              height="68"
              rx="6"
              fill="#ffeaa1"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <text
              x="162"
              y="381"
              textAnchor="middle"
              fontSize="28"
              fontWeight="900"
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
              strokeWidth="1.5"
              markerEnd="url(#clean-norm-arrow)"
            />
            <rect
              x="350"
              y="132"
              width="240"
              height="66"
              rx="6"
              fill="#fff1df"
              stroke="#efcdb8"
              strokeWidth="1.5"
            />
            <text
              x="470"
              y="173"
              textAnchor="middle"
              fontSize="28"
              fontWeight="900"
            >
              线性投影
            </text>
            <path
              d="M470 200 V226"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              markerEnd="url(#clean-norm-arrow)"
            />
            <rect
              x="330"
              y="240"
              width="125"
              height="60"
              rx="6"
              fill="#fff1df"
              stroke="#efcdb8"
              strokeWidth="1.5"
            />
            <rect
              x="468"
              y="240"
              width="125"
              height="60"
              rx="6"
              fill="#fff1df"
              stroke="#efcdb8"
              strokeWidth="1.5"
            />
            <text
              x="392"
              y="278"
              textAnchor="middle"
              fontSize="22"
              fontWeight="900"
            >
              缩放 (γ)
            </text>
            <text
              x="530"
              y="278"
              textAnchor="middle"
              fontSize="22"
              fontWeight="900"
            >
              平移 (β)
            </text>
            <path
              d="M330 270 H302 V214 H283"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              markerEnd="url(#clean-norm-arrow)"
            />
            <text
              x="450"
              y="342"
              textAnchor="middle"
              fontSize="18"
              fontWeight="900"
              fill="#665c52"
            >
              自适应层归一化
            </text>
            <rect
              x="290"
              y="360"
              width="320"
              height="68"
              rx="4"
              fill="#fffaf4"
              stroke="#b8b1aa"
              strokeDasharray="4 2"
            />
            <text
              x="450"
              y="402"
              textAnchor="middle"
              fontFamily="serif"
              fontSize="22"
              fontStyle="italic"
            >
              â = γ(m) · LN(a) + β(m)
            </text>
          </svg>
        </div>
        <div className="mt-4 grid grid-cols-[1.4fr_0.72fr]">
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
    <div className="rounded-[0.5rem] bg-[#fffaf4]/50 p-4 ring-1 ring-[#d8ccbb]">
      <div className="mx-auto w-full max-w-[500px]">
        <div className="overflow-hidden rounded-[0.25rem] border border-[#2a211c] bg-[#eef5fb] shadow-[3px_3px_0px_rgba(42,33,28,1)]">
          <svg
            className="h-auto w-full text-[#2a211c]"
            viewBox="0 0 620 420"
            role="img"
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
              strokeWidth="1.5"
              markerEnd="url(#clean-gca-arrow)"
            />
            <path
              d="M405 76 V53"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              markerEnd="url(#clean-gca-arrow)"
            />
            <path
              d="M405 165 V134"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              markerEnd="url(#clean-gca-arrow)"
            />
            <path
              d="M405 330 V191"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              markerEnd="url(#clean-gca-arrow)"
            />
            <path
              d="M405 27 V15"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              markerEnd="url(#clean-gca-arrow)"
            />
            <path
              d="M326 330 V208 H194 V185"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              markerEnd="url(#clean-gca-arrow)"
            />
            <path
              d="M159 330 V185"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              markerEnd="url(#clean-gca-arrow)"
            />
            <path
              d="M260 177 H388"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              markerEnd="url(#clean-gca-arrow)"
            />
            <text
              x="260"
              y="202"
              textAnchor="middle"
              fontSize="16"
              fontWeight="900"
              fill="#665c52"
            >
              查询
            </text>
            <text x="115" y="225" fontSize="16" fontWeight="900" fill="#665c52">
              键值
            </text>
            <text x="325" y="170" fontSize="20" fontWeight="bold">
              × γ
            </text>
            <circle
              cx="405"
              cy="40"
              r="10"
              fill="#eef5fb"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <text x="405" y="46" textAnchor="middle" fontSize="18">
              +
            </text>
            <rect
              x="282"
              y="76"
              width="206"
              height="58"
              rx="6"
              fill="#ffeaa1"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <text
              x="385"
              y="112"
              textAnchor="middle"
              fontSize="28"
              fontWeight="900"
            >
              前馈网络
            </text>
            <circle
              cx="405"
              cy="178"
              r="10"
              fill="#eef5fb"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <text x="405" y="184" textAnchor="middle" fontSize="18">
              +
            </text>
            <rect
              x="80"
              y="132"
              width="180"
              height="52"
              rx="6"
              fill="#bed0e7"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <text
              x="170"
              y="167"
              textAnchor="middle"
              fontSize="26"
              fontWeight="900"
            >
              交叉注意力
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
              x="428"
              y="375"
              textAnchor="middle"
              fontSize="16"
              fontWeight="900"
              fill="#665c52"
            >
              动作查询
            </text>

            <SvgTokenRow
              x={92}
              y={315}
              label=""
              tokens={["m1", "m2", "...", "mn"]}
              tone="memory"
              cellWidth={48}
            />
            <text
              x="188"
              y="375"
              textAnchor="middle"
              fontSize="16"
              fontWeight="900"
              fill="#665c52"
            >
              记忆键值
            </text>
          </svg>
        </div>
        <div className="mt-4 grid grid-cols-[1.4fr_0.72fr]">
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
