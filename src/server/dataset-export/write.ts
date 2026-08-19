import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type { EpisodeSelectionPlan } from "@/server/dataset-export/selection";
import { PADDING } from "@/utils/constants";
import { formatStringWithVars } from "@/utils/parquetUtils";

import type { DatasetExportInspection } from "./inspect";

const execFileAsync = promisify(execFile);
const PARQUET_REWRITE_SCRIPT = path.join(
  process.cwd(),
  "src/server/dataset-export/rewrite_episode_parquet.py",
);

type OutputFile =
  | {
      outputPath: string;
      kind: "write";
      data: string | Buffer;
    }
  | {
      outputPath: string;
      kind: "copy";
      sourcePath: string;
    }
  | {
      outputPath: string;
      kind: "rewrite-parquet";
      sourcePath: string;
      nextEpisodeIndex: number;
      globalIndexStart: number;
    };

async function assertOutputPathDoesNotExist(outputPath: string): Promise<void> {
  try {
    await fs.access(outputPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }

    throw error;
  }

  throw new Error("输出目录已存在");
}

function getEpisodeLength(rawEpisode: Record<string, unknown>): number | null {
  const length = rawEpisode.length;
  if (typeof length === "number" && Number.isInteger(length) && length >= 0) {
    return length;
  }

  return null;
}

async function isParquetFile(filePath: string): Promise<boolean> {
  const stat = await fs.stat(filePath);
  if (stat.size < 8) return false;

  const file = await fs.open(filePath, "r");
  try {
    const header = Buffer.alloc(4);
    const footer = Buffer.alloc(4);
    await file.read(header, 0, 4, 0);
    await file.read(footer, 0, 4, stat.size - 4);
    return (
      header.toString("ascii") === "PAR1" && footer.toString("ascii") === "PAR1"
    );
  } finally {
    await file.close();
  }
}

async function rewriteParquetEpisodeData(input: {
  sourcePath: string;
  outputPath: string;
  nextEpisodeIndex: number;
  globalIndexStart: number;
}): Promise<void> {
  await execFileAsync("python3", [
    PARQUET_REWRITE_SCRIPT,
    input.sourcePath,
    input.outputPath,
    String(input.nextEpisodeIndex),
    String(input.globalIndexStart),
  ]);
}

function buildTempOutputPath(outputPath: string): string {
  return `${outputPath}.tmp-${process.pid}-${Date.now()}`;
}

async function resolveEpisodeDataPath(
  datasetPath: string,
  dataFile: string,
): Promise<string> {
  if (path.isAbsolute(dataFile)) {
    throw new Error("Episode data_file must stay within the dataset root");
  }

  const datasetRoot = path.resolve(datasetPath);
  const resolvedPath = path.resolve(datasetRoot, dataFile);
  const relativePath = path.relative(datasetRoot, resolvedPath);

  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error("Episode data_file must stay within the dataset root");
  }

  const realDatasetRoot = await fs.realpath(datasetRoot);
  const realResolvedPath = await fs.realpath(resolvedPath);
  const realRelativePath = path.relative(realDatasetRoot, realResolvedPath);

  if (
    realRelativePath === "" ||
    realRelativePath === ".." ||
    realRelativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(realRelativePath)
  ) {
    throw new Error("Episode data_file must stay within the dataset root");
  }

  return resolvedPath;
}

function buildTemplatedEpisodePath(input: {
  template: string;
  info: Record<string, unknown>;
  episodeIndex: number;
  videoKey?: string;
}): string {
  const chunksSize =
    typeof input.info.chunks_size === "number" &&
    Number.isFinite(input.info.chunks_size)
      ? input.info.chunks_size
      : 1000;
  const episodeChunk = Math.floor(input.episodeIndex / Math.max(1, chunksSize));

  return formatStringWithVars(input.template, {
    video_key: input.videoKey ?? "",
    episode_chunk: episodeChunk.toString().padStart(PADDING.CHUNK_INDEX, "0"),
    episode_index: input.episodeIndex
      .toString()
      .padStart(PADDING.EPISODE_INDEX, "0"),
  });
}

function buildNextDataFile(input: {
  info: Record<string, unknown>;
  rawEpisode: Record<string, unknown>;
  sourceDataFile: string;
  nextEpisodeIndex: number;
}): string {
  if (typeof input.rawEpisode.data_file === "string") {
    const extension = path.extname(input.sourceDataFile) || ".json";
    return `data/episode_${String(input.nextEpisodeIndex).padStart(6, "0")}${extension}`;
  }

  if (
    typeof input.info.data_path !== "string" ||
    !input.info.data_path.trim()
  ) {
    throw new Error(
      "Episode metadata is invalid: data_file must be a non-empty string",
    );
  }
  return buildTemplatedEpisodePath({
    template: input.info.data_path,
    info: input.info,
    episodeIndex: input.nextEpisodeIndex,
  });
}

function getVideoFeatureKeys(info: Record<string, unknown>): string[] {
  if (!info.features || typeof info.features !== "object") return [];

  return Object.entries(
    info.features as Record<string, Record<string, unknown>>,
  )
    .filter(([, feature]) => feature?.dtype === "video")
    .map(([key]) => key);
}

function buildVideoFilePairs(input: {
  info: Record<string, unknown>;
  sourceEpisodeIndex: number;
  nextEpisodeIndex: number;
}): Array<{ sourceFile: string; nextFile: string }> {
  if (typeof input.info.video_path !== "string" || !input.info.video_path) {
    return [];
  }

  const seen = new Set<string>();
  return getVideoFeatureKeys(input.info).flatMap((videoKey) => {
    const sourceFile = buildTemplatedEpisodePath({
      template: input.info.video_path as string,
      info: input.info,
      episodeIndex: input.sourceEpisodeIndex,
      videoKey,
    });
    const nextFile = buildTemplatedEpisodePath({
      template: input.info.video_path as string,
      info: input.info,
      episodeIndex: input.nextEpisodeIndex,
      videoKey,
    });
    const key = `${sourceFile}\0${nextFile}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ sourceFile, nextFile }];
  });
}

function shouldSkipMetaFile(relativePath: string): boolean {
  const normalized = relativePath.split(path.sep).join("/");
  const baseName = path.posix.basename(normalized);

  if (normalized === "info.json" || normalized === "episodes.jsonl") {
    return true;
  }

  return /^stats(?:_|\.|$)/.test(baseName);
}

function rewriteInfoJson(input: {
  info: Record<string, unknown>;
  rewrittenEpisodes: Array<Record<string, unknown>>;
  totalVideos: number;
}): Record<string, unknown> {
  const totalFrames = input.rewrittenEpisodes.reduce((sum, episode) => {
    const length = getEpisodeLength(episode);
    return length == null ? sum : sum + length;
  }, 0);
  const allEpisodesHaveLengths = input.rewrittenEpisodes.every(
    (episode) => getEpisodeLength(episode) != null,
  );
  const nextInfo: Record<string, unknown> = {
    ...input.info,
    total_episodes: input.rewrittenEpisodes.length,
  };

  if (typeof input.info.total_frames === "number" || allEpisodesHaveLengths) {
    nextInfo.total_frames = totalFrames;
  }

  if (typeof input.info.total_videos === "number") {
    nextInfo.total_videos = input.totalVideos;
  }

  if (typeof input.info.total_chunks === "number") {
    const chunksSize =
      typeof input.info.chunks_size === "number" &&
      Number.isFinite(input.info.chunks_size)
        ? Math.max(1, input.info.chunks_size)
        : 1000;
    nextInfo.total_chunks = Math.max(
      1,
      Math.ceil(input.rewrittenEpisodes.length / chunksSize),
    );
  }

  if (
    input.info.splits &&
    typeof input.info.splits === "object" &&
    !Array.isArray(input.info.splits)
  ) {
    nextInfo.splits = {
      ...(input.info.splits as Record<string, unknown>),
      train: `0:${input.rewrittenEpisodes.length}`,
    };
  }

  return nextInfo;
}

function rewriteEpisodeIndexedJsonl(input: {
  text: string;
  episodeIdMap: Record<number, number>;
}): string {
  const lines = input.text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const rewritten = lines.flatMap((line) => {
    const entry = JSON.parse(line) as Record<string, unknown>;
    const episodeIndex = entry.episode_index;
    if (typeof episodeIndex !== "number") return [];

    const nextEpisodeIndex = input.episodeIdMap[episodeIndex];
    if (nextEpisodeIndex == null) return [];

    return [
      JSON.stringify({
        ...entry,
        episode_index: nextEpisodeIndex,
        source_episode_index: episodeIndex,
      }),
    ];
  });

  return rewritten.length > 0 ? `${rewritten.join("\n")}\n` : "";
}

async function copyAdditionalMetaFiles(input: {
  inspection: DatasetExportInspection;
  selection: EpisodeSelectionPlan;
  tempOutputPath: string;
}): Promise<void> {
  const sourceMetaPath = path.join(input.inspection.datasetPath, "meta");
  let entries: string[];

  try {
    entries = await fs.readdir(sourceMetaPath, { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }

  await Promise.all(
    entries.map(async (entry) => {
      const relativePath = String(entry);
      if (shouldSkipMetaFile(relativePath)) return;

      const sourcePath = path.join(sourceMetaPath, relativePath);
      const stat = await fs.stat(sourcePath);
      if (!stat.isFile()) return;

      const targetPath = path.join(input.tempOutputPath, "meta", relativePath);
      await fs.mkdir(path.dirname(targetPath), { recursive: true });

      if (relativePath.split(path.sep).join("/") === "episodes_stats.jsonl") {
        const rewrittenStats = rewriteEpisodeIndexedJsonl({
          text: await fs.readFile(sourcePath, "utf8"),
          episodeIdMap: input.selection.episodeIdMap,
        });
        await fs.writeFile(targetPath, rewrittenStats, "utf8");
        return;
      }

      await fs.copyFile(sourcePath, targetPath);
    }),
  );
}

export async function writeFilteredDataset(input: {
  inspection: DatasetExportInspection;
  selection: EpisodeSelectionPlan;
  outputPath: string;
}): Promise<void> {
  await assertOutputPathDoesNotExist(input.outputPath);

  const preparedEpisodes: Array<{
    outputFiles: OutputFile[];
    rewrittenEpisode: Record<string, unknown>;
  }> = [];
  let globalFrameStart = 0;

  for (const sourceEpisodeId of input.selection.keptEpisodeIds) {
    const episode = input.inspection.episodes.find(
      (item) => item.episodeIndex === sourceEpisodeId,
    );
    if (!episode) {
      throw new Error(`Missing episode metadata for ${sourceEpisodeId}`);
    }

    const nextEpisodeIndex = input.selection.episodeIdMap[sourceEpisodeId];
    const nextDataFile = buildNextDataFile({
      info: input.inspection.info,
      rawEpisode: episode.raw,
      sourceDataFile: episode.dataFile,
      nextEpisodeIndex,
    });
    const extension = path.extname(nextDataFile) || ".json";
    const sourceDataPath = await resolveEpisodeDataPath(
      input.inspection.datasetPath,
      episode.dataFile,
    );
    const isJsonData = extension.toLowerCase() === ".json";
    const isParquetData =
      extension.toLowerCase() === ".parquet" &&
      (await isParquetFile(sourceDataPath));
    const episodeLength = getEpisodeLength(episode.raw);
    const outputFiles: OutputFile[] = [];

    if (isJsonData) {
      const rawEpisodeData = await fs.readFile(sourceDataPath, "utf8");
      outputFiles.push({
        outputPath: path.join(input.outputPath, nextDataFile),
        kind: "write",
        data: JSON.stringify(
          {
            ...(JSON.parse(rawEpisodeData) as Record<string, unknown>),
            episode_index: nextEpisodeIndex,
            source_episode_index: sourceEpisodeId,
          },
          null,
          2,
        ),
      });
    } else if (isParquetData) {
      outputFiles.push({
        outputPath: path.join(input.outputPath, nextDataFile),
        kind: "rewrite-parquet",
        sourcePath: sourceDataPath,
        nextEpisodeIndex,
        globalIndexStart: globalFrameStart,
      });
    } else {
      outputFiles.push({
        outputPath: path.join(input.outputPath, nextDataFile),
        kind: "copy",
        sourcePath: sourceDataPath,
      });
    }

    for (const { sourceFile, nextFile } of buildVideoFilePairs({
      info: input.inspection.info,
      sourceEpisodeIndex: sourceEpisodeId,
      nextEpisodeIndex,
    })) {
      const sourceVideoPath = await resolveEpisodeDataPath(
        input.inspection.datasetPath,
        sourceFile,
      );
      outputFiles.push({
        outputPath: path.join(input.outputPath, nextFile),
        kind: "copy",
        sourcePath: sourceVideoPath,
      });
    }

    preparedEpisodes.push({
      outputFiles,
      rewrittenEpisode: {
        ...episode.raw,
        episode_index: nextEpisodeIndex,
        ...(episode.raw.data_file ? { data_file: nextDataFile } : {}),
        source_episode_index: sourceEpisodeId,
      },
    });

    globalFrameStart += episodeLength ?? 0;
  }

  const tempOutputPath = buildTempOutputPath(input.outputPath);

  try {
    await fs.mkdir(path.join(tempOutputPath, "meta"), { recursive: true });
    await copyAdditionalMetaFiles({
      inspection: input.inspection,
      selection: input.selection,
      tempOutputPath,
    });

    await Promise.all(
      preparedEpisodes.flatMap(({ outputFiles }) =>
        outputFiles.map(async (outputFile) => {
          const relativeOutputPath = path.relative(
            input.outputPath,
            outputFile.outputPath,
          );
          const tempDataPath = path.join(tempOutputPath, relativeOutputPath);
          await fs.mkdir(path.dirname(tempDataPath), { recursive: true });
          if (outputFile.kind === "write") {
            await fs.writeFile(tempDataPath, outputFile.data);
            return;
          }

          if (outputFile.kind === "rewrite-parquet") {
            await rewriteParquetEpisodeData({
              sourcePath: outputFile.sourcePath,
              outputPath: tempDataPath,
              nextEpisodeIndex: outputFile.nextEpisodeIndex,
              globalIndexStart: outputFile.globalIndexStart,
            });
            return;
          }

          await fs.copyFile(outputFile.sourcePath, tempDataPath);
        }),
      ),
    );

    const rewrittenEpisodes = preparedEpisodes.map(
      ({ rewrittenEpisode }) => rewrittenEpisode,
    );

    await fs.writeFile(
      path.join(tempOutputPath, "meta", "episodes.jsonl"),
      `${rewrittenEpisodes.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
      "utf8",
    );

    await fs.writeFile(
      path.join(tempOutputPath, "meta", "info.json"),
      JSON.stringify(
        rewriteInfoJson({
          info: input.inspection.info,
          rewrittenEpisodes,
          totalVideos: preparedEpisodes.reduce(
            (sum, episode) =>
              sum +
              episode.outputFiles.filter((file) => {
                const normalized = file.outputPath.split(path.sep).join("/");
                return normalized.startsWith("videos/");
              }).length,
            0,
          ),
        }),
        null,
        2,
      ),
      "utf8",
    );

    await fs.rename(tempOutputPath, input.outputPath);
  } catch (error) {
    await fs.rm(tempOutputPath, { recursive: true, force: true });
    throw error;
  }
}
