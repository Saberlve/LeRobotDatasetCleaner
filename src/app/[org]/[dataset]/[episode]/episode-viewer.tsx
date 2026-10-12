"use client";

import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  lazy,
  Suspense,
} from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { postParentMessageWithParams } from "@/utils/postParentMessage";
import { SimpleVideosPlayer } from "@/components/simple-videos-player";
import PlaybackBar from "@/components/playback-bar";
import { FramePlaybackShortcuts } from "@/components/frame-playback-shortcuts";
import { useEpisodeShortcuts, usePlayShortcut } from "@/lib/playback-shortcuts";
import { ClipControls } from "@/components/clip-controls";
import { IdleBoundaryControls } from "@/components/initial-idle-controls";
import { ClipDraftsProvider } from "@/context/clip-drafts-context";
import { TimeProvider, useTime } from "@/context/time-context";
import { FlaggedEpisodesProvider } from "@/context/flagged-episodes-context";
import {
  AnnotationsProvider,
  useAnnotations,
} from "@/context/annotations-context";
import { AnnotationsPanel } from "@/components/annotations-panel";
import { AnnotationsTimeline } from "@/components/annotations-timeline";
import Sidebar from "@/components/side-nav";
import StatsPanel from "@/components/stats-panel";
import OverviewPanel from "@/components/overview-panel";
import Loading from "@/components/loading-component";
import LocalDoctorPanel from "@/components/local-doctor-panel";
import HfAuthButton from "@/components/hf-auth-button";
import { hasURDFSupport } from "@/lib/so101-robot";
import {
  computeColumnMinMax,
  getEpisodeDataSafe,
  loadAllEpisodeLengthsV3,
  loadAllEpisodeFrameInfo,
  loadCrossEpisodeActionVariance,
  type EpisodeData,
  type ColumnMinMax,
  type EpisodeLengthStats,
  type EpisodeFramesData,
  type CrossEpisodeVarianceData,
} from "./fetch-data";
import { getDatasetVersionAndInfo } from "@/utils/versionUtils";
import { isLocalDatasetRepoId } from "@/utils/localDatasets";
import type { DatasetMetadata } from "@/utils/parquetUtils";

const URDFViewer = lazy(() => import("@/components/urdf-viewer"));
const ActionInsightsPanel = lazy(
  () => import("@/components/action-insights-panel"),
);
const FilteringPanel = lazy(() => import("@/components/filtering-panel"));
// Recharts is ~150KB gz and not above-the-fold (videos render first on the
// Episodes tab). Lazy-load it so the initial chunk can ship faster and
// videos start downloading in parallel with the chart bundle.
const DataRecharts = lazy(() => import("@/components/data-recharts"));

/** The video subtree belongs to the viewer, so changing a keyed review panel
 * moves its DOM host while preserving the browser's loaded media/decoders. */
function VideoMount({ host }: { host: HTMLDivElement }) {
  const mount = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    mount.current?.appendChild(host);
    return () => {
      host.remove();
    };
  }, [host]);
  return <div ref={mount} />;
}

type ActiveTab =
  | "episodes"
  | "annotations"
  | "statistics"
  | "frames"
  | "insights"
  | "filtering"
  | "doctor"
  | "urdf";

// Subscribes to `currentTime` so its parent doesn't have to. Keeping this
// in a leaf component means the throttled time ticks (~12.5/s during
// playback) only re-render this no-op sub-tree, not the entire 700-line
// EpisodeViewerInner. Vercel rule: rerender-defer-reads.
function UrlTimeSync({
  episodeId,
  disabled,
}: {
  episodeId: number;
  disabled: boolean;
}) {
  const { currentTime, isPlaying } = useTime();
  const searchParams = useSearchParams();
  const lastUrlSecondRef = useRef<number>(-1);
  const lastEpisodeRef = useRef(episodeId);

  // Only update the URL ?t= param when the integer second changes, and
  // only while paused — replacing state every frame during playback would
  // spam the browser's history.
  useEffect(() => {
    if (lastEpisodeRef.current !== episodeId) {
      lastEpisodeRef.current = episodeId;
      lastUrlSecondRef.current = -1;
      return;
    }
    if (isPlaying || disabled) return;
    const currentSec = Math.floor(currentTime);
    if (currentTime > 0 && lastUrlSecondRef.current !== currentSec) {
      lastUrlSecondRef.current = currentSec;
      const newParams = new URLSearchParams(searchParams.toString());
      newParams.set("t", currentSec.toString());
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}?${newParams.toString()}`,
      );
      postParentMessageWithParams((params: URLSearchParams) => {
        params.set("path", window.location.pathname + window.location.search);
      });
    }
  }, [isPlaying, currentTime, searchParams, disabled, episodeId]);

  return null;
}

// Hoisted to module scope. Defining inside EpisodeViewerInner created a new
// component type on every parent render — and the parent re-renders ~12.5×/s
// during playback because it consumes `currentTime` from useTime. React
// would unmount and remount every tab on every tick.
function TabButton({
  active,
  onClick,
  label,
  title,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`relative px-5 py-3 text-xs font-medium tracking-wide uppercase transition-colors ${
        active ? "text-cyan-300" : "text-slate-400 hover:text-slate-100"
      }`}
    >
      {label}
      <span
        className={`pointer-events-none absolute bottom-0 left-3 right-3 h-px transition-all ${
          active
            ? "bg-cyan-400 shadow-[0_0_8px_rgba(56,189,248,0.55)]"
            : "bg-transparent"
        }`}
      />
    </button>
  );
}

export default function EpisodeViewer({
  org,
  dataset,
  episodeId,
}: {
  org: string;
  dataset: string;
  episodeId: number;
}) {
  const [data, setData] = useState<EpisodeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const [selectedEpisode, setSelectedEpisode] = useState(episodeId);

  useEffect(() => setSelectedEpisode(episodeId), [org, dataset, episodeId]);
  useEffect(() => {
    const onPopState = () => {
      const prefix = `/${org}/${dataset}/episode_`;
      if (window.location.pathname.startsWith(prefix)) {
        const value = Number(window.location.pathname.slice(prefix.length));
        if (Number.isSafeInteger(value) && value >= 0)
          setSelectedEpisode(value);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [org, dataset]);
  const selectEpisode = (next: number) => {
    if (next === selectedEpisode || !Number.isSafeInteger(next) || next < 0)
      return;
    // Navigating the dynamic Next segment remounts the whole viewer. Native
    // history keeps this viewer and its shared MP4 decoders alive; reloads and
    // back/forward still resolve the normal episode URL.
    window.history.pushState(null, "", `/${org}/${dataset}/episode_${next}`);
    document.title = `${org}/${dataset} | episode episode_${next}`;
    setSelectedEpisode(next);
  };

  useEffect(() => {
    if (!Number.isSafeInteger(selectedEpisode) || selectedEpisode < 0) {
      setError("Invalid episode id.");
      setData(null);
      return;
    }
    const requestId = ++requestIdRef.current;
    let cancelled = false;
    setError(null);
    getEpisodeDataSafe(org, dataset, selectedEpisode)
      .then(({ data: loaded, error: loadError }) => {
        if (cancelled || requestIdRef.current !== requestId) return;
        if (loadError) {
          setError(loadError);
          setData(null);
          return;
        }
        setData(loaded ?? null);
      })
      .catch((err) => {
        if (cancelled || requestIdRef.current !== requestId) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message || "Unknown error");
        setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [org, dataset, selectedEpisode]);

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--bg)] text-red-300">
        <div className="panel-raised max-w-xl p-6 border-red-500/40">
          <h2 className="text-xl font-medium mb-3">Something went wrong</h2>
          <p className="text-sm font-mono whitespace-pre-wrap text-red-200/90">
            {error}
          </p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="relative h-screen bg-[var(--bg)]">
        <Loading />
      </div>
    );
  }

  return (
    <TimeProvider
      key={data.datasetInfo.repoId}
      duration={data.duration}
      episodeKey={`${data.datasetInfo.repoId}:${data.episodeId}`}
    >
      <FlaggedEpisodesProvider>
        <ClipDraftsProvider repoId={data!.datasetInfo.repoId}>
          <AnnotationsProvider>
            <EpisodeBootstrap data={data!} />
            <EpisodeViewerInner
              data={data!}
              org={org}
              dataset={dataset}
              switching={
                data.episodeId !== selectedEpisode ||
                data.datasetInfo.repoId !== `${org}/${dataset}`
              }
              onEpisodeSelect={selectEpisode}
            />
          </AnnotationsProvider>
        </ClipDraftsProvider>
      </FlaggedEpisodesProvider>
    </TimeProvider>
  );
}

/** Wires the loaded episode into the AnnotationsProvider. */
function EpisodeBootstrap({ data }: { data: EpisodeData }) {
  const { setEpisode } = useAnnotations();
  useEffect(() => {
    setEpisode(
      data.episodeId,
      { repoId: data.datasetInfo.repoId },
      data.languageAtoms,
      data.frameTimestamps,
    );
  }, [
    data.episodeId,
    data.datasetInfo.repoId,
    data.languageAtoms,
    data.frameTimestamps,
    setEpisode,
  ]);
  return null;
}

function EpisodeViewerInner({
  data,
  org,
  dataset,
  switching = false,
  onEpisodeSelect,
}: {
  data: EpisodeData;
  org?: string;
  dataset?: string;
  switching?: boolean;
  onEpisodeSelect: (episodeId: number) => void;
}) {
  const {
    datasetInfo,
    episodeId,
    videosInfo,
    chartDataGroups,
    episodes,
    task,
  } = data;

  const [readyVideos, setReadyVideos] = useState<typeof videosInfo | null>(
    null,
  );
  const videosReady = !videosInfo.length || readyVideos === videosInfo;
  const [chartsExpanded, setChartsExpanded] = useState(false);
  const [videoHost] = useState(() => document.createElement("div"));
  const isLocalDataset = isLocalDatasetRepoId(datasetInfo.repoId);

  const loadStartRef = useRef(performance.now());

  const searchParams = useSearchParams();

  // Tab state & lazy stats — read sessionStorage in the initializer so the
  // correct tab renders on the very first frame (no post-mount flash).
  // Safe because EpisodeViewerInner only mounts client-side (behind a loading gate).
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem("activeTab");
      if (
        stored &&
        [
          "episodes",
          "annotations",
          "statistics",
          "frames",
          "insights",
          "filtering",
          "urdf",
        ].includes(stored)
      ) {
        return stored as ActiveTab;
      }
    }
    return "episodes";
  });
  const isLoading = switching || (activeTab === "episodes" && !videosReady);

  useLayoutEffect(() => {
    loadStartRef.current = performance.now();
  }, [episodeId, videosInfo]);

  useEffect(() => {
    if (!isLoading) {
      console.log(
        `[perf] Loading complete in ${(performance.now() - loadStartRef.current).toFixed(0)}ms (videos: ${videosReady ? "✓" : "…"})`,
      );
    }
  }, [isLoading, videosReady]);
  const [, setColumnMinMax] = useState<ColumnMinMax[] | null>(null);
  const [episodeLengthStats, setEpisodeLengthStats] =
    useState<EpisodeLengthStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const statsLoadedRef = useRef(false);
  const [episodeFramesData, setEpisodeFramesData] =
    useState<EpisodeFramesData | null>(null);
  const [framesLoading, setFramesLoading] = useState(false);
  const framesLoadedRef = useRef(false);
  const [framesFlaggedOnly, setFramesFlaggedOnly] = useState(() =>
    typeof window !== "undefined"
      ? sessionStorage.getItem("framesFlaggedOnly") === "true"
      : false,
  );
  const [sidebarFlaggedOnly, setSidebarFlaggedOnly] = useState(() =>
    typeof window !== "undefined"
      ? sessionStorage.getItem("sidebarFlaggedOnly") === "true"
      : false,
  );
  const [crossEpData, setCrossEpData] =
    useState<CrossEpisodeVarianceData | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const insightsLoadedRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    statsLoadedRef.current = false;
    framesLoadedRef.current = false;
    insightsLoadedRef.current = false;
    setEpisodeLengthStats(null);
    setEpisodeFramesData(null);
    setCrossEpData(null);
  }, [datasetInfo.repoId]);

  // Eagerly load the URDFViewer bundle + warm the STL geometry cache while
  // the user is on the Episodes tab, so the 3D Replay tab opens faster.
  useEffect(() => {
    if (
      hasURDFSupport(datasetInfo.robot_type) &&
      datasetInfo.codebase_version >= "v3.0"
    ) {
      void import("@/components/urdf-viewer");
    }
  }, [datasetInfo.robot_type, datasetInfo.codebase_version]);

  // Persist UI state across episode navigations. One effect instead of
  // three near-identical writes — fewer commit hooks per render and the
  // intent (mirror three primitives to sessionStorage) reads as one unit.
  useEffect(() => {
    sessionStorage.setItem("activeTab", activeTab);
    sessionStorage.setItem("sidebarFlaggedOnly", String(sidebarFlaggedOnly));
    sessionStorage.setItem("framesFlaggedOnly", String(framesFlaggedOnly));
  }, [activeTab, sidebarFlaggedOnly, framesFlaggedOnly]);

  const loadStats = () => {
    if (statsLoadedRef.current) return;
    statsLoadedRef.current = true;
    setStatsLoading(true);
    setColumnMinMax(computeColumnMinMax(data.chartDataGroups));
    if (org && dataset) {
      const repoId = `${org}/${dataset}`;
      getDatasetVersionAndInfo(repoId)
        .then(({ version, info }) => {
          if (version !== "v3.0") return null;
          return loadAllEpisodeLengthsV3(repoId, version, info.fps);
        })
        .then((result) => {
          if (!mountedRef.current) return;
          setEpisodeLengthStats(result);
        })
        .catch(() => {})
        .finally(() => {
          if (mountedRef.current) setStatsLoading(false);
        });
    } else {
      setStatsLoading(false);
    }
  };

  const loadFrames = () => {
    if (framesLoadedRef.current || !org || !dataset) return;
    framesLoadedRef.current = true;
    setFramesLoading(true);
    const repoId = `${org}/${dataset}`;
    getDatasetVersionAndInfo(repoId)
      .then(({ version, info }) =>
        loadAllEpisodeFrameInfo(
          repoId,
          version,
          info as unknown as DatasetMetadata,
        ),
      )
      .then((result) => {
        if (!mountedRef.current) return;
        setEpisodeFramesData(result);
      })
      .catch(() => {
        if (!mountedRef.current) return;
        setEpisodeFramesData({ cameras: [], framesByCamera: {} });
      })
      .finally(() => {
        if (mountedRef.current) setFramesLoading(false);
      });
  };

  const loadInsights = () => {
    if (insightsLoadedRef.current || !org || !dataset) return;
    insightsLoadedRef.current = true;
    setInsightsLoading(true);
    const repoId = `${org}/${dataset}`;
    getDatasetVersionAndInfo(repoId)
      .then(({ version, info }) =>
        loadCrossEpisodeActionVariance(
          repoId,
          version,
          info as unknown as DatasetMetadata,
          info.fps,
        ),
      )
      .then((result) => {
        if (!mountedRef.current) return;
        setCrossEpData(result);
      })
      .catch((err) => console.error("[cross-ep] Failed:", err))
      .finally(() => {
        if (mountedRef.current) setInsightsLoading(false);
      });
  };

  // Re-trigger data loading for the restored tab on mount
  useEffect(() => {
    if (activeTab === "statistics") loadStats();
    if (activeTab === "frames") loadFrames();
    if (activeTab === "insights") loadInsights();
    if (activeTab === "filtering") {
      loadStats();
      loadInsights();
    }
    // The local doctor panel renders from the same cross-episode and
    // episode-length data as Filtering/Insights (the HF-space iframe used
    // for hub datasets can't load local datasets).
    if (activeTab === "doctor" && isLocalDatasetRepoId(datasetInfo.repoId)) {
      loadStats();
      loadInsights();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTabChange = (tab: ActiveTab) => {
    setActiveTab(tab);
    if (tab === "statistics") loadStats();
    if (tab === "frames") loadFrames();
    if (tab === "insights") loadInsights();
    if (tab === "filtering") {
      loadStats();
      loadInsights();
    }
    if (tab === "doctor" && isLocalDataset) {
      loadStats();
      loadInsights();
    }
  };

  // `currentTime` is intentionally NOT read here. Subscribing to it would
  // re-render this 700-line component every ~80ms during playback. The
  // <UrlTimeSync /> child handles its only consumer (the ?t= URL writer).
  // `seek` and `setIsPlaying` are stable references from useCallback /
  // useState — they don't drive renders.
  const { seek, setIsPlaying } = useTime();
  useEffect(() => {
    if (switching) setIsPlaying(false);
  }, [switching, setIsPlaying]);

  // URDFViewer episode changer and play toggle — populated by URDFViewer on mount
  const urdfChangerRef = useRef<((ep: number) => void) | undefined>(undefined);
  const urdfPlayToggleRef = useRef<(() => void) | undefined>(undefined);
  const [urdfEpisode, setUrdfEpisode] = useState(episodeId);
  useEffect(() => setUrdfEpisode(episodeId), [episodeId]);

  // Pagination state
  const pageSize = 100;
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.ceil(episodes.length / pageSize);
  const paginatedEpisodes = episodes.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  // Video preloads repeat the same v3 shared MP4 URLs and don't warm episode
  // data. Warm the two neighboring episodes after visible media is ready.
  useEffect(() => {
    if (!org || !dataset || !videosReady || switching) return;
    const timer = setTimeout(() => {
      for (const next of [episodeId + 1, episodeId - 1]) {
        if (next >= 0 && next < datasetInfo.total_episodes) {
          void getEpisodeDataSafe(org, dataset, next);
        }
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [
    org,
    dataset,
    episodeId,
    videosReady,
    switching,
    datasetInfo.total_episodes,
  ]);

  // Initialize based on URL time parameter — run ONCE on mount. This effect
  // must not re-run on later searchParams changes: UrlTimeSync writes ?t=
  // via window.history.replaceState on every pause, Next.js reflects that
  // into useSearchParams, and re-seeking here would snap the videos back to
  // the floored second instead of pausing in place.
  const didInitSeekRef = useRef<number | null>(null);
  useEffect(() => {
    if (didInitSeekRef.current === episodeId || switching) return;
    didInitSeekRef.current = episodeId;
    const timeParam = searchParams.get("t");
    if (timeParam) {
      const timeValue = parseFloat(timeParam);
      if (!isNaN(timeValue)) {
        seek(timeValue);
      }
    }
  }, [searchParams, seek, episodeId, switching]);

  // sync with parent window hf.co/spaces
  useEffect(() => {
    postParentMessageWithParams((params: URLSearchParams) => {
      params.set("path", window.location.pathname + window.location.search);
    });
  }, []);

  // Initialize the sidebar page based on the current episode.
  useEffect(() => {
    const episodeIndex = episodes.indexOf(episodeId);
    if (episodeIndex !== -1) {
      setCurrentPage(Math.floor(episodeIndex / pageSize) + 1);
    }
  }, [episodes, episodeId, pageSize]);

  useEpisodeShortcuts({
    episodes,
    episodeId: activeTab === "urdf" ? urdfEpisode : episodeId,
    onSelect(nextEp) {
      if (activeTab === "urdf") {
        setUrdfEpisode(nextEp);
        urdfChangerRef.current?.(nextEp);
      } else {
        setIsPlaying(false);
        onEpisodeSelect(nextEp);
      }
    },
  });

  // Episodes and annotations own their restart/preview behavior locally.
  usePlayShortcut(
    activeTab === "urdf" ? () => urdfPlayToggleRef.current?.() : undefined,
  );

  // Pagination functions
  const nextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage((prev) => prev + 1);
    }
  };

  const prevPage = () => {
    if (currentPage > 1) {
      setCurrentPage((prev) => prev - 1);
    }
  };

  const renderTab = (tab: ActiveTab, label: string, title?: string) => (
    <TabButton
      active={activeTab === tab}
      onClick={() => handleTabChange(tab)}
      label={label}
      title={title}
    />
  );

  return (
    <div className="flex flex-col h-screen max-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      {activeTab === "episodes" &&
        createPortal(
          videosInfo.length > 0 ? (
            <SimpleVideosPlayer
              compact
              videosInfo={videosInfo}
              frameTimestamps={data.frameTimestamps}
              fps={datasetInfo.fps}
              onVideosReady={() => setReadyVideos(videosInfo)}
            />
          ) : (
            <p>此 episode 没有视频，请结合曲线复核。</p>
          ),
          videoHost,
        )}
      <UrlTimeSync episodeId={episodeId} disabled={switching || !videosReady} />
      {/* Top tab bar */}
      <div className="flex items-center border-b border-white/5 bg-[var(--surface-0)] shrink-0">
        {renderTab("episodes", "Episodes")}
        {renderTab(
          "annotations",
          "Annotations",
          "Edit subtask / plan / memory / interjection / VQA atoms (lerobot v3.1 schema)",
        )}
        {hasURDFSupport(datasetInfo.robot_type) &&
          datasetInfo.codebase_version >= "v3.0" &&
          renderTab("urdf", "3D Replay")}
        {renderTab("statistics", "Statistics")}
        {renderTab("filtering", "Filtering")}
        {renderTab("frames", "Frames")}
        {renderTab("insights", "Action Insights")}
        {renderTab(
          "doctor",
          "Doctor",
          "Dataset quality diagnostics (powered by lerobot-doctor)",
        )}
        <div className="ml-auto">
          <HfAuthButton variant="tab" />
        </div>
      </div>

      {/* Body: sidebar + content */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar — on Episodes and 3D Replay tabs */}
        {(activeTab === "episodes" ||
          activeTab === "annotations" ||
          activeTab === "urdf") && (
          <Sidebar
            datasetInfo={datasetInfo}
            paginatedEpisodes={paginatedEpisodes}
            episodeId={activeTab === "urdf" ? urdfEpisode : episodeId}
            totalPages={totalPages}
            currentPage={currentPage}
            prevPage={prevPage}
            nextPage={nextPage}
            showFlaggedOnly={sidebarFlaggedOnly}
            onShowFlaggedOnlyChange={setSidebarFlaggedOnly}
            onEpisodeSelect={
              activeTab === "urdf"
                ? (ep) => {
                    setUrdfEpisode(ep);
                    urdfChangerRef.current?.(ep);
                  }
                : (ep) => {
                    setIsPlaying(false);
                    onEpisodeSelect(ep);
                  }
            }
          />
        )}

        {/* Main content */}
        <div
          className={`flex flex-col gap-4 p-4 flex-1 relative ${isLoading ? "overflow-hidden" : "overflow-y-auto"}`}
        >
          {isLoading && <Loading />}

          {activeTab === "episodes" && (
            <>
              <div className="flex items-center gap-4 mb-2">
                <a
                  href="https://github.com/huggingface/lerobot"
                  target="_blank"
                  className="block shrink-0 opacity-90 hover:opacity-100 transition-opacity"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="https://github.com/huggingface/lerobot/raw/main/media/readme/lerobot-logo-thumbnail.png"
                    alt="LeRobot Logo"
                    className="w-24"
                  />
                </a>

                <div className="min-w-0">
                  <a
                    href={`https://huggingface.co/datasets/${datasetInfo.repoId}`}
                    target="_blank"
                    className="text-slate-200 hover:text-cyan-300 transition-colors"
                  >
                    <p className="text-base font-medium truncate">
                      {datasetInfo.repoId}
                    </p>
                  </a>
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 mt-0.5 tabular">
                    Episode · {episodeId}
                  </p>
                </div>
              </div>

              <IdleBoundaryControls
                key={`${datasetInfo.repoId}:${episodeId}`}
                onEpisodeSelect={onEpisodeSelect}
                episodes={episodes}
                repoId={datasetInfo.repoId}
                videos={videosInfo}
                frameTimestamps={data.frameTimestamps}
                fps={datasetInfo.fps}
                episodeId={episodeId}
                enabled={
                  isLocalDataset && datasetInfo.codebase_version === "v3.0"
                }
                media={<VideoMount host={videoHost} />}
                manualControls={
                  <ClipControls
                    key={`${datasetInfo.repoId}:${episodeId}`}
                    episodeId={episodeId}
                    fps={datasetInfo.fps}
                    frameTimestamps={data.frameTimestamps}
                    enabled={
                      isLocalDataset && datasetInfo.codebase_version === "v3.0"
                    }
                  />
                }
              />
              {task && <p className="text-sm text-slate-400">任务：{task}</p>}
              <details
                className="panel p-3"
                onToggle={(event) =>
                  setChartsExpanded(event.currentTarget.open)
                }
              >
                <summary className="cursor-pointer text-sm">
                  展开完整轨迹曲线
                </summary>
                <Suspense fallback={null}>
                  {chartsExpanded && <DataRecharts data={chartDataGroups} />}
                </Suspense>
              </details>
            </>
          )}

          {activeTab === "annotations" && (
            <div className="annotations-skin flex flex-col gap-4">
              <FramePlaybackShortcuts
                timestamps={data.frameTimestamps}
                fps={datasetInfo.fps}
              />
              <div className="flex items-center gap-3">
                <p className="text-base font-medium text-slate-200 truncate">
                  {datasetInfo.repoId}
                </p>
                <p className="text-[10px] uppercase tracking-wide text-slate-500 tabular">
                  Episode · {episodeId}
                </p>
              </div>
              {videosInfo.length > 0 && (
                <SimpleVideosPlayer
                  videosInfo={videosInfo}
                  frameTimestamps={data.frameTimestamps}
                  fps={datasetInfo.fps}
                  onVideosReady={() => setReadyVideos(videosInfo)}
                />
              )}
              <div className="grounding-intro">
                <span className="section-kicker">Grounded VQA</span>
                <ul>
                  <li>
                    Draw directly on the active video to create visual
                    questions. Drag for a bounding box, click for a point. The
                    camera is detected from the video you draw on.
                  </li>
                  <li>
                    Drag on any video to add a bbox question. Click any video to
                    add a keypoint question. Confirm the popup with <kbd>↵</kbd>
                    , or cancel with <kbd>Esc</kbd>.
                  </li>
                </ul>
              </div>
              <PlaybackBar />
              <AnnotationsTimeline duration={data.duration} />
              <AnnotationsPanel
                cameraKeys={videosInfo.map((v) => v.filename)}
              />
            </div>
          )}

          {activeTab === "statistics" && (
            <StatsPanel
              datasetInfo={datasetInfo}
              episodeLengthStats={episodeLengthStats}
              loading={statsLoading}
            />
          )}

          {activeTab === "frames" && (
            <OverviewPanel
              data={episodeFramesData}
              loading={framesLoading}
              flaggedOnly={framesFlaggedOnly}
              onFlaggedOnlyChange={setFramesFlaggedOnly}
            />
          )}

          {activeTab === "insights" && (
            <Suspense fallback={<Loading />}>
              <ActionInsightsPanel
                flatChartData={data.flatChartData}
                fps={datasetInfo.fps}
                crossEpisodeData={crossEpData}
                crossEpisodeLoading={insightsLoading}
              />
            </Suspense>
          )}

          {activeTab === "filtering" && (
            <Suspense fallback={<Loading />}>
              <FilteringPanel
                repoId={datasetInfo.repoId}
                crossEpisodeData={crossEpData}
                crossEpisodeLoading={insightsLoading}
                episodeLengthStats={episodeLengthStats}
                flatChartData={data.flatChartData}
                onViewFlaggedEpisodes={() => {
                  setSidebarFlaggedOnly(true);
                  handleTabChange("episodes");
                }}
              />
            </Suspense>
          )}

          {activeTab === "doctor" &&
            (isLocalDataset ? (
              <LocalDoctorPanel
                crossEpisodeData={crossEpData}
                crossEpisodeLoading={insightsLoading}
                episodeLengthStats={episodeLengthStats}
                statsLoading={statsLoading}
              />
            ) : (
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between px-1 pb-2 text-xs text-slate-400">
                  <span>
                    Dataset quality diagnostics &mdash; powered by{" "}
                    <a
                      href="https://github.com/jashshah999/lerobot-doctor"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-slate-200"
                    >
                      lerobot-doctor
                    </a>
                  </span>
                  <a
                    href={`https://jashshah999-lerobot-doctor.hf.space/?dataset=${org}/${dataset}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-slate-200"
                  >
                    Open in new tab
                  </a>
                </div>
                <iframe
                  src={`https://jashshah999-lerobot-doctor.hf.space/?dataset=${org}/${dataset}`}
                  title="lerobot-doctor"
                  className="flex-1 w-full rounded border border-slate-700 bg-white"
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                />
              </div>
            ))}

          {activeTab === "urdf" && (
            <Suspense fallback={<Loading />}>
              <URDFViewer
                data={data}
                org={org}
                dataset={dataset}
                episodeChangerRef={urdfChangerRef}
                playToggleRef={urdfPlayToggleRef}
              />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
}
