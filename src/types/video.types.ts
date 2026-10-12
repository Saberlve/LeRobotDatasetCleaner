/**
 * Video type definitions
 */

// Video information structure
export interface VideoInfo {
  filename: string;
  url: string;
  isSegmented?: boolean;
  segmentStart?: number;
  segmentEnd?: number;
  segmentDuration?: number;
  // Native streams use a packed presentation clock. These ordered pairs map
  // the recorded capture clock onto the episode timeline (absolute MP4 times).
  timeMapping?: {
    episodeTimestamps: number[];
    videoTimestamps: number[];
  };
  // Single-channel feed (info.json feature shape [h, w, 1]) — rendered with
  // the viridis colormap instead of raw grayscale.
  isGrayscale?: boolean;
  // [low, high] normalized luminance band the colormap spans, derived from the
  // feature's q10/q90 in meta/stats.json. Undefined → span the full 0..1.
  colormapRange?: [number, number];
}

// Adjacent episode video info for preloading
export interface AdjacentEpisodeVideos {
  episodeId: number;
  videosInfo: VideoInfo[];
}
