import fs from "node:fs/promises";
import path from "node:path";

import type { EpisodeSelectionPlan } from "@/server/dataset-export/selection";

import type { DatasetExportInspection } from "./inspect";

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

export async function writeFilteredDataset(input: {
  inspection: DatasetExportInspection;
  selection: EpisodeSelectionPlan;
  outputPath: string;
}): Promise<void> {
  await assertOutputPathDoesNotExist(input.outputPath);
  await fs.mkdir(path.join(input.outputPath, "meta"), { recursive: true });
  await fs.mkdir(path.join(input.outputPath, "data"), { recursive: true });

  const rewrittenEpisodes = await Promise.all(
    input.selection.keptEpisodeIds.map(async (sourceEpisodeId) => {
      const episode = input.inspection.episodes.find(
        (item) => item.episodeIndex === sourceEpisodeId,
      );
      if (!episode) {
        throw new Error(`Missing episode metadata for ${sourceEpisodeId}`);
      }

      const nextEpisodeIndex = input.selection.episodeIdMap[sourceEpisodeId];
      const nextDataFile = `data/episode_${String(nextEpisodeIndex).padStart(6, "0")}.json`;
      const sourceDataPath = path.join(input.inspection.datasetPath, episode.dataFile);
      const outputDataPath = path.join(input.outputPath, nextDataFile);
      const rawEpisodeData = await fs.readFile(sourceDataPath, "utf8");
      const parsedEpisodeData = JSON.parse(rawEpisodeData) as Record<string, unknown>;

      await fs.writeFile(
        outputDataPath,
        JSON.stringify(
          {
            ...parsedEpisodeData,
            episode_index: nextEpisodeIndex,
            source_episode_index: sourceEpisodeId,
          },
          null,
          2,
        ),
        "utf8",
      );

      return {
        ...episode.raw,
        episode_index: nextEpisodeIndex,
        data_file: nextDataFile,
        source_episode_index: sourceEpisodeId,
      };
    }),
  );

  await fs.writeFile(
    path.join(input.outputPath, "meta", "episodes.jsonl"),
    `${rewrittenEpisodes.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
    "utf8",
  );

  await fs.writeFile(
    path.join(input.outputPath, "meta", "info.json"),
    JSON.stringify(
      {
        ...input.inspection.info,
        total_episodes: input.selection.newTotalEpisodes,
      },
      null,
      2,
    ),
    "utf8",
  );
}
