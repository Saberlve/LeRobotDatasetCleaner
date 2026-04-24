"use client";

import Link from "next/link";
import React, { useMemo, useState } from "react";
import { useFlaggedEpisodes } from "@/context/flagged-episodes-context";
import {
  filterEpisodeIdsByModeKeepingCurrent,
  type EpisodeFilterMode,
} from "@/components/episode-filter-mode";

import type { DatasetDisplayInfo } from "@/app/[org]/[dataset]/[episode]/fetch-data";

interface SidebarProps {
  datasetInfo: DatasetDisplayInfo;
  paginatedEpisodes: number[];
  episodeId: number;
  totalPages: number;
  currentPage: number;
  prevPage: () => void;
  nextPage: () => void;
  episodeFilterMode: EpisodeFilterMode;
  onEpisodeFilterModeChange: (mode: EpisodeFilterMode) => void;
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
  episodeFilterMode,
  onEpisodeFilterModeChange,
  onEpisodeSelect,
}) => {
  const [mobileVisible, setMobileVisible] = useState(false);
  const { flagged, count, toggle } = useFlaggedEpisodes();
  const unflaggedCount = Math.max(0, datasetInfo.total_episodes - count);

  const displayEpisodes = useMemo(() => {
    if (episodeFilterMode === "all") return paginatedEpisodes;
    const allEpisodes = Array.from(
      { length: datasetInfo.total_episodes },
      (_, index) => index,
    );
    return filterEpisodeIdsByModeKeepingCurrent({
      episodes: allEpisodes,
      flagged,
      mode: episodeFilterMode,
      currentEpisode: episodeId,
    }).sort((a, b) => a - b);
  }, [
    datasetInfo.total_episodes,
    paginatedEpisodes,
    episodeFilterMode,
    flagged,
    episodeId,
  ]);

  return (
    <div className="flex z-10 shrink-0">
      <nav
        className={`shrink-0 overflow-y-auto bg-slate-900 p-5 break-words w-60 ${
          mobileVisible ? "block" : "hidden"
        } md:block`}
        aria-label="Sidebar navigation"
      >
        <ul className="text-sm text-slate-300 space-y-0.5">
          <li>Frames: {datasetInfo.total_frames.toLocaleString()}</li>
          <li>Episodes: {datasetInfo.total_episodes.toLocaleString()}</li>
          <li>FPS: {datasetInfo.fps}</li>
        </ul>

        <div className="mt-4 space-y-2">
          <p className="text-sm font-semibold text-slate-200">Episodes:</p>
          <div className="flex flex-wrap gap-1">
            {[
              ["all", "All"] as const,
              ["flagged", `Flagged (${count})`] as const,
              ["unflagged", `Unflagged (${unflaggedCount})`] as const,
            ].map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => onEpisodeFilterModeChange(mode)}
                className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                  episodeFilterMode === mode
                    ? "bg-orange-500/20 text-orange-400 border border-orange-500/40"
                    : "text-slate-500 hover:text-slate-300 border border-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="ml-2 mt-1">
          <ul>
            {displayEpisodes.map((episode) => (
              <li
                key={episode}
                className="mt-0.5 font-mono text-sm flex items-center gap-1"
              >
                {onEpisodeSelect ? (
                  <button
                    onClick={() => onEpisodeSelect(episode)}
                    className={`underline text-left cursor-pointer ${episode === episodeId ? "-ml-1 font-bold text-orange-400" : ""}`}
                  >
                    Episode {episode}
                  </button>
                ) : (
                  <Link
                    href={`./episode_${episode}`}
                    className={`underline ${episode === episodeId ? "-ml-1 font-bold" : ""}`}
                  >
                    Episode {episode}
                  </Link>
                )}
                <button
                  onClick={() => toggle(episode)}
                  className={`text-xs leading-none px-0.5 rounded transition-colors ${
                    flagged.has(episode)
                      ? "text-orange-400 hover:text-orange-300"
                      : "text-slate-600 hover:text-slate-400"
                  }`}
                  title={flagged.has(episode) ? "Unflag" : "Flag"}
                >
                  ⚑
                </button>
              </li>
            ))}
          </ul>

          {episodeFilterMode === "all" && totalPages > 1 && (
            <div className="mt-3 flex items-center text-xs">
              <button
                onClick={prevPage}
                className={`mr-2 rounded bg-slate-800 px-2 py-1 ${
                  currentPage === 1 ? "cursor-not-allowed opacity-50" : ""
                }`}
                disabled={currentPage === 1}
              >
                « Prev
              </button>
              <span className="mr-2 font-mono">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={nextPage}
                className={`rounded bg-slate-800 px-2 py-1 ${
                  currentPage === totalPages
                    ? "cursor-not-allowed opacity-50"
                    : ""
                }`}
                disabled={currentPage === totalPages}
              >
                Next »
              </button>
            </div>
          )}
        </div>
      </nav>

      <button
        className="mx-1 flex items-center opacity-50 hover:opacity-100 focus:outline-none focus:ring-0 md:hidden"
        onClick={() => setMobileVisible((prev) => !prev)}
        title="Toggle sidebar"
      >
        <div className="h-10 w-2 rounded-full bg-slate-500" />
      </button>
    </div>
  );
};

export default Sidebar;
