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

export async function inspectExportableDataset(
  datasetPath: string,
): Promise<DatasetExportInspection> {
  const info = JSON.parse(
    await fs.readFile(path.join(datasetPath, "meta", "info.json"), "utf8"),
  ) as Record<string, unknown>;

  const episodes = (await fs.readFile(path.join(datasetPath, "meta", "episodes.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .map((raw) => ({
      episodeIndex: Number(raw.episode_index),
      dataFile: String(raw.data_file),
      raw,
    }));

  return { datasetPath, info, episodes };
}
