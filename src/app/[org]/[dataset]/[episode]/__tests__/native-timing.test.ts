import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, test, vi } from "vitest";
import { episodeToVideoTime } from "@/lib/video-time";

const state = vi.hoisted(() => ({
  root: "",
  info: {},
  reads: new Map<string, number>(),
}));
vi.mock("@/utils/versionUtils", () => ({
  getDatasetVersionAndInfo: async () => ({ version: "v3.0", info: state.info }),
  buildVersionedUrl: (_repo: string, _version: string, file: string) =>
    path.join(state.root, file),
  getDatasetStats: async () => null,
}));
vi.mock("@/utils/parquetUtils", async (original) => ({
  ...(await original<object>()),
  fetchParquetFile: async (file: string) => {
    state.reads.set(file, (state.reads.get(file) ?? 0) + 1);
    const bytes = await fs.readFile(file);
    return bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
  },
}));
import {
  getEpisodeData,
  getEpisodeVideosInfo,
  iterateEpisodeMetadataFilesV3,
} from "../fetch-data";

afterEach(async () => {
  if (state.root) await fs.rm(state.root, { recursive: true, force: true });
  state.reads.clear();
});

async function fixture(sidecars: boolean) {
  state.root = await fs.mkdtemp(path.join(os.tmpdir(), "native-video-timing-"));
  state.info = {
    codebase_version: "v3.0",
    fps: 15,
    total_episodes: 1,
    total_frames: 236,
    video_path:
      "videos/{video_key}/chunk-{chunk_index:03d}/file-{file_index:03d}.mp4",
    features: {
      action: { dtype: "float32", shape: [1], names: ["gripper.pos"] },
      "observation.state": {
        dtype: "float32",
        shape: [1],
        names: ["gripper.pos"],
      },
      timestamp: { dtype: "float32", shape: [1], names: null },
      "observation.images.camera": {
        dtype: "video",
        shape: [480, 640, 3],
        info: { "video.fps": 15 },
      },
      "observation.images.photon_right": {
        dtype: "video",
        shape: [700, 400, 3],
        info: { "video.fps": 60 },
      },
      "observation.photon_right.tactile_range": {
        dtype: "int64",
        shape: [2],
        names: null,
      },
    },
  };
  await promisify(execFile)(process.env.LEROBOT_EXPORT_PYTHON || "python3", [
    "-c",
    [
      "import pathlib, sys, pyarrow as pa, pyarrow.parquet as pq",
      "root=pathlib.Path(sys.argv[1]); origin=189730114484615; n=863",
      "def write(rel, rows):",
      "    target=root/rel; target.parent.mkdir(parents=True, exist_ok=True)",
      "    pq.write_table(pa.Table.from_pylist(rows), target)",
      "meta={'episode_index':0,'data/chunk_index':0,'data/file_index':0,'dataset_from_index':0,'dataset_to_index':236,'length':236,'tasks':['pick egg'],'stats/action/mean':[0.0]}",
      "for cam,start,duration in [('camera',10,236/15),('photon_right',30,n/60)]:",
      "    prefix='videos/observation.images.'+cam+'/'",
      "    meta.update({prefix+'chunk_index':0,prefix+'file_index':0,prefix+'from_timestamp':start,prefix+'to_timestamp':start+duration})",
      "write('meta/episodes/chunk-000/file-000.parquet',[meta])",
      "rows=[]; previous=0",
      "for i in range(236):",
      "    end=min(n,int((i/15+0.01)*55)+1)",
      "    rows.append({'index':i,'timestamp':i/15,'action':[0.0],'observation.state':[0.0],'observation.photon_right.tactile_range':[previous,end]});previous=end",
      "write('data/chunk-000/file-000.parquet',rows)",
      "if sys.argv[2]=='yes':",
      "    write('timestamps/episode_000000.parquet',[{'frame_index':i,'action_send_start_ns':origin+round(i/15*1e9)} for i in range(236)])",
      "    write('tactile_streams/photon_right/episode_000000/samples.parquet',[{'capture_monotonic_ns':origin+round((i/55-0.01)*1e9),'video_timestamp_s':30+i/60} for i in range(n)])",
    ].join("\n"),
    state.root,
    sidecars ? "yes" : "no",
  ]);
}

test("real parquet timing reaches native playback and shares prefetched reads", async () => {
  await fixture(true);
  const [data, duplicate] = await Promise.all([
    getEpisodeData("lab", "native-timing", 0),
    getEpisodeData("lab", "native-timing", 0),
  ]);
  expect(duplicate).toBe(data);
  const native = data.videosInfo.find((v) =>
    v.filename.endsWith("photon_right"),
  )!;
  expect(native.timeMapping?.episodeTimestamps).toHaveLength(863);
  expect(Math.floor((episodeToVideoTime(native, 9) - 30) * 60)).toBe(495);
  expect(data.videosInfo[0].timeMapping).toBeUndefined();
  expect(await getEpisodeVideosInfo("lab/native-timing", 0)).toBe(
    data.videosInfo,
  );
  expect(
    state.reads.get(
      path.join(
        state.root,
        "tactile_streams/photon_right/episode_000000/samples.parquet",
      ),
    ),
  ).toBe(1);
  const batches = [];
  for await (const rows of iterateEpisodeMetadataFilesV3(
    "lab/native-timing",
    "v3.0",
  ))
    batches.push(rows);
  expect(batches[0][0]["stats/action/mean"]).toBeUndefined();
});

test("native exports without sidecars fall back to recorded per-action ranges", async () => {
  await fixture(false);
  const data = await getEpisodeData("lab", "native-range-fallback", 0);
  const native = data.videosInfo.find((v) =>
    v.filename.endsWith("photon_right"),
  )!;
  expect(native.timeMapping?.episodeTimestamps).toHaveLength(236);
  expect(episodeToVideoTime(native, 9)).toBeCloseTo(30 + 495 / 60);
});
