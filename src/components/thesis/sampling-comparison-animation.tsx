"use client";

import React, { useEffect, useMemo, useState } from "react";

const frames = ["f1", "f2", "f3", "f4", "f5"];
const frameImages = [
  "/images/sampling-demo/1.png",
  "/images/sampling-demo/2.png",
  "/images/sampling-demo/3.png",
  "/images/sampling-demo/4.png",
  "/images/sampling-demo/5.png",
];
const maxPhase = 5;

function windowText(labels: string[]) {
  return `[${labels.join(", ")}]`;
}

function continuousWindow(phase: number) {
  const visible = Math.min(Math.max(phase, 1), frames.length);
  const start = Math.max(0, visible - 4);
  return frames.slice(start, visible);
}

function frameState(
  index: number,
  phase: number,
  mode: "fixed" | "continuous",
) {
  if (mode === "fixed") {
    if (index < 4) {
      return phase >= 1;
    }

    return phase >= 2;
  }

  return index < Math.max(phase, 0);
}

export function SamplingComparisonAnimation() {
  const [phase, setPhase] = useState(0);
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    if (phase >= maxPhase) {
      return;
    }

    const timer = window.setTimeout(() => {
      setPhase((current) => Math.min(maxPhase, current + 1));
    }, 1150);

    return () => window.clearTimeout(timer);
  }, [phase, runId]);

  const continuousSample = useMemo(() => continuousWindow(phase), [phase]);
  const fixedSampleVisible = phase >= 1;
  const continuousSampleVisible = phase >= 1;
  const fixedOutsideVisible = phase >= 2;
  const continuousShifted = phase >= 5;

  function replay() {
    setPhase(0);
    setRunId((current) => current + 1);
  }

  return (
    <div className="grid gap-4" data-sampling-animation={runId}>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={replay}
          className="shrink-0 rounded-full border border-[#c15f3c]/35 bg-[#fffaf4] px-3.5 py-2 text-sm font-medium text-[#9b4328] transition hover:border-[#c15f3c] hover:text-[#2a211c] focus:outline-none focus:ring-2 focus:ring-[#c15f3c]/30"
        >
          采样动画重播
        </button>
      </div>

      <div className="grid gap-3">
        <SamplingBox
          ariaLabel="固定窗口采样动画面板"
          title="固定窗口采样"
          tone="blue"
          phase={phase}
          selectedStart={0}
          selectedLength={4}
          selectedVisible={fixedSampleVisible}
          fixedOutsideVisible={fixedOutsideVisible}
          sample={
            fixedSampleVisible
              ? windowText(frames.slice(0, 4))
              : "一次性构造中"
          }
          sampleActive={fixedSampleVisible}
          mode="fixed"
        />
        <SamplingBox
          ariaLabel="连续回合采样动画面板"
          title="连续回合采样"
          tone="green"
          phase={phase}
          selectedStart={continuousShifted ? 1 : 0}
          selectedLength={Math.min(Math.max(phase, 1), 4)}
          selectedVisible={phase > 0}
          fixedOutsideVisible={false}
          sample={
            continuousSampleVisible ? windowText(continuousSample) : "等待首帧"
          }
          sampleActive={continuousSampleVisible}
          mode="continuous"
        />
      </div>
    </div>
  );
}

function SamplingBox({
  ariaLabel,
  title,
  tone,
  phase,
  selectedStart,
  selectedLength,
  selectedVisible,
  fixedOutsideVisible,
  sample,
  sampleActive,
  mode,
}: {
  ariaLabel: string;
  title: string;
  tone: "blue" | "green";
  phase: number;
  selectedStart: number;
  selectedLength: number;
  selectedVisible: boolean;
  fixedOutsideVisible: boolean;
  sample: string;
  sampleActive: boolean;
  mode: "fixed" | "continuous";
}) {
  const toneClasses =
    tone === "blue"
      ? {
          label: "bg-[#e7f0fb] text-[#235e9f]",
          window: "border-[#2f78ba]/70 bg-[#cfe5fb]/55",
          sample: "border-[#2f78ba] bg-[#dbeeff] text-[#173d66]",
        }
      : {
          label: "bg-[#e6f2df] text-[#3e7628]",
          window: "border-[#518735]/70 bg-[#dceecd]/55",
          sample: "border-[#518735] bg-[#e5f4d8] text-[#31551f]",
        };

  return (
    <section
      aria-label={ariaLabel}
      className="overflow-hidden rounded-[1.1rem] border border-[#d8ccbb] bg-[#f8f3ea]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-[#d8ccbb] px-4 py-3">
        <span
          className={`rounded-full px-3 py-1 text-sm font-semibold ${toneClasses.label}`}
        >
          {title}
        </span>
        {fixedOutsideVisible ? (
          <span className="rounded-full border border-[#df8a45] bg-[#fde4cc] px-3 py-1 text-xs font-semibold text-[#9b4b18]">
            窗口外帧不参与
          </span>
        ) : null}
        {mode === "continuous" && phase >= 5 ? (
          <span className="rounded-full border border-[#df8a45] bg-[#fde4cc] px-3 py-1 text-xs font-semibold text-[#9b4b18]">
            移除第一帧
          </span>
        ) : null}
      </div>

      <div className="grid gap-3 p-4">
        <div className="overflow-x-auto overflow-y-hidden pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="relative min-w-[460px] md:min-w-[520px]">
            <div className="grid grid-cols-5 gap-2">
              {frames.map((frame, index) => {
                const visible = frameState(index, phase, mode);
                const fixedSelected =
                  mode === "fixed" && selectedVisible && index < 4;
                const removed =
                  mode === "continuous" && phase >= 5 && index === 0;
                const outside =
                  mode === "fixed" && fixedOutsideVisible && index === 4;

                return (
                  <div
                    key={`${title}-${frame}`}
                    className={`relative aspect-[1.35] overflow-hidden rounded-[0.7rem] border bg-[#efe6d9] transition duration-300 ${
                      visible
                        ? "translate-y-0 opacity-100"
                        : "translate-y-1 opacity-25"
                    } ${fixedSelected ? "ring-2 ring-[#2f78ba]/45" : ""} ${
                      outside ? "opacity-35 grayscale" : ""
                    } ${removed ? "translate-y-3 opacity-40" : ""} ${
                      outside ? "border-[#df8a45]" : "border-[#d8ccbb]"
                    }`}
                  >
                    <img
                      src={frameImages[index]}
                      alt={`${frame} 采样视频帧`}
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute left-2 top-2 rounded-full bg-[#fffaf4]/90 px-2 py-0.5 font-serif text-xs font-bold italic text-[#2a211c]">
                      {frame}
                    </span>
                  </div>
                );
              })}
            </div>

            <div
              className={`pointer-events-none absolute inset-y-[-0.35rem] rounded-[0.85rem] border-2 border-dashed transition-all duration-500 ${toneClasses.window}`}
              style={{
                left: `calc(${selectedStart} * ((100% - 2rem) / 5 + 0.5rem))`,
                width: `calc(${selectedLength} * ((100% - 2rem) / 5) + ${
                  Math.max(0, selectedLength - 1) * 0.5
                }rem)`,
                opacity: selectedLength > 0 && selectedVisible ? 1 : 0,
              }}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-[0.85rem] border border-[#d8ccbb] bg-[#fffaf4] px-3 py-2">
          <span className="text-xs font-semibold text-[#7a6f64]">训练样本</span>
          <span
            className={`rounded-[0.65rem] border px-3 py-1.5 font-mono text-sm font-semibold transition ${toneClasses.sample} ${
              sampleActive ? "opacity-100" : "opacity-45"
            }`}
          >
            {sample}
          </span>
        </div>
      </div>
    </section>
  );
}
