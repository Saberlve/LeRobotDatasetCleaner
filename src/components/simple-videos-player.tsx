"use client";

import React, { useEffect, useRef } from "react";
import { useTime } from "../context/time-context";
import { FaExpand, FaCompress, FaTimes, FaEye } from "react-icons/fa";
import type { VideoInfo } from "@/types";
import { proxyHfUrl } from "@/utils/auth";
import { VideoOverlayCanvas } from "./video-overlay-canvas";
import { ColormappedVideo } from "./colormapped-video";

const THRESHOLDS = {
  VIDEO_SYNC_TOLERANCE: 0.2,
  VIDEO_SEGMENT_BOUNDARY: 0.05,
};

const VIDEO_READY_TIMEOUT_MS = 10_000;

type VideoPlayerProps = {
  videosInfo: VideoInfo[];
  onVideosReady?: () => void;
  compact?: boolean;
};

const videoEventCleanup = new WeakMap<HTMLVideoElement, () => void>();

export const SimpleVideosPlayer = ({
  videosInfo,
  onVideosReady,
  compact = false,
}: VideoPlayerProps) => {
  const {
    currentTime,
    seek,
    externalSeekVersion,
    isPlaying,
    setIsPlaying,
    playbackRate,
  } = useTime();
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  // Mirror videoRefs into state so the absolutely-positioned VQA overlay can
  // re-render with the actual <video> element once it mounts. Using a ref
  // alone means the overlay's first render still sees `null`.
  const [videoEls, setVideoEls] = React.useState<(HTMLVideoElement | null)[]>(
    () => [],
  );
  // Stable ref callbacks per index. If we used inline `(el) => { ... }` here
  // React would re-invoke the callback on every render (the function identity
  // changes), which combined with `setVideoEls` would toggle state on each
  // tick and produce a "Maximum update depth exceeded" loop.
  const videoRefCallbacksRef = useRef<
    ((el: HTMLVideoElement | null) => void)[]
  >([]);
  while (videoRefCallbacksRef.current.length < videosInfo.length) {
    const idx = videoRefCallbacksRef.current.length;
    videoRefCallbacksRef.current.push((el: HTMLVideoElement | null) => {
      videoRefs.current[idx] = el;
      setVideoEls((prev) => {
        if (prev[idx] === el) return prev;
        const next = prev.slice();
        next[idx] = el;
        return next;
      });
    });
  }
  const [hiddenVideos, setHiddenVideos] = React.useState<string[]>([]);
  const [enlargedVideo, setEnlargedVideo] = React.useState<string | null>(null);
  const [showHiddenMenu, setShowHiddenMenu] = React.useState(false);
  const [videosReady, setVideosReady] = React.useState(false);
  const [loadingSlow, setLoadingSlow] = React.useState(false);
  const [videoAspects, setVideoAspects] = React.useState<
    Record<string, number>
  >({});
  useEffect(() => {
    videoRefs.current.forEach((video) => {
      if (video) video.playbackRate = playbackRate;
    });
  }, [playbackRate, videoEls]);

  const hiddenSet = React.useMemo(() => new Set(hiddenVideos), [hiddenVideos]);

  const firstVisibleIdx = videosInfo.findIndex(
    (video) => !hiddenSet.has(video.filename),
  );
  const visibleVideos = videosInfo.filter(
    (video) => !hiddenSet.has(video.filename),
  );
  const maxVideoAspect = Math.max(
    ...visibleVideos.map((video) => videoAspects[video.url] ?? 4 / 3),
  );

  // Last externalSeekVersion we observed in the sync effect. When the
  // context's version moves past this, an external seek happened and we
  // need to drive every video to the new position.
  const lastSeekVersionRef = useRef(externalSeekVersion);

  // Mirror firstVisibleIdx into a ref so the videos-ready effect doesn't have
  // to depend on it. If it did, hiding the first camera would tear the whole
  // effect down and back up, re-attaching `canplaythrough` listeners that
  // never re-fire (the videos are already loaded), leaving readyCount stuck
  // at 0 until the 10s timeout — at which point markReady forces play even
  // if the user paused.
  const firstVisibleIdxRef = useRef(firstVisibleIdx);
  useEffect(() => {
    firstVisibleIdxRef.current = firstVisibleIdx;
  }, [firstVisibleIdx]);

  // Mirror onVideosReady into a ref for the same reason. Parents typically
  // pass an inline arrow (`onVideosReady={() => setVideosReady(true)}`) which
  // gets a new identity every render. Including it in the videos-ready
  // effect's deps caused that effect to tear down + setup on every parent
  // render. The setup branch then ran `queueMicrotask(handleLoadedData)` for
  // every already-loaded video (true after the first load), seeking each
  // back to segmentStart — videos got pinned on their first frame and never
  // advanced.
  const onVideosReadyRef = useRef(onVideosReady);
  useEffect(() => {
    onVideosReadyRef.current = onVideosReady;
  }, [onVideosReady]);

  // Initialize video refs array
  useEffect(() => {
    videoRefs.current = videoRefs.current.slice(0, videosInfo.length);
  }, [videosInfo.length]);

  // A timeout reports slow loading; it must never authorize playback.
  useEffect(() => {
    const readyVideos = new Set<number>();
    let resolved = false;
    let disposed = false;
    setVideosReady(false);
    setLoadingSlow(false);

    const markReady = () => {
      if (resolved || disposed) return;
      resolved = true;
      clearTimeout(timeout);
      setLoadingSlow(false);
      setVideosReady(true);
      onVideosReadyRef.current?.();
      // Review starts paused so a short leading candidate is not missed while
      // the operator opens settings or waits for the last camera to load.
      setIsPlaying(!compact);
    };

    const checkReady = (index: number) => {
      if (disposed) return;
      readyVideos.add(index);
      if (readyVideos.size >= videosInfo.length) markReady();
    };

    const timeout = setTimeout(() => {
      if (!disposed && !resolved) setLoadingSlow(true);
    }, VIDEO_READY_TIMEOUT_MS);

    // Stop every camera together and keep the last episode frame visible.
    // Segment ends are exclusive: seeking to the exact end can show the
    // first frame of the next episode in the same video file.
    const stopAllVideos = (globalTime: number) => {
      // Explicit review loops and trimmed previews may redirect this report.
      // Let their requested seek take precedence over the default end stop.
      if (Math.abs(seek(globalTime, "video") - globalTime) > 0.001) return;
      videoRefs.current.forEach((other, otherIdx) => {
        if (!other) return;
        const otherInfo = videosInfo[otherIdx];
        if (!otherInfo) return;
        other.pause();
        const start = otherInfo.isSegmented ? (otherInfo.segmentStart ?? 0) : 0;
        const end = otherInfo.isSegmented
          ? (otherInfo.segmentEnd ?? other.duration) - 0.001
          : other.duration;
        const target = Math.max(start, Math.min(start + globalTime, end));
        if (
          Number.isFinite(target) &&
          Math.abs(other.currentTime - target) > 0.001
        ) {
          other.currentTime = target;
        }
      });
      setIsPlaying(false);
    };

    videoRefs.current.forEach((video, index) => {
      if (!video) return;
      const info = videosInfo[index];
      const checkVideoReady = () => checkReady(index);
      let initialSeekStarted = false;
      const handleSeeked = () => {
        if (
          initialSeekStarted &&
          !video.seeking &&
          video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
          Math.abs(video.currentTime - (info.segmentStart ?? 0)) < 0.001
        ) {
          checkVideoReady();
        }
      };

      // The primary camera reports time and stops playback at the episode end.
      const handleTimeUpdate = () => {
        if (info.isSegmented) {
          const segmentEnd = info.segmentEnd ?? video.duration;
          const segmentStart = info.segmentStart ?? 0;
          if (
            video.currentTime >=
            segmentEnd - THRESHOLDS.VIDEO_SEGMENT_BOUNDARY
          ) {
            if (index === firstVisibleIdxRef.current) {
              stopAllVideos(Math.max(0, segmentEnd - segmentStart - 0.001));
            } else {
              video.pause();
              const lastTime = Math.max(segmentStart, segmentEnd - 0.001);
              if (Math.abs(video.currentTime - lastTime) > 0.001) {
                video.currentTime = lastTime;
              }
            }
            return;
          }
        }
        if (index === firstVisibleIdxRef.current) {
          let globalTime = video.currentTime;
          if (info.isSegmented) {
            globalTime = video.currentTime - (info.segmentStart ?? 0);
          }
          seek(globalTime, "video");
        }
      };

      // For segmented videos, snap into the segment when play() is called
      // — covers the case where the user paused outside the segment range.
      const handlePlay = info.isSegmented
        ? () => {
            const segmentStart = info.segmentStart ?? 0;
            const segmentEnd = info.segmentEnd ?? video.duration;
            if (
              video.currentTime < segmentStart ||
              video.currentTime >= segmentEnd
            ) {
              video.currentTime = segmentStart;
            }
          }
        : null;

      const handleLoadedData = info.isSegmented
        ? () => {
            if (disposed) return;
            if (initialSeekStarted) {
              handleSeeked();
              return;
            }
            initialSeekStarted = true;
            const target = info.segmentStart ?? 0;
            // An already-positioned video may never emit another seeked.
            if (Math.abs(video.currentTime - target) < 0.001) {
              handleSeeked();
            } else {
              video.currentTime = target;
            }
          }
        : null;

      const handleEnded = info.isSegmented
        ? null
        : () => {
            if (index === firstVisibleIdxRef.current) {
              stopAllVideos(video.currentTime);
            } else {
              video.pause();
            }
          };

      video.addEventListener("timeupdate", handleTimeUpdate);
      let frameCallback: number | undefined;
      const reportFrame = () => {
        if (!video.paused && !video.seeking) handleTimeUpdate();
        frameCallback = video.requestVideoFrameCallback(reportFrame);
      };
      if (compact && video.requestVideoFrameCallback)
        frameCallback = video.requestVideoFrameCallback(reportFrame);
      if (handlePlay) video.addEventListener("play", handlePlay);
      if (handleEnded) video.addEventListener("ended", handleEnded);

      // Cached videos may not emit another load event. Check their state too.
      // If seeking finishes before a decoded frame arrives, canplay/loadeddata
      // rechecks readiness without seeking back to the start a second time.
      if (info.isSegmented && handleLoadedData) {
        video.addEventListener("seeked", handleSeeked);
        video.addEventListener("canplay", handleSeeked);
        video.addEventListener("loadeddata", handleLoadedData);
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          queueMicrotask(handleLoadedData);
        }
      } else if (!info.isSegmented) {
        if (video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
          queueMicrotask(checkVideoReady);
        } else {
          video.addEventListener("canplaythrough", checkVideoReady, {
            once: true,
          });
        }
      }

      videoEventCleanup.set(video, () => {
        if (frameCallback !== undefined)
          video.cancelVideoFrameCallback(frameCallback);
        video.removeEventListener("timeupdate", handleTimeUpdate);
        if (handlePlay) video.removeEventListener("play", handlePlay);
        if (handleLoadedData)
          video.removeEventListener("loadeddata", handleLoadedData);
        if (handleEnded) video.removeEventListener("ended", handleEnded);
        video.removeEventListener("seeked", handleSeeked);
        video.removeEventListener("canplay", handleSeeked);
        video.removeEventListener("canplaythrough", checkVideoReady);
      });
    });

    return () => {
      disposed = true;
      clearTimeout(timeout);
      videoRefs.current.forEach((video) => {
        if (!video) return;
        const cleanup = videoEventCleanup.get(video);
        if (cleanup) {
          cleanup();
          videoEventCleanup.delete(video);
        }
      });
    };
    // firstVisibleIdx intentionally omitted — we read it via ref so hiding
    // the first camera doesn't reset readiness (see the comment near
    // firstVisibleIdxRef above).
    // onVideosReady intentionally omitted — read via onVideosReadyRef so
    // an inline parent prop doesn't tear this effect down on every render.
  }, [videosInfo, setIsPlaying, seek, compact]);

  // Handle play/pause — skip hidden videos
  useEffect(() => {
    if (!videosReady) return;

    videoRefs.current.forEach((video, idx) => {
      if (!video || hiddenSet.has(videosInfo[idx].filename)) return;
      if (isPlaying) {
        video.play().catch((e) => {
          if (e.name !== "AbortError") {
            console.error("Error playing video");
          }
        });
      } else {
        video.pause();
      }
    });
  }, [isPlaying, videosReady, hiddenSet, videosInfo]);

  // Drive every video to currentTime on external seeks (slider drag, chart
  // click, loop reset). The version-based check replaces a 0.3s heuristic
  // that misfired when a network stall produced a >0.3s timeupdate jump
  // and incorrectly classified it as a user seek — causing every camera to
  // re-seek, which itself stalled them in a feedback spiral.
  useEffect(() => {
    if (!videosReady) return;
    if (externalSeekVersion === lastSeekVersionRef.current) return;
    lastSeekVersionRef.current = externalSeekVersion;

    videoRefs.current.forEach((video, index) => {
      if (!video) return;
      if (hiddenSet.has(videosInfo[index].filename)) return;

      const info = videosInfo[index];
      let targetTime = currentTime;
      if (info.isSegmented) {
        targetTime = (info.segmentStart ?? 0) + currentTime;
      }

      if (Math.abs(video.currentTime - targetTime) > 0.001) {
        video.currentTime = targetTime;
      }
    });
  }, [externalSeekVersion, currentTime, videosInfo, videosReady, hiddenSet]);

  return (
    <>
      {loadingSlow && (
        <div
          role="status"
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[100] rounded-md bg-slate-900 px-4 py-3 text-sm text-amber-200"
        >
          视频仍在加载或定位片段，请稍候。
        </div>
      )}
      {/* Hidden videos menu */}
      {hiddenVideos.length > 0 && (
        <div className="relative mb-4">
          <button
            className="inline-flex items-center gap-2 h-8 rounded-md panel px-3 text-xs text-slate-300 hover:text-slate-100 hover:bg-white/5 transition-colors"
            onClick={() => setShowHiddenMenu(!showHiddenMenu)}
          >
            <FaEye size={11} /> Show hidden · {hiddenVideos.length}
          </button>
          {showHiddenMenu && (
            <div className="absolute left-0 mt-1.5 w-max panel-raised bg-[var(--surface-1)] shadow-xl p-1.5 z-50">
              <div className="mb-1 px-2 text-[10px] uppercase tracking-wide text-slate-500">
                Restore hidden videos
              </div>
              {hiddenVideos.map((filename) => (
                <button
                  key={filename}
                  className="block w-full text-left px-2 py-1 rounded-md text-xs text-slate-300 hover:text-slate-100 hover:bg-white/5 transition-colors"
                  onClick={() =>
                    setHiddenVideos((prev) =>
                      prev.filter((v) => v !== filename),
                    )
                  }
                >
                  {filename}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Videos */}
      <div
        className={
          compact ? "idle-camera-grid" : "flex flex-wrap gap-x-2 gap-y-6"
        }
        style={
          compact
            ? ({
                "--camera-max-aspect": maxVideoAspect,
                "--camera-row-aspect":
                  maxVideoAspect * Math.min(2, visibleVideos.length),
              } as React.CSSProperties)
            : undefined
        }
      >
        {videosInfo.map((info, idx) => {
          if (hiddenVideos.includes(info.filename)) return null;

          const isEnlarged = enlargedVideo === info.filename;

          return (
            <div
              key={info.filename}
              className={`${
                isEnlarged
                  ? "z-40 fixed inset-0 bg-black bg-opacity-90 flex flex-col items-center justify-center"
                  : compact
                    ? "idle-camera-card"
                    : "max-w-96"
              }`}
              style={
                compact && !isEnlarged
                  ? ({
                      "--camera-aspect": videoAspects[info.url] ?? 4 / 3,
                    } as React.CSSProperties)
                  : undefined
              }
            >
              <p className="truncate w-full rounded-t-md bg-[var(--surface-1)] border border-b-0 border-white/5 px-2.5 py-1 text-[11px] text-slate-400 flex items-center justify-between gap-2">
                <span className="truncate" title={info.filename}>
                  {info.filename}
                </span>
                <span className="flex gap-0.5 shrink-0">
                  <button
                    title={isEnlarged ? "Minimize" : "Enlarge"}
                    className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-white/5 transition-colors"
                    onClick={() =>
                      setEnlargedVideo(isEnlarged ? null : info.filename)
                    }
                  >
                    {isEnlarged ? (
                      <FaCompress size={10} />
                    ) : (
                      <FaExpand size={10} />
                    )}
                  </button>
                  <button
                    title="Hide Video"
                    className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-white/5 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                    onClick={() => {
                      setHiddenVideos((prev) => [...prev, info.filename]);
                      // If the user hid the camera that was enlarged, clear
                      // the enlarged state too — otherwise it stays pointed
                      // at the now-hidden filename and pops back to fullscreen
                      // the moment the user un-hides it.
                      if (enlargedVideo === info.filename) {
                        setEnlargedVideo(null);
                      }
                    }}
                    disabled={
                      videosInfo.filter(
                        (v) => !hiddenVideos.includes(v.filename),
                      ).length === 1
                    }
                  >
                    <FaTimes size={10} />
                  </button>
                </span>
              </p>
              <div className="relative w-full">
                <video
                  ref={videoRefCallbacksRef.current[idx]}
                  onLoadedMetadata={(event) => {
                    const video = event.currentTarget;
                    if (!video.videoWidth || !video.videoHeight) return;
                    const aspect = video.videoWidth / video.videoHeight;
                    setVideoAspects((prev) =>
                      prev[info.url] === aspect
                        ? prev
                        : { ...prev, [info.url]: aspect },
                    );
                  }}
                  className={`w-full object-contain ${
                    isEnlarged
                      ? "max-h-[90vh] max-w-[90vw]"
                      : compact
                        ? "idle-camera-video"
                        : ""
                  } ${info.isGrayscale ? "opacity-0" : ""}`}
                  muted
                  preload="auto"
                  crossOrigin="anonymous"
                >
                  <source src={proxyHfUrl(info.url)} type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
                {/* Grayscale feeds: the hidden <video> above still decodes and
                    drives timing; this canvas paints its frames recolored with
                    the viridis colormap. */}
                <ColormappedVideo
                  videoEl={videoEls[idx] ?? null}
                  active={info.isGrayscale}
                  range={info.colormapRange}
                />
                {/* VQA bbox/keypoint overlay. Reads atoms + drawMode from
                    AnnotationsContext; pointer-events fall through when
                    not in draw mode so video controls remain usable. */}
                <VideoOverlayCanvas
                  videoEl={videoEls[idx] ?? null}
                  cameraKey={info.filename}
                />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};

export default SimpleVideosPlayer;
