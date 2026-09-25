"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { FiPause, FiPlay, FiX } from "react-icons/fi";
import { getEpisodeVideosInfo } from "@/app/[org]/[dataset]/[episode]/fetch-data";
import type {
  DiversityEpisodeScore,
  DiversityGroup,
} from "@/lib/trajectory-diversity";
import type { VideoInfo } from "@/types";
import { proxyHfUrl } from "@/utils/auth";
import { ColormappedVideo } from "./colormapped-video";

type VideoSlot = { videos: VideoInfo[]; camera: string; error: string };

function selectedVideo(slot?: VideoSlot) {
  return slot?.videos.find((video) => video.filename === slot.camera);
}

function GroupVideo({
  episodeIndex,
  info,
  videoRef,
  onMetadata,
  onTimeUpdate,
  onPlay,
  onPause,
  onError,
}: {
  episodeIndex: number;
  info: VideoInfo;
  videoRef: (element: HTMLVideoElement | null) => void;
  onMetadata: (element: HTMLVideoElement) => void;
  onTimeUpdate: (element: HTMLVideoElement) => void;
  onPlay: () => void;
  onPause: () => void;
  onError: () => void;
}) {
  const [element, setElement] = useState<HTMLVideoElement | null>(null);
  const attach = useCallback(
    (next: HTMLVideoElement | null) => {
      setElement(next);
      videoRef(next);
    },
    [videoRef],
  );

  return (
    <div className="relative aspect-video w-full bg-black">
      <video
        ref={attach}
        src={proxyHfUrl(info.url)}
        muted
        playsInline
        preload="metadata"
        crossOrigin="anonymous"
        aria-label={`ep ${episodeIndex} group comparison video`}
        className={`h-full w-full object-contain ${info.isGrayscale ? "opacity-0" : ""}`}
        onLoadedMetadata={(event) => onMetadata(event.currentTarget)}
        onTimeUpdate={(event) => onTimeUpdate(event.currentTarget)}
        onPlay={onPlay}
        onPause={onPause}
        onError={onError}
      />
      <ColormappedVideo
        videoEl={element}
        active={info.isGrayscale}
        range={info.colormapRange}
      />
    </div>
  );
}

export function TrajectoryDiversityGroupDialog({
  repoId,
  group,
  episodes,
  smoothnessScores,
  reviews,
  onReview,
  onClose,
}: {
  repoId: string;
  group: DiversityGroup;
  episodes: DiversityEpisodeScore[];
  smoothnessScores: Map<number, number | null>;
  reviews: Record<number, string>;
  onReview: (episodeIndex: number, decision: string) => void;
  onClose: () => void;
}) {
  const [slots, setSlots] = useState<Record<number, VideoSlot>>({});
  const [loading, setLoading] = useState(true);
  const [durations, setDurations] = useState<Record<number, number>>({});
  const [times, setTimes] = useState<Record<number, number>>({});
  const [playing, setPlaying] = useState<Record<number, boolean>>({});
  const [syncPlaying, setSyncPlaying] = useState(false);
  const [syncTime, setSyncTime] = useState(0);
  const [rate, setRate] = useState(1);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef(new Map<number, HTMLVideoElement>());
  const syncPlayingRef = useRef(false);
  const syncTimeRef = useRef(0);
  const episodeIds = group.episodeIndices;

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled(
      episodeIds.map((episodeIndex) =>
        getEpisodeVideosInfo(repoId, episodeIndex),
      ),
    ).then((results) => {
      if (cancelled) return;
      const next: Record<number, VideoSlot> = {};
      results.forEach((result, index) => {
        const episodeIndex = episodeIds[index];
        if (result.status === "rejected") {
          next[episodeIndex] = {
            videos: [],
            camera: "",
            error: "Failed to load video information",
          };
          return;
        }
        const videos = result.value;
        next[episodeIndex] = {
          videos,
          camera:
            (
              videos.find((video) => /third_camera/i.test(video.filename)) ??
              videos.find((video) => !video.isGrayscale) ??
              videos[0]
            )?.filename ?? "",
          error: videos.length ? "" : "No usable video for this trajectory",
        };
      });
      setSlots(next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [repoId, episodeIds]);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = previousOverflow;
      videoRefs.current.forEach((video) => video.pause());
      previousFocus?.focus({ preventScroll: true });
    };
  }, [onClose]);

  const attachVideo = useCallback(
    (episodeIndex: number, video: HTMLVideoElement | null) => {
      if (video) videoRefs.current.set(episodeIndex, video);
      else videoRefs.current.delete(episodeIndex);
    },
    [],
  );
  const videoCallbacks = useMemo(
    () =>
      Object.fromEntries(
        episodeIds.map((episodeIndex) => [
          episodeIndex,
          (video: HTMLVideoElement | null) => attachVideo(episodeIndex, video),
        ]),
      ) as Record<number, (video: HTMLVideoElement | null) => void>,
    [episodeIds, attachVideo],
  );
  const commonDuration =
    episodeIds.length && episodeIds.every((id) => durations[id] > 0)
      ? Math.min(...episodeIds.map((id) => durations[id]))
      : 0;
  const allReady = !loading && commonDuration > 0;

  const pauseAll = useCallback(() => {
    syncPlayingRef.current = false;
    setSyncPlaying(false);
    videoRefs.current.forEach((video) => video.pause());
  }, []);
  const seekAll = (time: number) => {
    const bounded = Math.max(0, Math.min(time, commonDuration));
    syncTimeRef.current = bounded;
    setSyncTime(bounded);
    for (const episodeIndex of episodeIds) {
      const video = videoRefs.current.get(episodeIndex);
      const info = selectedVideo(slots[episodeIndex]);
      if (video && info && durations[episodeIndex]) {
        video.currentTime =
          (info.segmentStart ?? 0) +
          Math.min(bounded, Math.max(0, durations[episodeIndex] - 0.04));
      }
    }
  };
  const seekOne = (episodeIndex: number, time: number) => {
    pauseAll();
    const video = videoRefs.current.get(episodeIndex);
    const info = selectedVideo(slots[episodeIndex]);
    if (!video || !info || !durations[episodeIndex]) return;
    const bounded = Math.max(
      0,
      Math.min(time, Math.max(0, durations[episodeIndex] - 0.04)),
    );
    video.currentTime = (info.segmentStart ?? 0) + bounded;
    setTimes((current) => ({ ...current, [episodeIndex]: bounded }));
  };
  const playAll = async () => {
    if (!allReady) return;
    setError("");
    if (syncTimeRef.current >= commonDuration - 0.05) seekAll(0);
    else seekAll(syncTimeRef.current);
    const results = await Promise.allSettled(
      episodeIds.map((id) => videoRefs.current.get(id)!.play()),
    );
    if (results.some((result) => result.status === "rejected")) {
      pauseAll();
      setError(
        "Some videos could not be played. Check each video and try again.",
      );
      return;
    }
    syncPlayingRef.current = true;
    setSyncPlaying(true);
  };
  const toggleOne = (episodeIndex: number) => {
    const video = videoRefs.current.get(episodeIndex);
    if (!video || !durations[episodeIndex]) return;
    const wasPlaying = !video.paused;
    pauseAll();
    if (wasPlaying) return;
    const info = selectedVideo(slots[episodeIndex]);
    if (
      info &&
      video.currentTime >=
        (info.segmentStart ?? 0) + durations[episodeIndex] - 0.05
    ) {
      video.currentTime = info.segmentStart ?? 0;
    }
    void video
      .play()
      .catch(() =>
        setError(`Video for ep ${episodeIndex} could not be played.`),
      );
  };

  const onTimeUpdate = (episodeIndex: number, video: HTMLVideoElement) => {
    const info = selectedVideo(slots[episodeIndex]);
    if (!info) return;
    const localTime = Math.max(0, video.currentTime - (info.segmentStart ?? 0));
    setTimes((current) => ({ ...current, [episodeIndex]: localTime }));
    if (localTime >= durations[episodeIndex] - 0.03) video.pause();
    if (!syncPlayingRef.current || episodeIndex !== episodeIds[0]) return;
    if (localTime >= commonDuration - 0.03) {
      pauseAll();
      syncTimeRef.current = commonDuration;
      setSyncTime(commonDuration);
      return;
    }
    syncTimeRef.current = localTime;
    setSyncTime(localTime);
    for (const id of episodeIds.slice(1)) {
      const other = videoRefs.current.get(id);
      const otherInfo = selectedVideo(slots[id]);
      if (
        other &&
        otherInfo &&
        Math.abs(
          other.currentTime - (otherInfo.segmentStart ?? 0) - localTime,
        ) > 0.2
      ) {
        other.currentTime = (otherInfo.segmentStart ?? 0) + localTime;
      }
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-2 sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`${group.groupId} trajectory comparison`}
        className="flex max-h-[94vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-md border border-white/15 bg-[var(--surface-1)] outline-none"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              {group.groupId} · {group.episodeCount} episodes · representative
              ep {group.representativeEpisodeIndex}
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Trajectories in this group have similar robot initial states and
              execution behavior; object positions and deletion decisions still
              require manual review.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close group comparison"
            title="Close"
            onClick={onClose}
            className="rounded p-2 text-slate-300 hover:bg-white/10"
          >
            <FiX />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-b border-white/10 px-4 py-3 text-xs text-slate-300">
          <button
            type="button"
            aria-label={syncPlaying ? "Pause all" : "Play all together"}
            disabled={!allReady}
            onClick={() => {
              if (syncPlaying) pauseAll();
              else void playAll();
            }}
            className="inline-flex items-center gap-2 rounded border border-cyan-400/30 px-3 py-1.5 text-cyan-300 disabled:opacity-40"
          >
            {syncPlaying ? <FiPause /> : <FiPlay />}
            {syncPlaying ? "Pause all" : "Play all together"}
          </button>
          <input
            type="range"
            aria-label="Synchronized progress"
            min={0}
            max={commonDuration || 1}
            step={0.01}
            value={syncTime}
            disabled={!allReady}
            onChange={(event) => seekAll(Number(event.target.value))}
            className="min-w-32 flex-1 accent-cyan-400"
          />
          <span className="tabular-nums">
            {syncTime.toFixed(1)} / {commonDuration.toFixed(1)} s
          </span>
          <select
            aria-label="Synchronized playback speed"
            value={rate}
            onChange={(event) => {
              const next = Number(event.target.value);
              setRate(next);
              videoRefs.current.forEach((video) => {
                video.playbackRate = next;
              });
            }}
            className="rounded border border-white/10 bg-[var(--surface-0)] px-2 py-1"
          >
            {[0.5, 1, 2].map((value) => (
              <option key={value} value={value}>
                {value}×
              </option>
            ))}
          </select>
        </div>
        {error && (
          <p role="alert" className="px-4 pt-2 text-xs text-red-300">
            {error}
          </p>
        )}
        <div
          className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-4 md:grid-cols-2 xl:grid-cols-3"
          style={{ gridAutoRows: "max-content" }}
        >
          {episodeIds.map((episodeIndex) => {
            const slot = slots[episodeIndex];
            const info = selectedVideo(slot);
            const episode = episodes.find(
              (item) => item.episodeIndex === episodeIndex,
            );
            const smoothness = smoothnessScores.get(episodeIndex);
            return (
              <div
                key={episodeIndex}
                className="min-w-0 self-start overflow-hidden rounded border border-white/10 bg-[var(--surface-0)]"
              >
                <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                  <strong className="text-slate-100">
                    ep {episodeIndex}
                    {group.representativeEpisodeIndex === episodeIndex
                      ? " · representative"
                      : ""}
                  </strong>
                  {slot && slot.videos.length > 1 && (
                    <select
                      aria-label={`ep ${episodeIndex} camera`}
                      value={slot.camera}
                      onChange={(event) => {
                        pauseAll();
                        setDurations((current) => {
                          const next = { ...current };
                          delete next[episodeIndex];
                          return next;
                        });
                        setSlots((current) => ({
                          ...current,
                          [episodeIndex]: {
                            ...current[episodeIndex],
                            camera: event.target.value,
                            error: "",
                          },
                        }));
                      }}
                      className="min-w-0 max-w-[55%] bg-transparent text-slate-300"
                    >
                      {slot.videos.map((video) => (
                        <option key={video.filename} value={video.filename}>
                          {video.filename}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                {info ? (
                  <GroupVideo
                    key={`${episodeIndex}:${info.filename}`}
                    episodeIndex={episodeIndex}
                    info={info}
                    videoRef={videoCallbacks[episodeIndex]}
                    onMetadata={(video) => {
                      const duration = Math.max(
                        0,
                        Math.min(
                          info.segmentEnd ?? video.duration,
                          video.duration,
                        ) - (info.segmentStart ?? 0),
                      );
                      video.currentTime =
                        (info.segmentStart ?? 0) +
                        Math.min(
                          syncTimeRef.current,
                          Math.max(0, duration - 0.04),
                        );
                      video.playbackRate = rate;
                      setDurations((current) => ({
                        ...current,
                        [episodeIndex]: duration,
                      }));
                    }}
                    onTimeUpdate={(video) => onTimeUpdate(episodeIndex, video)}
                    onPlay={() =>
                      setPlaying((current) => ({
                        ...current,
                        [episodeIndex]: true,
                      }))
                    }
                    onPause={() =>
                      setPlaying((current) => ({
                        ...current,
                        [episodeIndex]: false,
                      }))
                    }
                    onError={() => {
                      pauseAll();
                      setDurations((current) => {
                        const next = { ...current };
                        delete next[episodeIndex];
                        return next;
                      });
                      setSlots((current) => ({
                        ...current,
                        [episodeIndex]: {
                          ...current[episodeIndex],
                          error: "Video failed to load",
                        },
                      }));
                    }}
                  />
                ) : (
                  <div className="flex aspect-video items-center justify-center bg-black text-xs text-slate-500">
                    {loading
                      ? "Loading video..."
                      : slot?.error || "No usable video"}
                  </div>
                )}
                <div className="space-y-2 px-3 py-2 text-xs text-slate-400">
                  {slot?.error && info && (
                    <p role="alert" className="text-red-300">
                      {slot.error}
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      aria-label={`${playing[episodeIndex] ? "Pause" : "Play"} ep ${episodeIndex}`}
                      disabled={!durations[episodeIndex]}
                      onClick={() => toggleOne(episodeIndex)}
                      className="inline-flex items-center gap-1.5 text-cyan-300 disabled:opacity-40"
                    >
                      {playing[episodeIndex] ? <FiPause /> : <FiPlay />}
                      {playing[episodeIndex] ? "Pause" : "Play individually"}
                    </button>
                    <span className="tabular-nums">
                      {(times[episodeIndex] ?? 0).toFixed(1)} /{" "}
                      {(durations[episodeIndex] ?? 0).toFixed(1)} s
                    </span>
                  </div>
                  <input
                    type="range"
                    aria-label={`ep ${episodeIndex} video progress`}
                    min={0}
                    max={durations[episodeIndex] || 1}
                    step={0.01}
                    value={times[episodeIndex] ?? 0}
                    disabled={!durations[episodeIndex]}
                    onChange={(event) =>
                      seekOne(episodeIndex, Number(event.target.value))
                    }
                    className="w-full accent-cyan-400"
                  />
                  <p>
                    Nearest episode:{" "}
                    {episode?.nearestEpisodeIndex == null
                      ? "N/A"
                      : `ep ${episode.nearestEpisodeIndex}`}{" "}
                    · initial-state distance{" "}
                    {episode?.initialDistance?.toFixed(3) ?? "N/A"} · behavior
                    distance {episode?.behaviorDistance?.toFixed(3) ?? "N/A"}
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <span>
                      Smoothness reference score:{" "}
                      {smoothness?.toFixed(1) ?? "N/A"}
                    </span>
                    <select
                      aria-label={`ep ${episodeIndex} manual diversity review`}
                      value={reviews[episodeIndex] ?? "unreviewed"}
                      onChange={(event) =>
                        onReview(episodeIndex, event.target.value)
                      }
                      className="rounded border border-white/10 bg-[var(--surface-1)] px-1.5 py-1 text-slate-200"
                    >
                      <option value="unreviewed">Unreviewed</option>
                      <option value="duplicate">Confirm duplicate</option>
                      <option value="different">Confirm different</option>
                      <option value="uncertain">Cannot determine</option>
                    </select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
