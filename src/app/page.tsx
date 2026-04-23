"use client";
import React, { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { LocalDatasetCard } from "@/components/home/local-dataset-card";
import { RemoteDatasetCard } from "@/components/home/remote-dataset-card";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  );
}

function HomeInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (process.env.REPO_ID) {
      const episodeN =
        process.env.EPISODES?.split(/\s+/)
          .map((x) => parseInt(x.trim(), 10))
          .filter((x) => !isNaN(x))[0] ?? 0;

      router.push(`/${process.env.REPO_ID}/episode_${episodeN}`);
      return;
    }

    const path = searchParams.get("path");
    if (path) {
      router.push(path);
      return;
    }

    let redirectUrl: string | null = null;
    if (searchParams.get("dataset") && searchParams.get("episode")) {
      redirectUrl = `/${searchParams.get("dataset")}/episode_${searchParams.get("episode")}`;
    } else if (searchParams.get("dataset")) {
      redirectUrl = `/${searchParams.get("dataset")}`;
    }

    if (redirectUrl && searchParams.get("t")) {
      redirectUrl += `?t=${searchParams.get("t")}`;
    }

    if (redirectUrl) {
      router.push(redirectUrl);
      return;
    }
  }, [searchParams, router]);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#031522_0%,#06192b_36%,#0c1d18_100%)] text-white">
      <div className="mx-auto max-w-6xl px-6 py-10 sm:py-14">
        <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.18),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.22),transparent_26%),rgba(2,6,23,0.74)] p-6 shadow-[0_30px_120px_rgba(0,0,0,0.45)] backdrop-blur md:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
            <section className="space-y-5">
              <p className="text-sm font-medium uppercase tracking-[0.35em] text-cyan-300/80">
                LeRobot Dataset Visualizer
              </p>
              <div className="space-y-4">
                <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white md:text-5xl">
                  LeRobot 数据集可视化工具
                </h1>
                <p className="max-w-2xl text-base leading-7 text-slate-200 sm:text-lg">
                  首页现已支持中文入口：你可以直接打开 Hugging Face 远程数据集，也可以导入本地
                  LeRobot 文件夹并跳转到返回的可视化路由。
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
                  <p className="text-sm text-slate-400">远程数据集</p>
                  <p className="mt-2 text-2xl font-semibold text-white">HF Search</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
                  <p className="text-sm text-slate-400">本地导入</p>
                  <p className="mt-2 text-2xl font-semibold text-white">Folder Pick</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
                  <p className="text-sm text-slate-400">最近导入</p>
                  <p className="mt-2 text-2xl font-semibold text-white">Registry</p>
                </div>
              </div>
            </section>

            <section className="rounded-[1.75rem] border border-cyan-400/15 bg-black/20 p-5 text-sm leading-6 text-slate-200">
              <p className="font-medium text-white">入口说明</p>
              <p className="mt-3">
                远程入口会保留原本的 Hugging Face 数据集检索能力。本地入口会调用现有
                `/api/local-datasets/pick-directory`、`/api/local-datasets/register` 与
                `/api/local-datasets/registry`，不新增新的后端协议。
              </p>
              <p className="mt-3">
                如果首页带有 `path`、`dataset`、`episode`、`t` 等旧参数，仍然沿用既有跳转行为。
              </p>
            </section>
          </div>

          <div className="mt-8 grid gap-6 xl:grid-cols-2">
            <RemoteDatasetCard />
            <LocalDatasetCard />
          </div>
        </div>
      </div>
    </main>
  );
}
