import fs from "node:fs/promises";

import {
  buildEpisodeSelectionPlan,
  type ExportMode,
} from "@/server/dataset-export/selection";
import {
  buildExportRepoId,
  loadLocalDatasetRegistry,
  registerLocalDataset,
} from "@/server/local-datasets/registry";

import { inspectExportableDataset } from "./inspect";
import { writeFilteredDataset } from "./write";

export async function exportFilteredDataset(input: {
  repoId: string;
  datasetPath?: string;
  flaggedEpisodeIds: number[];
  mode: ExportMode;
  outputPath: string;
  alias?: string;
}) {
  if (!input.repoId.startsWith("local/")) {
    throw new Error("只能导出本地数据集。");
  }

  if (!input.outputPath.trim()) {
    throw new Error("输出目录不能为空。");
  }

  const exportRepoId = buildExportRepoId(
    input.repoId,
    input.alias ?? "",
    input.mode,
  );
  const exportAlias = exportRepoId.replace(/^local\//, "");
  const datasetPath =
    input.datasetPath ??
    (await loadLocalDatasetRegistry()).find(
      (entry) => entry.repoId === input.repoId,
    )?.path;

  if (!datasetPath) {
    throw new Error(`找不到本地数据集: ${input.repoId}`);
  }

  const inspection = await inspectExportableDataset(datasetPath);
  const selection = buildEpisodeSelectionPlan({
    totalEpisodes: Number(inspection.info.total_episodes),
    flaggedEpisodeIds: input.flaggedEpisodeIds,
    mode: input.mode,
  });

  await writeFilteredDataset({
    inspection,
    selection,
    outputPath: input.outputPath,
  });

  let entry;
  try {
    entry = await registerLocalDataset({
      datasetPath: input.outputPath,
      alias: exportAlias,
    });
  } catch (error) {
    await fs.rm(input.outputPath, { recursive: true, force: true });
    throw error;
  }

  return {
    repoId: entry.repoId,
    path: entry.path,
    mode: input.mode,
    totalEpisodes: selection.newTotalEpisodes,
    entryRoute: `/${entry.repoId}/episode_0`,
    summary: {
      sourceRepoId: input.repoId,
      sourceTotalEpisodes: Number(inspection.info.total_episodes),
      exportedEpisodes: selection.newTotalEpisodes,
      droppedEpisodes: selection.droppedEpisodeIds.length,
    },
  };
}
