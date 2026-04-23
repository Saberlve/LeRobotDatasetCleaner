"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const EXAMPLE_DATASETS = [
  "lerobot/high_quality_folding",
  "lerobot/aloha_static_cups_open",
  "imstevenpmwork/thanos_picking_power_gem",
];

export function RemoteDatasetCard() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [status, setStatus] = useState("输入 Hugging Face 数据集 ID 后可直接打开。");

  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      setStatus("输入 Hugging Face 数据集 ID 后可直接打开。");
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `https://huggingface.co/api/quicksearch?q=${encodeURIComponent(query)}&type=dataset`,
          { cache: "no-store" },
        );
        const payload = (await response.json()) as {
          datasets?: Array<{ id?: string }>;
        };
        const nextSuggestions = (payload.datasets ?? [])
          .map((entry) => entry.id?.trim() ?? "")
          .filter(Boolean);

        setSuggestions(nextSuggestions);
        setStatus(
          nextSuggestions.length > 0
            ? `找到 ${nextSuggestions.length} 个候选数据集。`
            : "没有找到匹配的数据集。",
        );
      } catch {
        setSuggestions([]);
        setStatus("远程搜索暂时不可用，请直接输入完整数据集 ID。");
      }
    }, 180);

    return () => window.clearTimeout(timer);
  }, [query]);

  function openDataset(repoId: string) {
    const trimmed = repoId.trim();
    if (!trimmed) {
      return;
    }

    router.push(`/${trimmed}`);
  }

  return (
    <section className="rounded-3xl border border-white/12 bg-slate-950/55 p-6 shadow-2xl shadow-black/20 backdrop-blur">
      <div className="space-y-2">
        <p className="text-sm font-medium tracking-[0.25em] text-cyan-300/85 uppercase">
          Remote
        </p>
        <h2 className="text-2xl font-semibold text-white">远程数据集</h2>
        <p className="text-sm leading-6 text-slate-300">
          输入 Hugging Face 数据集 ID，或从候选结果中直接进入数据集详情页。
        </p>
      </div>

      <form
        className="mt-6 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          openDataset(query);
        }}
      >
        <label className="block text-sm text-slate-200" htmlFor="remote-dataset-input">
          数据集 ID
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="remote-dataset-input"
            className="min-w-0 flex-1 rounded-2xl border border-white/12 bg-slate-900/90 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400"
            placeholder="例如：lerobot/pusht"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button
            className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
            type="submit"
          >
            打开远程数据集
          </button>
        </div>
      </form>

      <div className="mt-4 rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm text-slate-300">
        {status}
      </div>

      {suggestions.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {suggestions.slice(0, 6).map((repoId) => (
            <button
              key={repoId}
              className="rounded-full border border-cyan-400/35 px-3 py-1.5 text-sm text-cyan-100 transition hover:border-cyan-300 hover:bg-cyan-400/10"
              type="button"
              onClick={() => openDataset(repoId)}
            >
              {repoId}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-6">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-slate-400">
          示例数据集
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLE_DATASETS.map((repoId) => (
            <button
              key={repoId}
              className="rounded-full border border-white/12 px-3 py-1.5 text-sm text-slate-200 transition hover:border-cyan-300 hover:text-white"
              type="button"
              onClick={() => openDataset(repoId)}
            >
              {repoId}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
