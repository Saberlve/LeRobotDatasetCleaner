import fs from "node:fs/promises";
import path from "node:path";

export type DatasetExportInspection = {
  datasetPath: string;
  info: Record<string, unknown>;
  episodes: Array<{
    episodeIndex: number;
    dataFile: string;
    raw: Record<string, unknown>;
  }>;
};

function assertValidEpisodeRecord(
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

  if (typeof dataFile !== "string" || !dataFile.trim()) {
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
    dataFile,
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
    .map((raw) => assertValidEpisodeRecord(raw, seenEpisodeIndexes));

  return { datasetPath, info, episodes };
}
