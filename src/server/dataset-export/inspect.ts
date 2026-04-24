import fs from "node:fs/promises";
import path from "node:path";

import { PADDING } from "@/utils/constants";
import { formatStringWithVars } from "@/utils/parquetUtils";

export type DatasetExportInspection = {
  datasetPath: string;
  info: Record<string, unknown>;
  episodes: Array<{
    episodeIndex: number;
    dataFile: string;
    raw: Record<string, unknown>;
  }>;
};

function formatEpisodeDataPath(
  template: string,
  episodeIndex: number,
  chunksSize: number,
): string {
  const episodeChunk = Math.floor(episodeIndex / Math.max(1, chunksSize));
  return formatStringWithVars(template, {
    episode_chunk: episodeChunk.toString().padStart(PADDING.CHUNK_INDEX, "0"),
    episode_index: episodeIndex.toString().padStart(PADDING.EPISODE_INDEX, "0"),
  });
}

function getTemplateDataFile(
  info: Record<string, unknown>,
  episodeIndex: number,
): string | null {
  if (typeof info.data_path !== "string" || !info.data_path.trim()) {
    return null;
  }

  const chunksSize =
    typeof info.chunks_size === "number" && Number.isFinite(info.chunks_size)
      ? info.chunks_size
      : 1000;
  return formatEpisodeDataPath(info.data_path, episodeIndex, chunksSize);
}

function assertValidEpisodeRecord(
  info: Record<string, unknown>,
  raw: Record<string, unknown>,
  seenEpisodeIndexes: Set<number>,
): {
  episodeIndex: number;
  dataFile: string;
  raw: Record<string, unknown>;
} {
  const episodeIndex = raw.episode_index;
  const dataFile = raw.data_file;

  if (
    typeof episodeIndex !== "number" ||
    !Number.isInteger(episodeIndex) ||
    episodeIndex < 0
  ) {
    throw new Error(
      "Episode metadata is invalid: episode_index must be a non-negative integer",
    );
  }

  if (
    "data_file" in raw &&
    (typeof dataFile !== "string" || !dataFile.trim())
  ) {
    throw new Error(
      "Episode metadata is invalid: data_file must be a non-empty string",
    );
  }

  const resolvedDataFile =
    typeof dataFile === "string"
      ? dataFile
      : getTemplateDataFile(info, episodeIndex);

  if (!resolvedDataFile) {
    throw new Error(
      "Episode metadata is invalid: data_file must be a non-empty string",
    );
  }

  if (seenEpisodeIndexes.has(episodeIndex)) {
    throw new Error("Episode metadata is invalid: duplicate episode_index");
  }

  seenEpisodeIndexes.add(episodeIndex);

  return {
    episodeIndex,
    dataFile: resolvedDataFile,
    raw,
  };
}

export async function inspectExportableDataset(
  datasetPath: string,
): Promise<DatasetExportInspection> {
  const info = JSON.parse(
    await fs.readFile(path.join(datasetPath, "meta", "info.json"), "utf8"),
  ) as Record<string, unknown>;

  const seenEpisodeIndexes = new Set<number>();
  const episodes = (
    await fs.readFile(path.join(datasetPath, "meta", "episodes.jsonl"), "utf8")
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .map((raw) => assertValidEpisodeRecord(info, raw, seenEpisodeIndexes));

  return { datasetPath, info, episodes };
}
