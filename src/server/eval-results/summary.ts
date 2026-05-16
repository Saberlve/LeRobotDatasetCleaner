import { readdir, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  loadTrainingConfigs,
  type TrainingConfigSummary,
} from "@/server/eval-results/training-config";

export const DEFAULT_EVAL_RESULTS_ROOT = path.join(
  os.homedir(),
  "autodl-tmp",
  "SimplerBridge_evaluation_result",
);
export const EVAL_RESULTS_ROOT = path.resolve(
  process.env.EVAL_RESULTS_ROOT ?? DEFAULT_EVAL_RESULTS_ROOT,
);
export const WANDB_URL =
  "https://wandb.ai/saberlve9-massachusetts-institute-of-technology/openpi?nw=nwusersaberlve9";

export type SimplerTaskResult = {
  name: string;
  partial: number | null;
  entire: number | null;
};

export type SimplerStepResult = {
  step: string;
  averageEntire: number | null;
  tasks: SimplerTaskResult[];
  videos: Array<{
    name: string;
    label: string;
    taskName: string;
    outcome: "success" | "failure" | "unknown";
    relativePath: string;
  }>;
};

export type SimplerRunSummary = {
  configName: string;
  expName: string;
  steps: SimplerStepResult[];
};

export type RmBenchTimestampSummary = {
  timestamp: string;
  score: number | null;
  resultText: string;
  videos: Array<{
    name: string;
    relativePath: string;
  }>;
};

export type RmBenchRunSummary = {
  configName: string;
  taskName: string;
  expName: string;
  timestamps: RmBenchTimestampSummary[];
};

export type EvaluationResultRow = {
  id: string;
  benchmark: "SimplerEnv" | "RMBench";
  configName: string;
  expName: string;
  checkpoint: string | null;
  timestamp: string | null;
  taskName: string;
  metricName: string;
  partial: number | null;
  score: number | null;
  source: "CSV" | "TXT";
};

export type EvaluationDashboard = {
  wandbUrl: string;
  simpler: {
    runs: SimplerRunSummary[];
  };
  rmbench: {
    runs: RmBenchRunSummary[];
  };
  training: {
    configs: TrainingConfigSummary[];
  };
  results: {
    rows: EvaluationResultRow[];
    bestRow: EvaluationResultRow | null;
  };
  acone: {
    datasetRoute: string;
    datasetName: string;
    episodes: number;
    frames: number;
  };
};

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listDirectories(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  } catch {
    return [];
  }
}

async function listFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  } catch {
    return [];
  }
}

function parseCsv(content: string): string[][] {
  return content
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.split(",").map((cell) => cell.trim()));
}

function parseNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : null;
}

function taskNameFromColumn(column: string): string {
  return column
    .replace("/matching_partial", "")
    .replace("/matching_entire", "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function parseSimplerResultsCsv(
  step: string,
  content: string,
): SimplerStepResult {
  const [headers, row] = parseCsv(content);
  if (!headers || !row) {
    return { step, averageEntire: null, tasks: [], videos: [] };
  }

  const taskMap = new Map<string, SimplerTaskResult>();
  headers.forEach((header, index) => {
    if (!header.includes("/matching_")) return;
    const isPartial = header.endsWith("/matching_partial");
    const isEntire = header.endsWith("/matching_entire");
    if (!isPartial && !isEntire) return;

    const taskName = taskNameFromColumn(header);
    const current = taskMap.get(taskName) ?? {
      name: taskName,
      partial: null,
      entire: null,
    };
    if (isPartial) current.partial = parseNumber(row[index]);
    if (isEntire) current.entire = parseNumber(row[index]);
    taskMap.set(taskName, current);
  });

  const tasks = Array.from(taskMap.values()).filter(
    (task) => task.partial !== null || task.entire !== null,
  );
  const entireValues = tasks
    .map((task) => task.entire)
    .filter((value): value is number => value !== null);
  const averageEntire =
    entireValues.length > 0
      ? entireValues.reduce((sum, value) => sum + value, 0) /
        entireValues.length
      : null;

  return { step, averageEntire, tasks, videos: [] };
}

function parseSimplerSummaryCsv(content: string): SimplerStepResult[] {
  const [headers, ...rows] = parseCsv(content);
  if (!headers) return [];

  return rows.map((row) => {
    const step = row[0] ?? "unknown";
    const tasks: SimplerTaskResult[] = [];
    for (let index = 1; index < headers.length; index += 2) {
      const partialHeader = headers[index];
      const entireHeader = headers[index + 1];
      if (!partialHeader || !entireHeader) continue;
      if (partialHeader === "Avg-entire") continue;

      tasks.push({
        name: partialHeader.replace(" partial", ""),
        partial: parseNumber(row[index]),
        entire: parseNumber(row[index + 1]),
      });
    }

    const averageIndex = headers.findIndex((header) => header === "Avg-entire");
    return {
      step,
      averageEntire: parseNumber(row[averageIndex]),
      tasks,
      videos: [],
    };
  });
}

function simplerVideoTaskName(relativePath: string): string {
  const parts = relativePath.split("/");
  const task = parts.find((part) => part.endsWith("Scene-v0"));
  if (!task) return "Unknown task";
  return task
    .replace("InScene-v0", "")
    .replace("Scene-v0", "")
    .replace(/([a-z])([A-Z])/g, "$1 $2");
}

function simplerVideoOutcome(
  fileName: string,
): "success" | "failure" | "unknown" {
  if (fileName.startsWith("success")) return "success";
  if (fileName.startsWith("failure")) return "failure";
  return "unknown";
}

function simplerVideoEpisode(fileName: string): string {
  return fileName.match(/episode_(\d+)/)?.[1] ?? "?";
}

function simplerVideoLabel(fileName: string, relativePath: string): string {
  const outcome = simplerVideoOutcome(fileName);
  const outcomeLabel =
    outcome === "success" ? "成功" : outcome === "failure" ? "失败" : "未知";
  return `${outcomeLabel} / ${simplerVideoTaskName(relativePath)} / ep ${simplerVideoEpisode(fileName)}`;
}

async function listVideoFilesRecursive(
  dirPath: string,
  root: string,
  limit = 160,
): Promise<SimplerStepResult["videos"]> {
  const videos: SimplerStepResult["videos"] = [];
  const stack = [dirPath];

  while (stack.length > 0 && videos.length < limit) {
    const currentDir = stack.pop();
    if (!currentDir) continue;

    let entries;
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    entries.sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { numeric: true }),
    );

    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }
      if (!entry.isFile() || !/\.(mp4|webm|mov|mkv)$/i.test(entry.name)) {
        continue;
      }

      const relativePath = path
        .relative(root, entryPath)
        .split(path.sep)
        .join("/");
      videos.push({
        name: entry.name,
        label: simplerVideoLabel(entry.name, relativePath),
        taskName: simplerVideoTaskName(relativePath),
        outcome: simplerVideoOutcome(entry.name),
        relativePath,
      });
      if (videos.length >= limit) break;
    }
  }

  return videos.sort((left, right) => {
    const outcomeOrder =
      (right.outcome === "success" ? 1 : 0) -
      (left.outcome === "success" ? 1 : 0);
    return (
      outcomeOrder ||
      left.taskName.localeCompare(right.taskName) ||
      left.name.localeCompare(right.name, undefined, { numeric: true })
    );
  });
}

async function attachSimplerStepVideos(
  runPath: string,
  root: string,
  steps: SimplerStepResult[],
): Promise<SimplerStepResult[]> {
  return Promise.all(
    steps.map(async (step) => {
      const stepPath = path.join(runPath, step.step);
      return {
        ...step,
        videos: (await exists(stepPath))
          ? await listVideoFilesRecursive(stepPath, root)
          : [],
      };
    }),
  );
}

async function loadSimplerRun(
  runPath: string,
  configName: string,
  expName: string,
  root: string,
): Promise<SimplerRunSummary | null> {
  const summaryPath = path.join(runPath, "summary_results.csv");
  if (await exists(summaryPath)) {
    const content = await readFile(summaryPath, "utf8");
    return {
      configName,
      expName,
      steps: await attachSimplerStepVideos(
        runPath,
        root,
        parseSimplerSummaryCsv(content),
      ),
    };
  }

  const stepDirs = (await listDirectories(runPath)).filter((name) =>
    /^\d+$/.test(name),
  );
  const steps: SimplerStepResult[] = [];
  for (const step of stepDirs) {
    const csvPath = path.join(runPath, step, "results.csv");
    if (!(await exists(csvPath))) continue;
    const content = await readFile(csvPath, "utf8");
    const parsedStep = parseSimplerResultsCsv(step, content);
    steps.push({
      ...parsedStep,
      videos: await listVideoFilesRecursive(path.join(runPath, step), root),
    });
  }

  return steps.length > 0 ? { configName, expName, steps } : null;
}

async function loadSimplerRuns(root: string): Promise<SimplerRunSummary[]> {
  const simplerRoot = path.join(root, "SimplerEnv");
  const configs = await listDirectories(simplerRoot);
  const runs: SimplerRunSummary[] = [];

  for (const configName of configs) {
    const configPath = path.join(simplerRoot, configName);
    const directRun = await loadSimplerRun(configPath, configName, "", root);
    if (directRun) runs.push(directRun);

    const expDirs = await listDirectories(configPath);
    for (const expName of expDirs) {
      const expPath = path.join(configPath, expName);
      const nestedRun = await loadSimplerRun(
        expPath,
        configName,
        expName,
        root,
      );
      if (nestedRun) runs.push(nestedRun);
    }
  }

  return runs;
}

function parseRmBenchScore(resultText: string): number | null {
  const lastLine = resultText.trim().split(/\r?\n/).at(-1);
  return parseNumber(lastLine);
}

async function loadRmBenchRuns(root: string): Promise<RmBenchRunSummary[]> {
  const rmbenchRoot = path.join(root, "RMBench");
  const configNames = await listDirectories(rmbenchRoot);
  const runs: RmBenchRunSummary[] = [];

  for (const configName of configNames) {
    const configPath = path.join(rmbenchRoot, configName);
    for (const taskName of await listDirectories(configPath)) {
      const taskPath = path.join(configPath, taskName);
      for (const expName of await listDirectories(taskPath)) {
        const expPath = path.join(taskPath, expName);
        const timestamps: RmBenchTimestampSummary[] = [];
        for (const timestamp of await listDirectories(expPath)) {
          const timestampPath = path.join(expPath, timestamp);
          const resultPath = path.join(timestampPath, "_result.txt");
          const resultText = (await exists(resultPath))
            ? await readFile(resultPath, "utf8")
            : "";
          const videos = (await listFiles(timestampPath))
            .filter((file) => file.endsWith(".mp4"))
            .map((file) => ({
              name: file,
              relativePath: path
                .relative(root, path.join(timestampPath, file))
                .split(path.sep)
                .join("/"),
            }));

          timestamps.push({
            timestamp,
            resultText,
            score: parseRmBenchScore(resultText),
            videos,
          });
        }

        if (timestamps.length > 0) {
          runs.push({ configName, taskName, expName, timestamps });
        }
      }
    }
  }

  return runs;
}

function compareResultRows(
  left: EvaluationResultRow,
  right: EvaluationResultRow,
) {
  const rightScore = right.score ?? Number.NEGATIVE_INFINITY;
  const leftScore = left.score ?? Number.NEGATIVE_INFINITY;
  return (
    rightScore - leftScore ||
    left.benchmark.localeCompare(right.benchmark) ||
    left.configName.localeCompare(right.configName) ||
    (left.expName || "").localeCompare(right.expName || "") ||
    (left.checkpoint || left.timestamp || "").localeCompare(
      right.checkpoint || right.timestamp || "",
      undefined,
      { numeric: true },
    )
  );
}

function buildEvaluationResults(
  simplerRuns: SimplerRunSummary[],
  rmbenchRuns: RmBenchRunSummary[],
): EvaluationDashboard["results"] {
  const simplerRows = simplerRuns.flatMap((run) =>
    run.steps.map<EvaluationResultRow>((step) => ({
      id: [
        "SimplerEnv",
        run.configName,
        run.expName,
        step.step,
        "avg-entire",
      ].join("|"),
      benchmark: "SimplerEnv",
      configName: run.configName,
      expName: run.expName,
      checkpoint: step.step,
      timestamp: null,
      taskName: "Avg Entire",
      metricName: "Avg-entire",
      partial: null,
      score: step.averageEntire,
      source: "CSV",
    })),
  );

  const rmbenchRows = rmbenchRuns.flatMap((run) =>
    run.timestamps.map<EvaluationResultRow>((timestamp) => ({
      id: [
        "RMBench",
        run.configName,
        run.taskName,
        run.expName,
        timestamp.timestamp,
        "score",
      ].join("|"),
      benchmark: "RMBench",
      configName: run.configName,
      expName: run.expName,
      checkpoint: null,
      timestamp: timestamp.timestamp,
      taskName: run.taskName,
      metricName: "score",
      partial: null,
      score: timestamp.score,
      source: "TXT",
    })),
  );

  const rows = [...simplerRows, ...rmbenchRows].sort(compareResultRows);
  const bestRow = rows.find((row) => row.score !== null) ?? null;

  return { rows, bestRow };
}

export async function loadEvaluationDashboard(
  root: string = EVAL_RESULTS_ROOT,
): Promise<EvaluationDashboard> {
  const [simplerRuns, rmbenchRuns, trainingConfigs] = await Promise.all([
    loadSimplerRuns(root),
    loadRmBenchRuns(root),
    loadTrainingConfigs(),
  ]);

  return {
    wandbUrl: process.env.NEXT_PUBLIC_WANDB_URL || WANDB_URL,
    simpler: { runs: simplerRuns },
    rmbench: { runs: rmbenchRuns },
    training: { configs: trainingConfigs },
    results: buildEvaluationResults(simplerRuns, rmbenchRuns),
    acone: {
      datasetRoute: "/local/pick_X_times_filterd_twice/episode_0",
      datasetName: "pick_X_times_filterd_twice",
      episodes: 37,
      frames: 34205,
    },
  };
}
