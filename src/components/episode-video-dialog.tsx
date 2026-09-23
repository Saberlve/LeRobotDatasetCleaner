"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { getEpisodeVideosInfo } from "@/app/[org]/[dataset]/[episode]/fetch-data";
import { proxyHfUrl } from "@/utils/auth";
import { isVideoTextEntry } from "@/utils/video-shortcuts";
import { ColormappedVideo } from "./colormapped-video";
import type { VideoInfo } from "@/types";

type Props = {
  repoId: string;
  episodeIndex: number;
  initialTime?: number;
  onClose: () => void;
  children?: ReactNode;
};

/** Isolated review player: never navigates away from Filtering or changes its
 * TimeProvider, clip drafts, flags, or the background episode's playback. */
export function EpisodeVideoDialog({
  repoId,
  episodeIndex,
  initialTime = 0,
  onClose,
  children,
}: Props) {
  const [videos, setVideos] = useState<VideoInfo[]>([]);
  const [camera, setCamera] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(initialTime);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const relativeTime = useRef(initialTime);
  const actions = useRef({ onClose, toggle: () => {} });
  const info = videos.find((v) => v.filename === camera);
  const segmentStart = info?.segmentStart ?? 0;

  useEffect(() => {
    let canceled = false;
    getEpisodeVideosInfo(repoId, episodeIndex)
      .then((result) => {
        if (canceled) return;
        setVideos(result);
        setCamera(
          (
            result.find((v) => /third_camera/i.test(v.filename)) ??
            result.find((v) => !v.isGrayscale) ??
            result[0]
          )?.filename ?? "",
        );
        if (!result.length) setError("该 episode 没有可用视频。");
        setLoading(false);
      })
      .catch((e) => {
        if (!canceled) {
          setError(e instanceof Error ? e.message : "视频信息加载失败");
          setLoading(false);
        }
      });
    return () => {
      canceled = true;
    };
  }, [repoId, episodeIndex]);

  const toggle = useCallback(() => {
    const video = videoRef.current;
    if (!video || !ready) return;
    if (!video.paused) {
      video.pause();
      return;
    }
    const end = info?.segmentEnd ?? video.duration;
    if (video.currentTime >= end - 0.04) video.currentTime = segmentStart;
    void video
      .play()
      .catch(() => setError("视频暂时无法播放，请检查视频加载状态后重试。"));
  }, [ready, info, segmentStart]);
  actions.current = { onClose, toggle };

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        actions.current.onClose();
      } else if (
        (event.code === "Space" || event.key === " ") &&
        !isVideoTextEntry(event.target)
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!event.repeat) actions.current.toggle();
      } else if (event.key === "Tab") {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),select,input,a[href],[tabindex="0"]',
        );
        if (!focusable?.length) return;
        const first = focusable[0],
          last = focusable[focusable.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === dialogRef.current)
        ) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
      // Arrow keys and native input controls must not navigate the background episode.
      if (event.key === "ArrowUp" || event.key === "ArrowDown")
        event.stopImmediatePropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = overflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (videoEl) videoEl.playbackRate = rate;
  }, [videoEl, rate]);

  useEffect(
    () => () => {
      videoEl?.pause();
    },
    [videoEl],
  );

  const attachVideo = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    setVideoEl(el);
  }, []);
  const seek = (value: number) => {
    const bounded = Math.max(0, Math.min(duration, value));
    relativeTime.current = bounded;
    setTime(bounded);
    if (videoRef.current) videoRef.current.currentTime = segmentStart + bounded;
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Episode ${episodeIndex} 视频复核`}
        className="flex h-[75vh] w-[75vw] min-w-0 flex-col overflow-hidden rounded-xl border border-white/15 bg-[var(--surface-1)] shadow-2xl outline-none"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
          <div>
            <h3 className="font-semibold text-slate-100">
              Episode {episodeIndex} · 视频复核
            </h3>
            <p className="text-xs text-slate-400">
              空格播放/暂停 · Esc 关闭 · 原始轨迹
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!!videos.length && (
              <select
                aria-label="复核相机"
                className="max-w-[30vw] rounded bg-slate-900 px-2 py-1 text-xs text-slate-200"
                value={camera}
                onChange={(e) => {
                  videoRef.current?.pause();
                  setReady(false);
                  setError("");
                  setCamera(e.target.value);
                }}
              >
                {videos.map((video) => (
                  <option key={video.filename} value={video.filename}>
                    {video.filename}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              aria-label="关闭视频复核"
              onClick={onClose}
              className="rounded px-3 py-1 text-slate-200 hover:bg-white/10"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black">
          {loading && <p className="text-sm text-slate-400">正在加载视频…</p>}
          {info && (
            <video
              key={`${info.filename}:${info.url}`}
              ref={attachVideo}
              src={proxyHfUrl(info.url)}
              muted
              playsInline
              preload="auto"
              crossOrigin="anonymous"
              aria-label={`Episode ${episodeIndex} 复核视频`}
              className={`h-full w-full object-contain ${info.isGrayscale ? "opacity-0" : ""}`}
              onClick={toggle}
              onLoadedMetadata={(event) => {
                const video = event.currentTarget;
                const length = Math.max(
                  0,
                  Math.min(info.segmentEnd ?? video.duration, video.duration) -
                    segmentStart,
                );
                setDuration(length);
                const target = Math.max(
                  0,
                  Math.min(relativeTime.current, Math.max(0, length - 0.04)),
                );
                video.currentTime = segmentStart + target;
                video.playbackRate = rate;
                relativeTime.current = target;
                setTime(target);
                setReady(true);
              }}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
              onTimeUpdate={(event) => {
                const video = event.currentTarget,
                  end = info.segmentEnd ?? video.duration;
                if (video.currentTime >= end - 0.025) {
                  video.pause();
                  if (video.currentTime > end) video.currentTime = end;
                }
                const value = Math.max(
                  0,
                  Math.min(duration, video.currentTime - segmentStart),
                );
                relativeTime.current = value;
                setTime(value);
              }}
              onError={() => {
                setReady(false);
                setError("视频加载失败。可切换相机查看其他视角。");
              }}
            />
          )}
          <ColormappedVideo
            videoEl={videoEl}
            active={info?.isGrayscale}
            range={info?.colormapRange}
          />
          {error && (
            <p
              role="alert"
              className="absolute bottom-3 max-w-[90%] rounded bg-slate-900/90 px-3 py-2 text-sm text-red-300"
            >
              {error}
            </p>
          )}
        </div>
        <div className="shrink-0 space-y-2 px-4 py-3">
          <div className="flex items-center gap-3 text-xs text-slate-300">
            <button
              type="button"
              disabled={!ready}
              aria-label={playing ? "暂停复核视频" : "播放复核视频"}
              onClick={toggle}
              className="rounded border border-white/15 px-3 py-1.5 disabled:opacity-40"
            >
              {playing ? "暂停" : "播放"}
            </button>
            <input
              aria-label="复核视频进度"
              className="min-w-0 flex-1 accent-cyan-400"
              type="range"
              min={0}
              max={duration || 1}
              step={0.01}
              value={time}
              disabled={!ready}
              onChange={(e) => seek(Number(e.target.value))}
            />
            <span className="tabular-nums">
              {time.toFixed(2)} / {duration.toFixed(2)} 秒
            </span>
            <select
              aria-label="复核播放速度"
              className="rounded bg-slate-900 p-1"
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
            >
              {[0.25, 0.5, 1, 2].map((value) => (
                <option key={value} value={value}>
                  {value}×
                </option>
              ))}
            </select>
          </div>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
