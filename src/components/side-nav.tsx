"use client";

import Link from "next/link";
import React, { useMemo, useState } from "react";
import { useFlaggedEpisodes } from "@/context/flagged-episodes-context";
import { useClipDrafts } from "@/context/clip-drafts-context";
import { FiScissors, FiHelpCircle } from "react-icons/fi";
import { useBatchResults } from "@/lib/initial-idle/use-batch-results";
import { candidateInterval } from "@/lib/initial-idle/batch";

import type { DatasetDisplayInfo } from "@/app/[org]/[dataset]/[episode]/fetch-data";

interface SidebarProps {
  datasetInfo: DatasetDisplayInfo;
  paginatedEpisodes: number[];
  episodeId: number;
  totalPages: number;
  currentPage: number;
  prevPage: () => void;
  nextPage: () => void;
  showFlaggedOnly: boolean;
  onShowFlaggedOnlyChange: (v: boolean) => void;
  onEpisodeSelect?: (ep: number) => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  datasetInfo,
  paginatedEpisodes,
  episodeId,
  totalPages,
  currentPage,
  prevPage,
  nextPage,
  showFlaggedOnly,
  onShowFlaggedOnlyChange,
  onEpisodeSelect,
}) => {
  const [mobileVisible, setMobileVisible] = useState(false);
  const { flagged, count, toggle } = useFlaggedEpisodes();
  const { drafts } = useClipDrafts();
  const batchResults = useBatchResults(datasetInfo.repoId);
  const markers = useMemo(() => {
    const statuses = new Map<
      number,
      {
        candidate: string[];
        review: string[];
        candidatesDone: boolean;
        reviewsDone: boolean;
      }
    >();
    for (const entry of batchResults) {
      const status = statuses.get(entry.episodeId) ?? {
        candidate: [],
        review: [],
        candidatesDone: true,
        reviewsDone: true,
      };
      const edge = entry.edge === "start" ? "开头" : "结尾";
      if (!entry.error && entry.result?.candidate) {
        status.candidate.push(edge);
        const interval = candidateInterval(entry)!;
        status.candidatesDone &&=
          entry.retained === true ||
          (drafts[entry.episodeId] ?? []).some(
            (draft) =>
              draft.start <= interval.start && draft.end >= interval.end,
          );
      }
      if (entry.error || entry.result?.status === "needs_review") {
        status.review.push(
          entry.error ? `${edge}检测失败：${entry.error}` : edge,
        );
        status.reviewsDone &&= entry.reviewed === true;
      }
      statuses.set(entry.episodeId, status);
    }
    return statuses;
  }, [batchResults, drafts]);

  const displayEpisodes = useMemo(() => {
    if (!showFlaggedOnly || count === 0) return paginatedEpisodes;
    return [...flagged].sort((a, b) => a - b);
  }, [paginatedEpisodes, showFlaggedOnly, flagged, count]);

  return (
    <div className="flex z-10 shrink-0">
      {mobileVisible && (
        <button
          type="button"
          aria-label="关闭导航遮罩"
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setMobileVisible(false)}
        />
      )}
      <nav
        id="episode-sidebar"
        className={`episode-sidebar shrink-0 overflow-y-auto bg-[var(--surface-0)] border-r border-white/5 p-4 break-words w-60 ${
          mobileVisible ? "block" : "hidden"
        } md:block`}
        aria-label="Sidebar navigation"
      >
        <button
          type="button"
          aria-label="关闭 episode 导航"
          className="mb-3 text-sm text-slate-300 md:hidden"
          onClick={() => setMobileVisible(false)}
        >
          关闭 ×
        </button>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-slate-400 tabular">
          <dt className="uppercase tracking-wide text-[10px] text-slate-500">
            Frames
          </dt>
          <dd className="text-slate-200">
            {datasetInfo.total_frames.toLocaleString()}
          </dd>
          <dt className="uppercase tracking-wide text-[10px] text-slate-500">
            Episodes
          </dt>
          <dd className="text-slate-200">
            {datasetInfo.total_episodes.toLocaleString()}
          </dd>
          <dt className="uppercase tracking-wide text-[10px] text-slate-500">
            FPS
          </dt>
          <dd className="text-slate-200">{datasetInfo.fps}</dd>
        </dl>

        <div className="mt-5 flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">
            Episodes
          </p>
          {count > 0 && (
            <button
              onClick={() => onShowFlaggedOnlyChange(!showFlaggedOnly)}
              className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-md transition-colors ${
                showFlaggedOnly
                  ? "bg-orange-500/15 text-orange-300 border border-orange-500/30"
                  : "text-slate-500 hover:text-slate-300 border border-white/10"
              }`}
            >
              Flagged · {count}
            </button>
          )}
        </div>

        <ul className="mt-2 space-y-px">
          {displayEpisodes.map((episode) => {
            const active = episode === episodeId;
            const status = markers.get(episode);
            const badges = (
              <span className="flex shrink-0 items-center gap-1.5">
                {!!status?.candidate.length && (
                  <span
                    title={`候选：${status.candidate.join("、")}${status.candidatesDone ? "（已处理：已加入裁剪或保留）" : "（待加入）"}`}
                    aria-label={`候选：${status.candidate.join("、")}`}
                    className={
                      status.candidatesDone
                        ? "text-cyan-300 opacity-30"
                        : "text-cyan-300"
                    }
                    style={{ opacity: status.candidatesDone ? 0.3 : 1 }}
                    data-complete={status.candidatesDone}
                  >
                    <FiScissors size={14} aria-hidden="true" />
                  </span>
                )}
                {!!status?.review.length && (
                  <span
                    title={`需要复核：${status.review.join("、")}${status.reviewsDone ? "（已复核）" : "（待复核）"}`}
                    aria-label={`需要复核：${status.review.join("、")}`}
                    className={
                      status.reviewsDone
                        ? "text-amber-300 opacity-30"
                        : "text-amber-300"
                    }
                    style={{ opacity: status.reviewsDone ? 0.3 : 1 }}
                    data-complete={status.reviewsDone}
                  >
                    <FiHelpCircle size={14} aria-hidden="true" />
                  </span>
                )}
              </span>
            );
            const itemClass = `group flex items-center justify-between gap-2 px-2 py-1 rounded-md text-xs tabular transition-colors ${
              active
                ? "bg-cyan-400/10 text-cyan-300"
                : "text-slate-300 hover:bg-white/5"
            }`;
            return (
              <li key={episode}>
                {onEpisodeSelect ? (
                  <div className={itemClass}>
                    <button
                      onClick={() => {
                        onEpisodeSelect(episode);
                        setMobileVisible(false);
                      }}
                      className="flex-1 text-left"
                    >
                      Episode {episode}
                    </button>
                    {badges}
                    <button
                      onClick={() => toggle(episode)}
                      className={`text-xs leading-none transition-colors ${
                        flagged.has(episode)
                          ? "text-orange-400 hover:text-orange-300"
                          : "text-slate-600 hover:text-slate-400 opacity-0 group-hover:opacity-100"
                      }`}
                      title={flagged.has(episode) ? "Unflag" : "Flag"}
                    >
                      ⚑
                    </button>
                  </div>
                ) : (
                  <div className={itemClass}>
                    <Link
                      href={`./episode_${episode}`}
                      onClick={() => setMobileVisible(false)}
                      className="flex-1 text-left"
                    >
                      Episode {episode}
                    </Link>
                    {badges}
                    <button
                      onClick={() => toggle(episode)}
                      className={`text-xs leading-none transition-colors ${
                        flagged.has(episode)
                          ? "text-orange-400 hover:text-orange-300"
                          : "text-slate-600 hover:text-slate-400 opacity-0 group-hover:opacity-100"
                      }`}
                      title={flagged.has(episode) ? "Unflag" : "Flag"}
                    >
                      ⚑
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {!showFlaggedOnly && totalPages > 1 && (
          <div className="mt-3 flex items-center gap-2 text-[10px] uppercase tracking-wide text-slate-400">
            <button
              onClick={prevPage}
              className={`px-2 py-1 rounded-md border border-white/10 transition-colors hover:bg-white/5 hover:text-slate-200 ${
                currentPage === 1 ? "cursor-not-allowed opacity-40" : ""
              }`}
              disabled={currentPage === 1}
            >
              ‹ Prev
            </button>
            <span className="tabular text-slate-500">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={nextPage}
              className={`ml-auto px-2 py-1 rounded-md border border-white/10 transition-colors hover:bg-white/5 hover:text-slate-200 ${
                currentPage === totalPages
                  ? "cursor-not-allowed opacity-40"
                  : ""
              }`}
              disabled={currentPage === totalPages}
            >
              Next ›
            </button>
          </div>
        )}
      </nav>

      <button
        className="mx-1 flex items-center opacity-50 hover:opacity-100 focus:outline-none focus:ring-0 md:hidden"
        onClick={() => setMobileVisible((prev) => !prev)}
        title="Toggle sidebar"
        aria-expanded={mobileVisible}
        aria-controls="episode-sidebar"
      >
        <div className="h-10 w-1 rounded-full bg-white/20" />
      </button>
    </div>
  );
};

export default Sidebar;
