"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

import { RecentLocalDatasets } from "@/components/home/recent-local-datasets";

type ImportSummary = {
  path: string;
  version: string;
  totalEpisodes: number;
  fps: number;
  robotType: string | null;
};

export function LocalDatasetCard() {
  const router = useRouter();
  const [selectedPath, setSelectedPath] = useState("");
  const [alias, setAlias] = useState("");
  const [summary, setSummary] = useState("");
  const [error, setError] = useState("");
  const [isPicking, setIsPicking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handlePickDirectory() {
    setIsPicking(true);
    setError("");
    setSummary("");

    try {
      const response = await fetch("/api/local-datasets/pick-directory", {
        method: "POST",
      });
      const payload = (await response.json()) as { path?: string | null; error?: string };

      if (!response.ok || !payload.path) {
        throw new Error(payload.error ?? "无法选择本地文件夹");
      }

      setSelectedPath(payload.path);
    } catch (pickError) {
      setError(pickError instanceof Error ? pickError.message : "无法选择本地文件夹");
    } finally {
      setIsPicking(false);
    }
  }

  async function handleImport() {
    if (!selectedPath.trim()) {
      setError("请先选择本地数据集目录。");
      return;
    }

    setIsSubmitting(true);
    setError("");
    setSummary("");

    try {
      const response = await fetch("/api/local-datasets/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          path: selectedPath.trim(),
          alias: alias.trim(),
        }),
      });
      const payload = (await response.json()) as {
        summary?: ImportSummary;
        entryRoute?: string;
        error?: string;
      };

      if (!response.ok || !payload.summary || !payload.entryRoute) {
        throw new Error(payload.error ?? "本地数据集导入失败");
      }

      const nextSummary = payload.summary;
      setSummary(
        `已导入 ${nextSummary.path}（${nextSummary.version}，${nextSummary.totalEpisodes} episodes，${nextSummary.fps} FPS）。`,
      );
      router.push(payload.entryRoute);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "本地数据集导入失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="rounded-3xl border border-white/12 bg-slate-950/55 p-6 shadow-2xl shadow-black/20 backdrop-blur">
      <div className="space-y-2">
        <p className="text-sm font-medium tracking-[0.25em] text-emerald-300/85 uppercase">
          Local
        </p>
        <h2 className="text-2xl font-semibold text-white">本地数据集</h2>
        <p className="text-sm leading-6 text-slate-300">
          选择本机 LeRobot 数据目录，注册后直接跳转到对应的可视化页面。
        </p>
      </div>

      <div className="mt-6 space-y-3">
        <button
          className="w-full rounded-2xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-emerald-300/50"
          type="button"
          onClick={handlePickDirectory}
          disabled={isPicking}
        >
          {isPicking ? "正在打开文件夹选择器..." : "选择本地文件夹"}
        </button>

        <div className="space-y-2">
          <label className="block text-sm text-slate-200" htmlFor="local-dataset-path">
            已选择路径
          </label>
          <input
            id="local-dataset-path"
            className="w-full rounded-2xl border border-white/12 bg-slate-900/90 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-300"
            placeholder="选择文件夹后会自动填入，也可手动粘贴绝对路径"
            value={selectedPath}
            onChange={(event) => setSelectedPath(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm text-slate-200" htmlFor="local-dataset-alias">
            可选别名
          </label>
          <input
            id="local-dataset-alias"
            className="w-full rounded-2xl border border-white/12 bg-slate-900/90 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-300"
            placeholder="例如：straighten_the_box"
            value={alias}
            onChange={(event) => setAlias(event.target.value)}
          />
        </div>

        <button
          className="w-full rounded-2xl border border-emerald-400/45 px-5 py-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500"
          type="button"
          onClick={handleImport}
          disabled={isSubmitting || !selectedPath.trim()}
        >
          {isSubmitting ? "正在导入并打开..." : "导入并打开"}
        </button>

        <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm text-slate-300">
          {summary || error || "支持 v2.0 / v2.1 / v3.0，本地目录需要包含 meta/info.json。"}
        </div>
      </div>

      <RecentLocalDatasets />
    </section>
  );
}
