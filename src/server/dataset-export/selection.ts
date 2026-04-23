export type ExportMode = "flagged" | "unflagged";

export type EpisodeSelectionPlan = {
  mode: ExportMode;
  sourceEpisodeIds: number[];
  keptEpisodeIds: number[];
  droppedEpisodeIds: number[];
  episodeIdMap: Record<number, number>;
  newTotalEpisodes: number;
};

export function buildEpisodeSelectionPlan(input: {
  totalEpisodes: number;
  flaggedEpisodeIds: number[];
  mode: ExportMode;
}): EpisodeSelectionPlan {
  if (input.mode !== "flagged" && input.mode !== "unflagged") {
    throw new Error("Export mode must be either flagged or unflagged");
  }

  if (!Number.isInteger(input.totalEpisodes) || input.totalEpisodes <= 0) {
    throw new Error("Total episodes must be a positive integer");
  }

  const sourceEpisodeIds = Array.from({ length: input.totalEpisodes }, (_, index) => index);
  const flaggedEpisodeIds = [...new Set(input.flaggedEpisodeIds)].sort((a, b) => a - b);

  for (const episodeId of flaggedEpisodeIds) {
    if (!Number.isInteger(episodeId) || episodeId < 0 || episodeId >= input.totalEpisodes) {
      throw new Error(`Flagged episode id ${episodeId} is out of range`);
    }
  }

  const flaggedSet = new Set(flaggedEpisodeIds);
  const keptEpisodeIds =
    input.mode === "flagged"
      ? flaggedEpisodeIds
      : sourceEpisodeIds.filter((episodeId) => !flaggedSet.has(episodeId));

  if (keptEpisodeIds.length === 0) {
    throw new Error(
      input.mode === "flagged"
        ? "没有可导出的 flagged episodes"
        : "没有可导出的 unflagged episodes",
    );
  }

  const keptEpisodeIdSet = new Set(keptEpisodeIds);
  const droppedEpisodeIds = sourceEpisodeIds.filter((episodeId) => !keptEpisodeIdSet.has(episodeId));
  const episodeIdMap = Object.fromEntries(
    keptEpisodeIds.map((episodeId, nextEpisodeId) => [episodeId, nextEpisodeId]),
  );

  return {
    mode: input.mode,
    sourceEpisodeIds,
    keptEpisodeIds,
    droppedEpisodeIds,
    episodeIdMap,
    newTotalEpisodes: keptEpisodeIds.length,
  };
}

export function defaultExportAlias(repoId: string, mode: ExportMode): string {
  const displayName = repoId.replace(/^local\//, "");
  return `${displayName}_${mode}`;
}
