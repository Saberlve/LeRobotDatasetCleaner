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

function buildTempOutputPath(outputPath: string): string {
  return `${outputPath}.tmp-${process.pid}-${Date.now()}`;
}

async function resolveEpisodeDataPath(datasetPath: string, dataFile: string): Promise<string> {
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

export async function writeFilteredDataset(input: {
  inspection: DatasetExportInspection;
  selection: EpisodeSelectionPlan;
  outputPath: string;
}): Promise<void> {
  await assertOutputPathDoesNotExist(input.outputPath);

  const preparedEpisodes = await Promise.all(
    input.selection.keptEpisodeIds.map(async (sourceEpisodeId) => {
      const episode = input.inspection.episodes.find(
        (item) => item.episodeIndex === sourceEpisodeId,
      );
      if (!episode) {
        throw new Error(`Missing episode metadata for ${sourceEpisodeId}`);
      }

      const nextEpisodeIndex = input.selection.episodeIdMap[sourceEpisodeId];
      const nextDataFile = `data/episode_${String(nextEpisodeIndex).padStart(6, "0")}.json`;
      const sourceDataPath = await resolveEpisodeDataPath(
        input.inspection.datasetPath,
        episode.dataFile,
      );
      const rawEpisodeData = await fs.readFile(sourceDataPath, "utf8");
      const parsedEpisodeData = JSON.parse(rawEpisodeData) as Record<string, unknown>;

      return {
        outputDataPath: path.join(input.outputPath, nextDataFile),
        outputData: {
          ...parsedEpisodeData,
          episode_index: nextEpisodeIndex,
          source_episode_index: sourceEpisodeId,
        },
        rewrittenEpisode: {
          ...episode.raw,
          episode_index: nextEpisodeIndex,
          data_file: nextDataFile,
          source_episode_index: sourceEpisodeId,
        },
      };
    }),
  );

  const tempOutputPath = buildTempOutputPath(input.outputPath);

  try {
    await fs.mkdir(path.join(tempOutputPath, "meta"), { recursive: true });
    await fs.mkdir(path.join(tempOutputPath, "data"), { recursive: true });

    await Promise.all(
      preparedEpisodes.map(({ outputDataPath, outputData }) =>
        fs.writeFile(
          outputDataPath.replace(input.outputPath, tempOutputPath),
          JSON.stringify(outputData, null, 2),
          "utf8",
        ),
      ),
    );

    const rewrittenEpisodes = preparedEpisodes.map(({ rewrittenEpisode }) => rewrittenEpisode);

    await fs.writeFile(
      path.join(tempOutputPath, "meta", "episodes.jsonl"),
      `${rewrittenEpisodes.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
      "utf8",
    );

    await fs.writeFile(
      path.join(tempOutputPath, "meta", "info.json"),
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

    await fs.rename(tempOutputPath, input.outputPath);
  } catch (error) {
    await fs.rm(tempOutputPath, { recursive: true, force: true });
    throw error;
  }
}
