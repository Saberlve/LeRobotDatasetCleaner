export type EpisodeFilterMode = "all" | "flagged" | "unflagged";

export function filterEpisodeIdsByMode(
  episodes: number[],
  flagged: Set<number>,
  mode: EpisodeFilterMode,
): number[] {
  if (mode === "flagged") {
    return episodes.filter((episode) => flagged.has(episode));
  }

  if (mode === "unflagged") {
    return episodes.filter((episode) => !flagged.has(episode));
  }

  return episodes;
}

export function filterEpisodeIdsByModeKeepingCurrent({
  episodes,
  flagged,
  mode,
  currentEpisode,
}: {
  episodes: number[];
  flagged: Set<number>;
  mode: EpisodeFilterMode;
  currentEpisode: number;
}): number[] {
  const filteredEpisodes = new Set(
    filterEpisodeIdsByMode(episodes, flagged, mode),
  );
  if (episodes.includes(currentEpisode)) {
    filteredEpisodes.add(currentEpisode);
  }
  return episodes.filter((episode) => filteredEpisodes.has(episode));
}

export function getAdjacentEpisodeInFilter({
  episodes,
  flagged,
  mode,
  currentEpisode,
  direction,
}: {
  episodes: number[];
  flagged: Set<number>;
  mode: EpisodeFilterMode;
  currentEpisode: number;
  direction: 1 | -1;
}): number | null {
  const visibleEpisodes = filterEpisodeIdsByMode(episodes, flagged, mode)
    .slice()
    .sort((a, b) => a - b);

  if (direction === 1) {
    return visibleEpisodes.find((episode) => episode > currentEpisode) ?? null;
  }

  for (let index = visibleEpisodes.length - 1; index >= 0; index -= 1) {
    if (visibleEpisodes[index] < currentEpisode) {
      return visibleEpisodes[index];
    }
  }

  return null;
}

export function resolveStoredEpisodeFilterMode(
  value: string | null,
): EpisodeFilterMode {
  return value === "flagged" || value === "unflagged" ? value : "all";
}
