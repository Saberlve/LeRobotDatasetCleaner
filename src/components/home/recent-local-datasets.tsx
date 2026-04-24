"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type RecentEntry = {
  repoId: string;
  displayName: string;
  path: string;
  version: string;
  totalEpisodes: number;
  fps: number;
  robotType: string | null;
};

export function RecentLocalDatasets() {
  const router = useRouter();
  const [entries, setEntries] = useState<RecentEntry[]>([]);
  const [status, setStatus] = useState("正在读取最近导入的数据集...");
  const [removingKey, setRemovingKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadEntries() {
      try {
        const response = await fetch("/api/local-datasets/registry", {
          cache: "no-store",
        });
        const payload = (await response.json()) as {
          entries?: RecentEntry[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "最近导入列表读取失败");
        }

        if (cancelled) {
          return;
        }

        const nextEntries = Array.isArray(payload.entries)
          ? payload.entries
          : [];
        setEntries(nextEntries);
        setStatus(nextEntries.length > 0 ? "" : "还没有导入过本地数据集。");
      } catch (error) {
        if (cancelled) {
          return;
        }

        setEntries([]);
        setStatus(
          error instanceof Error ? error.message : "最近导入列表读取失败",
        );
      }
    }

    loadEntries();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRemove(entry: RecentEntry) {
    const confirmed = window.confirm(
      `仅从最近导入移除 ${entry.displayName}，不会删除磁盘文件。`,
    );
    if (!confirmed) return;

    const key = `${entry.repoId}:${entry.path}`;
    setRemovingKey(key);
    setStatus("");

    try {
      const response = await fetch("/api/local-datasets/registry", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repoId: entry.repoId, path: entry.path }),
      });
      const payload = (await response.json()) as {
        removed?: boolean;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "最近导入删除失败");
      }

      setEntries((previous) =>
        previous.filter(
          (item) => item.repoId !== entry.repoId || item.path !== entry.path,
        ),
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "最近导入删除失败");
    } finally {
      setRemovingKey(null);
    }
  }

  return (
    <div className="mt-6 border-t border-white/10 pt-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium uppercase tracking-[0.25em] text-slate-400">
          最近导入
        </h3>
        <span className="text-xs text-slate-500">
          {entries.length > 0 ? `${entries.length} 项` : ""}
        </span>
      </div>

      {status ? (
        <p className="mt-3 rounded-2xl border border-white/8 bg-black/10 px-3 py-3 text-sm text-slate-300">
          {status}
        </p>
      ) : null}

      {entries.length > 0 ? (
        <ul className="mt-3 space-y-3">
          {entries.slice(0, 5).map((entry) => (
            <li
              key={`${entry.repoId}:${entry.path}`}
              className="rounded-2xl border border-white/10 bg-black/10 p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">
                    {entry.displayName}
                  </p>
                  <p className="mt-1 break-all text-xs text-slate-400">
                    {entry.path}
                  </p>
                  <p className="mt-2 text-xs text-slate-300">
                    {entry.version} · {entry.totalEpisodes} episodes ·{" "}
                    {entry.fps} FPS
                    {entry.robotType ? ` · ${entry.robotType}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    className="rounded-xl border border-emerald-400/40 px-3 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-400/10"
                    type="button"
                    onClick={() => router.push(`/${entry.repoId}/episode_0`)}
                  >
                    打开
                  </button>
                  <button
                    aria-label={`删除 ${entry.displayName}`}
                    className="rounded-xl border border-red-400/40 px-3 py-2 text-sm font-medium text-red-100 transition hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                    disabled={removingKey === `${entry.repoId}:${entry.path}`}
                    onClick={() => void handleRemove(entry)}
                  >
                    删除
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
