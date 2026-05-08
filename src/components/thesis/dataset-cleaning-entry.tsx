"use client";

import React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { RecentLocalDatasets } from "@/components/home/recent-local-datasets";

const EXAMPLE_DATASETS = [
  "lerobot/high_quality_folding",
  "lerobot/aloha_static_cups_open",
  "imstevenpmwork/thanos_picking_power_gem",
];

export function DatasetCleaningEntry() {
  const searchParams = useSearchParams();
  const router = useRouter();
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
    if (!target) return;

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
    <main className="mx-auto max-w-7xl px-4 py-12 md:px-6">
      <section className="rounded-lg bg-[#1f1d1a] p-8 text-white shadow-[0_18px_50px_rgba(31,29,26,0.18)] md:p-10">
        <p className="text-sm font-medium text-[#e8c7b5]">工具入口</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-normal md:text-6xl">
          数据清洗工具
        </h1>
        <p className="mt-6 max-w-3xl text-base leading-8 text-[#d8d0c8]">
          打开本地或远程 LeRobot 数据集，检查同步视频、动作曲线、URDF
          回放和筛选后的 episode。
        </p>
      </section>

      <section className="mt-8 rounded-lg border border-[#d8d0c2] bg-[#fffdf8] p-6 shadow-[0_12px_36px_rgba(31,29,26,0.05)] md:p-8">
        <form
          onSubmit={handleSubmit}
          className="grid gap-3 md:grid-cols-[minmax(260px,1fr)_auto_auto_auto]"
        >
          <div ref={containerRef} className="relative">
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => query.trim() && setShowSuggestions(true)}
              placeholder="输入数据集 ID，例如 lerobot/pusht"
              className="w-full rounded-md border border-[#d8d0c2] bg-[#f7f3ea] px-4 py-3 text-base text-[#1f1d1a] outline-none transition focus:border-[#c96442] focus:bg-white"
              autoComplete="off"
            />

            {showSuggestions ? (
              <ul className="absolute right-0 left-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-md border border-[#d8d0c2] bg-[#fffdf8] shadow-xl">
                {isLoading ? (
                  <li className="px-4 py-3 text-sm text-[#655f55]">
                    正在搜索...
                  </li>
                ) : suggestions.length > 0 ? (
                  suggestions.map((id, index) => (
                    <li key={id}>
                      <button
                        type="button"
                        className={`w-full px-4 py-2.5 text-left text-sm transition ${
                          index === activeIndex
                            ? "bg-[#1f1d1a] text-white"
                            : "text-[#1f1d1a] hover:bg-[#f7f3ea]"
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
                  <li className="px-4 py-3 text-sm text-[#655f55]">
                    没找到匹配的数据集，可以直接回车打开你输入的 ID。
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>

          <button
            type="submit"
            className="rounded-md bg-[#1f1d1a] px-4 py-3 text-base font-medium text-white transition hover:bg-[#312e29]"
            disabled={isOpeningLocal}
          >
            {isOpeningLocal ? "正在打开..." : "打开数据集"}
          </button>

          <button
            type="button"
            className="rounded-md border border-[#c96442] bg-[#fffaf2] px-4 py-3 text-base font-medium text-[#9c3f28] transition hover:bg-[#f6e7dc] disabled:cursor-not-allowed disabled:opacity-55"
            onClick={handlePickLocalDataset}
            disabled={isPickingLocal}
          >
            {isPickingLocal ? "正在选择..." : "选择本地文件夹"}
          </button>

          <Link
            href="/explore"
            className="rounded-md border border-[#d8d0c2] bg-[#f7f3ea] px-4 py-3 text-center text-base font-medium text-[#1f1d1a] transition hover:border-[#c96442]"
          >
            浏览 LeRobot 列表
          </Link>
        </form>

        {localMessage ? (
          <p className="mt-4 rounded-md border border-[#c96442]/35 bg-[#f6e7dc] px-4 py-3 text-sm text-[#7c2f1d]">
            {localMessage}
          </p>
        ) : null}

        <div className="mt-8">
          <RecentLocalDatasets />
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {EXAMPLE_DATASETS.map((repoId) => (
            <button
              key={repoId}
              type="button"
              className="rounded-md border border-[#d8d0c2] bg-[#fffaf2] px-3 py-2 text-sm text-[#5f5a52] transition hover:border-[#c96442] hover:text-[#1f1d1a]"
              onClick={() => navigate(repoId)}
            >
              {repoId}
            </button>
          ))}
        </div>
      </section>
    </main>
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
