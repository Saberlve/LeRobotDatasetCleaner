import { iterateEpisodeMetadataFilesV3 } from "@/app/[org]/[dataset]/[episode]/fetch-data";
import {
  fetchParquetFile,
  formatStringWithVars,
  readParquetAsObjects,
} from "@/utils/parquetUtils";
import { buildV3DataPath } from "@/utils/stringFormatting";
import {
  buildVersionedUrl,
  getDatasetVersionAndInfo,
} from "@/utils/versionUtils";
import { detectInitialIdle, idleResult } from "./detect";
import { inspectIdleSignals } from "./profile";
import type {
  InitialIdleProfile,
  InitialIdleResult,
  SignalFrame,
} from "./types";

type Row = Record<string, unknown>;
const scalar = (v: unknown): unknown =>
  Array.isArray(v) && v.length === 1 ? v[0] : v;

function integer(value: unknown): number {
  const v = scalar(value);
  const n = typeof v === "bigint" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0)
    throw new Error(
      "Missing or invalid nonnegative integer in episode metadata/data",
    );
  return n;
}

function vector(value: unknown): number[] {
  // parquet readers may expose list columns as arrays or numeric typed arrays.
  const values: unknown[] = Array.isArray(value)
    ? value
    : ArrayBuffer.isView(value) && !(value instanceof DataView)
      ? Array.from(value as unknown as ArrayLike<unknown>)
      : [];
  if (
    !values.length ||
    !values.every((v) => typeof v === "number" && Number.isFinite(v))
  )
    throw new Error("Missing or invalid state/action vector");
  return values as number[];
}

function validateRows(
  rows: Row[],
  episodeId: number,
  expected?: { from: number; length: number },
): void {
  if (!rows.length || (expected && rows.length !== expected.length))
    throw new Error("Incomplete episode row count");
  const from = expected?.from ?? integer(rows[0].index);
  rows.forEach((row, i) => {
    if (
      integer(row.episode_index) !== episodeId ||
      integer(row.frame_index) !== i ||
      integer(row.index) !== from + i
    )
      throw new Error(
        "Episode rows contain gaps, disorder, or another episode",
      );
  });
}

/** Read original signal rows; drawing subsampling and chart aggregation are forbidden here. */
export async function loadEpisodeSignalFrames(
  repoId: string,
  episodeId: number,
  profile: InitialIdleProfile,
): Promise<SignalFrame[]> {
  if (!Number.isSafeInteger(episodeId) || episodeId < 0)
    throw new Error("Invalid episode id");
  const { version, info } = await getDatasetVersionAndInfo(repoId);
  const inspection = inspectIdleSignals(info, profile);
  if (!inspection.ready) throw new Error(inspection.issues.join("; "));
  const columns = [
    ...new Set([
      "index",
      "episode_index",
      "frame_index",
      "timestamp",
      profile.stateKey,
      profile.actionKey,
      ...(profile.startEventKey ? [profile.startEventKey] : []),
    ]),
  ];
  let rows: Row[];
  if (version === "v3.0") {
    let metadata: Row | undefined;
    for await (const batch of iterateEpisodeMetadataFilesV3(repoId, version)) {
      metadata = batch.find(
        (row) => integer(row.episode_index ?? row["0"]) === episodeId,
      );
      if (metadata) break;
    }
    if (!metadata) throw new Error(`Episode ${episodeId} metadata not found`);
    const field = (named: string, legacy: string) =>
      integer(
        "episode_index" in metadata! ? metadata![named] : metadata![legacy],
      );
    const chunk = field("data/chunk_index", "1");
    const fileIndex = field("data/file_index", "2");
    const from = field("dataset_from_index", "3");
    const to = field("dataset_to_index", "4");
    const length = field("length", "9");
    if (length < 1 || to - from !== length)
      throw new Error("Invalid episode bounds/length in metadata");
    const file = await fetchParquetFile(
      buildVersionedUrl(repoId, version, buildV3DataPath(chunk, fileIndex)),
    );
    try {
      const preview = await readParquetAsObjects(file, ["index"], {
        rowStart: 0,
        rowEnd: 1,
      });
      const offset = integer(preview[0]?.index);
      if (from < offset)
        throw new Error("Episode starts before this data file");
      rows = await readParquetAsObjects(file, columns, {
        rowStart: from - offset,
        rowEnd: to - offset,
      });
      validateRows(rows, episodeId, { from, length });
    } catch {
      // A range failure must never leak neighboring episodes from the shared file.
      const allRows = await readParquetAsObjects(file, columns);
      rows = allRows.filter((row) => integer(row.episode_index) === episodeId);
      validateRows(rows, episodeId, { from, length });
    }
  } else {
    if (
      !Number.isSafeInteger(info.chunks_size) ||
      info.chunks_size <= 0 ||
      !info.data_path
    )
      throw new Error("Invalid v2 data path/chunk size");
    const path = formatStringWithVars(info.data_path, {
      episode_chunk: Math.floor(episodeId / info.chunks_size)
        .toString()
        .padStart(3, "0"),
      episode_index: episodeId.toString().padStart(6, "0"),
    });
    if (path.includes("undefined") || path.includes("{"))
      throw new Error("Unsupported v2 data path template");
    const file = await fetchParquetFile(
      buildVersionedUrl(repoId, version, path),
    );
    rows = await readParquetAsObjects(file, columns);
    validateRows(rows, episodeId);
  }
  return rows.map((row) => {
    const timestamp = scalar(row.timestamp);
    if (typeof timestamp !== "number" || !Number.isFinite(timestamp))
      throw new Error("Invalid timestamp");
    const startEvent = profile.startEventKey
      ? scalar(row[profile.startEventKey])
      : undefined;
    if (profile.startEventKey && typeof startEvent !== "boolean")
      throw new Error("Missing or invalid start event");
    return {
      frameIndex: integer(row.frame_index),
      timestamp,
      state: vector(row[profile.stateKey]),
      action: vector(row[profile.actionKey]),
      ...(typeof startEvent === "boolean" ? { startEvent } : {}),
    };
  });
}

/** Review-only entry point. Does not write clips, flags, exports, or source data. */
export async function analyzeEpisodeInitialIdle(
  repoId: string,
  episodeId: number,
  profile: InitialIdleProfile,
): Promise<InitialIdleResult> {
  try {
    return detectInitialIdle(
      await loadEpisodeSignalFrames(repoId, episodeId, profile),
      profile,
    );
  } catch (error) {
    return idleResult("needs_review", "unable_to_read_complete_signals", [
      error instanceof Error ? error.message : "Unknown signal loading error",
    ]);
  }
}
