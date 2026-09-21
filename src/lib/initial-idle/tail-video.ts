import type { VideoInfo } from "@/types";
import { proxyHfUrl } from "@/utils/auth";
import type { VisualSampler } from "./trailing";

/** Separate decoders: analysis must never seek the visible review videos. */
export function createTailVideoSampler(
  videos: VideoInfo[],
  fps: number,
  signal: AbortSignal,
) {
  const resources = videos.map((info) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.muted = true;
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 120;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    return { info, video, canvas, context, initialized: false };
  });
  function wait(video: HTMLVideoElement, event: string, run: () => void) {
    return new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer);
        video.removeEventListener(event, ready);
        video.removeEventListener("error", failed);
        signal.removeEventListener("abort", aborted);
        if (error) reject(error);
        else resolve();
      };
      const ready = () => finish();
      const failed = () => finish(new Error("视频解码失败"));
      const aborted = () => finish(new Error("检测已取消"));
      const timer = setTimeout(
        () => finish(new Error("视频读取超时，请检查连接后重试")),
        15000,
      );
      video.addEventListener(event, ready, { once: true });
      video.addEventListener("error", failed, { once: true });
      signal.addEventListener("abort", aborted, { once: true });
      if (signal.aborted) {
        aborted();
        return;
      }
      try {
        run();
      } catch (e) {
        finish(e instanceof Error ? e : new Error("视频定位失败"));
      }
    });
  }
  const sample: VisualSampler = async (frame) => {
    const output = [];
    for (const r of resources) {
      signal.throwIfAborted();
      if (!r.initialized) {
        await wait(r.video, "loadeddata", () => {
          r.video.src = proxyHfUrl(r.info.url);
          r.video.load();
        });
        r.initialized = true;
      }
      const start = r.info.segmentStart ?? 0;
      const end = Math.min(
        r.video.duration,
        r.info.segmentEnd ?? r.video.duration,
      );
      const time = start + frame.timestamp;
      if (
        !Number.isFinite(end) ||
        time < start ||
        time >= end ||
        !r.context ||
        !r.video.videoWidth
      )
        throw new Error(`视频 ${r.info.filename} 不覆盖该帧或无法解码`);
      if (Math.abs(r.video.currentTime - time) > 0.00001)
        await wait(r.video, "seeked", () => {
          r.video.currentTime = time;
        });
      if (
        r.video.readyState < 2 ||
        Math.abs(r.video.currentTime - time) > 0.5 / fps
      )
        throw new Error("视频时间对齐失败");
      r.context.drawImage(r.video, 0, 0, 160, 120);
      const pixels = r.context.getImageData(0, 0, 160, 120).data;
      // Near-uniform black/blank footage is not evidence of a stationary scene.
      let min = 255,
        max = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const value = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
      if (max - min < 2)
        throw new Error(`视频 ${r.info.filename} 为近乎空白画面，请人工复核`);
      output.push({ camera: r.info.filename, pixels });
    }
    return output;
  };
  return {
    sample,
    dispose() {
      for (const r of resources) {
        r.video.pause();
        r.video.removeAttribute("src");
        r.video.load();
        r.canvas.width = 0;
      }
    },
  };
}
