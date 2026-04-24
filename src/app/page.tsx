"use client";

import React from "react";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { RecentLocalDatasets } from "@/components/home/recent-local-datasets";

const EXAMPLE_DATASETS = [
  "lerobot/high_quality_folding",
  "lerobot/aloha_static_cups_open",
  "imstevenpmwork/thanos_picking_power_gem",
];

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [isPickingLocal, setIsPickingLocal] = useState(false);
  const [isOpeningLocal, setIsOpeningLocal] = useState(false);
  const [localMessage, setLocalMessage] = useState("");

  useEffect(() => {
    if (process.env.REPO_ID) {
      const episodeN =
        process.env.EPISODES?.split(/\s+/)
          .map((value) => parseInt(value.trim(), 10))
          .filter((value) => !Number.isNaN(value))[0] ?? 0;

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
    }
  }, [router, searchParams]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = 1.5;
    }
  }, []);

  useEffect(() => {
    if (!query.trim() || isLikelyLocalPath(query)) {
      setSuggestions([]);
      setShowSuggestions(false);
      setIsLoading(false);
      setHasFetched(false);
      return;
    }

    setIsLoading(true);
    setHasFetched(false);
    setShowSuggestions(true);

    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `https://huggingface.co/api/quicksearch?q=${encodeURIComponent(query)}&type=dataset`,
          { cache: "no-store" },
        );
        const payload = (await response.json()) as {
          datasets?: Array<{ id?: string }>;
        };
        const ids = (payload.datasets ?? [])
          .map((entry) => entry.id?.trim() ?? "")
          .filter(Boolean);

        setSuggestions(ids);
        setActiveIndex(-1);
      } catch {
        setSuggestions([]);
      } finally {
        setIsLoading(false);
        setHasFetched(true);
      }
    }, 150);

    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const navigate = useCallback(
    (value: string) => {
      setShowSuggestions(false);
      router.push(value);
    },
    [router],
  );

  function handleSubmit(event: { preventDefault: () => void }) {
    event.preventDefault();
    const target =
      activeIndex >= 0 && suggestions[activeIndex]
        ? suggestions[activeIndex]
        : query.trim();
    if (!target) {
      return;
    }

    if (isLikelyLocalPath(target)) {
      void openLocalDataset(target);
      return;
    }

    navigate(target);
  }

  async function handlePickLocalDataset() {
    setIsPickingLocal(true);
    setLocalMessage("");
    setShowSuggestions(false);

    try {
      const response = await fetch("/api/local-datasets/pick-directory", {
        method: "POST",
      });
      const payload = (await response.json()) as {
        path?: string | null;
        error?: string;
      };

      if (!response.ok || !payload.path) {
        throw new Error(payload.error ?? "无法选择本地文件夹");
      }

      setQuery(payload.path);
    } catch (error) {
      setLocalMessage(
        error instanceof Error ? error.message : "无法选择本地文件夹",
      );
    } finally {
      setIsPickingLocal(false);
    }
  }

  async function openLocalDataset(path: string) {
    setIsOpeningLocal(true);
    setLocalMessage("");

    try {
      const response = await fetch("/api/local-datasets/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ path: path.trim(), alias: "" }),
      });
      const payload = (await response.json()) as {
        entryRoute?: string;
        error?: string;
      };

      if (!response.ok || !payload.entryRoute) {
        throw new Error(payload.error ?? "本地数据集导入失败");
      }

      router.push(payload.entryRoute);
    } catch (error) {
      setLocalMessage(
        error instanceof Error ? error.message : "本地数据集导入失败",
      );
    } finally {
      setIsOpeningLocal(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!showSuggestions) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((previous) =>
        previous >= suggestions.length - 1 ? 0 : previous + 1,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((previous) =>
        previous <= 0 ? suggestions.length - 1 : previous - 1,
      );
      return;
    }

    if (event.key === "Escape") {
      setShowSuggestions(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div className="relative min-h-screen w-screen overflow-x-hidden">
      <div className="video-background">
        <video
          ref={videoRef}
          src="https://huggingface.co/datasets/huggingface/documentation-images/resolve/main/lerobot/level2.mp4"
          autoPlay
          muted
          loop
          playsInline
        />
      </div>

      <div className="fixed inset-0 -z-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.30)_0%,rgba(0,0,0,0.82)_100%)]" />

      <main className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-8 text-white">
        <section className="flex min-h-[70vh] flex-col items-center justify-center text-center animate-fade-in-up">
          <h1 className="text-4xl font-bold tracking-tight drop-shadow-lg md:text-5xl">
            LeRobot{" "}
            <span className="bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent">
              Dataset
            </span>{" "}
            Visualizer
          </h1>

          <form
            onSubmit={handleSubmit}
            className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center"
          >
            <div ref={containerRef} className="relative">
              <svg
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-white/40"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
                />
              </svg>

              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => query.trim() && setShowSuggestions(true)}
                placeholder="输入数据集 ID，例如 lerobot/pusht"
                className="w-[min(88vw,420px)] rounded-md border border-white/30 bg-white/10 py-2.5 pr-4 pl-10 text-base text-white shadow-md backdrop-blur-sm transition-colors placeholder:text-white/40 focus:border-sky-400 focus:bg-white/15 focus:outline-none"
                autoComplete="off"
              />

              {showSuggestions ? (
                <ul className="absolute top-full left-0 right-0 z-50 mt-1 max-h-64 overflow-y-auto overflow-hidden rounded-md border border-white/10 bg-slate-900/95 shadow-xl backdrop-blur-sm">
                  {isLoading ? (
                    <li className="flex items-center gap-2.5 px-4 py-3 text-sm text-white/50">
                      <svg
                        className="h-4 w-4 shrink-0 animate-spin"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 0 1 8-8v8H4z"
                        />
                      </svg>
                      正在搜索…
                    </li>
                  ) : suggestions.length > 0 ? (
                    suggestions.map((id, index) => (
                      <li key={id}>
                        <button
                          type="button"
                          className={`w-full px-4 py-2.5 text-left text-sm transition-colors ${
                            index === activeIndex
                              ? "bg-sky-600 text-white"
                              : "text-slate-200 hover:bg-slate-700"
                          }`}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            navigate(id);
                          }}
                          onMouseEnter={() => setActiveIndex(index)}
                        >
                          {id}
                        </button>
                      </li>
                    ))
                  ) : hasFetched ? (
                    <li className="px-4 py-3 text-sm text-white/50">
                      没找到匹配的数据集，可以直接回车打开你输入的 ID。
                    </li>
                  ) : null}
                </ul>
              ) : null}
            </div>

            <button
              type="submit"
              className="rounded-md bg-sky-500 px-4 py-2.5 text-base font-medium shadow-lg shadow-sky-950/40 transition-colors hover:bg-sky-400"
              disabled={isOpeningLocal}
            >
              {isOpeningLocal ? "正在打开..." : "打开数据集"}
            </button>

            <button
              type="button"
              className="rounded-md bg-sky-500 px-4 py-2.5 text-base font-medium shadow-lg shadow-sky-950/40 transition-colors hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-sky-500/50"
              onClick={handlePickLocalDataset}
              disabled={isPickingLocal}
            >
              {isPickingLocal ? "正在选择..." : "选择本地文件夹"}
            </button>

            <Link
              href="/explore"
              className="rounded-md border border-white/20 bg-white/8 px-4 py-2.5 text-base text-white/90 backdrop-blur-sm transition-colors hover:bg-white/14"
            >
              浏览 LeRobot 列表
            </Link>
          </form>

          {localMessage ? (
            <p className="mt-3 max-w-3xl rounded-md border border-red-400/30 bg-red-950/35 px-4 py-2 text-sm text-red-100">
              {localMessage}
            </p>
          ) : null}

          <div className="w-full max-w-3xl">
            <RecentLocalDatasets />
          </div>

          <div className="mt-5 flex max-w-3xl flex-wrap justify-center gap-2">
            {EXAMPLE_DATASETS.map((repoId) => (
              <button
                key={repoId}
                type="button"
                className="rounded-full border border-white/15 bg-black/15 px-3 py-1.5 text-sm text-slate-200 transition-colors hover:border-sky-300 hover:text-white"
                onClick={() => navigate(repoId)}
              >
                {repoId}
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function isLikelyLocalPath(value: string) {
  const trimmed = value.trim();
  return (
    trimmed.startsWith("/") ||
    trimmed.startsWith("~/") ||
    /^[A-Za-z]:[\\/]/.test(trimmed)
  );
}
