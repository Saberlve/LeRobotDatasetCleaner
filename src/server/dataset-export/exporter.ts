import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

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
import type { EpisodeClipMap } from "./clips";

const execFileAsync = promisify(execFile);
const EXPORT_V3_SUBSET_SCRIPT = path.join(
  process.cwd(),
  "src/server/dataset-export/export_v3_subset.py",
);

async function exportV3Subset(input: {
  datasetPath: string;
  outputPath: string;
  keptEpisodeIds: number[];
  removedFrameIntervals?: EpisodeClipMap;
}): Promise<void> {
  const job = {
    kept_episode_ids: input.keptEpisodeIds,
    removed_frame_intervals: input.removedFrameIntervals ?? {},
  };

  try {
    await execFileAsync("python3", [
      EXPORT_V3_SUBSET_SCRIPT,
      input.datasetPath,
      input.outputPath,
      JSON.stringify(job),
    ]);
  } catch (error) {
    const stderr =
      typeof (error as { stderr?: unknown }).stderr === "string"
        ? (error as { stderr: string }).stderr.trim()
        : "";
    const lastLine = stderr.split("\n").filter(Boolean).at(-1);
    throw new Error(lastLine || "v3.0 数据集导出失败。");
  }
}

export async function exportFilteredDataset(input: {
  repoId: string;
  datasetPath?: string;
  flaggedEpisodeIds: number[];
  mode: ExportMode;
  outputPath: string;
  alias?: string;
  removedFrameIntervals?: EpisodeClipMap;
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

  const info = JSON.parse(
    await fs.readFile(path.join(datasetPath, "meta", "info.json"), "utf8"),
  ) as Record<string, unknown>;
  const hasClips = Object.values(input.removedFrameIntervals ?? {}).some(
    (intervals) => intervals.length > 0,
  );
  if (hasClips && info.codebase_version !== "v3.0") {
    throw new Error("帧剪辑仅支持本地 LeRobot v3.0 数据集。");
  }
  const selection = buildEpisodeSelectionPlan({
    totalEpisodes: Number(info.total_episodes),
    flaggedEpisodeIds: input.flaggedEpisodeIds,
    mode: input.mode,
  });

  if (info.codebase_version === "v3.0") {
    // v3.0 packs multiple episodes into shared parquet/mp4 files; subset
    // export is handled by the python exporter which rewrites all three.
    await exportV3Subset({
      datasetPath,
      outputPath: input.outputPath,
      keptEpisodeIds: selection.keptEpisodeIds,
      removedFrameIntervals: input.removedFrameIntervals,
    });
  } else {
    const inspection = await inspectExportableDataset(datasetPath);
    await writeFilteredDataset({
      inspection,
      selection,
      outputPath: input.outputPath,
      removedFrameIntervals: input.removedFrameIntervals,
    });
  }

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
      sourceTotalEpisodes: Number(info.total_episodes),
      exportedEpisodes: selection.newTotalEpisodes,
      droppedEpisodes: selection.droppedEpisodeIds.length,
    },
  };
}
