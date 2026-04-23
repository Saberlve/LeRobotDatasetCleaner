import {
  buildEpisodeSelectionPlan,
  defaultExportAlias,
  type ExportMode,
} from "@/server/dataset-export/selection";
import { registerLocalDataset } from "@/server/local-datasets/registry";

import { inspectExportableDataset } from "./inspect";
import { writeFilteredDataset } from "./write";

export async function exportFilteredDataset(input: {
  repoId: string;
  datasetPath: string;
  flaggedEpisodeIds: number[];
  mode: ExportMode;
  outputPath: string;
  alias?: string;
}) {
  const inspection = await inspectExportableDataset(input.datasetPath);
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

  const entry = await registerLocalDataset({
    datasetPath: input.outputPath,
    alias: input.alias ?? defaultExportAlias(input.repoId, input.mode),
  });

  return {
    repoId: entry.repoId,
    path: input.outputPath,
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
