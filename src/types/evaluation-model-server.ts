export const EVALUATION_MODEL_SERVER_BENCHMARKS = ["simpler", "rmbench"] as const;

export type EvaluationBenchmark =
  (typeof EVALUATION_MODEL_SERVER_BENCHMARKS)[number];

export const EVALUATION_MODEL_SERVER_STATUSES = [
  "idle",
  "starting",
  "running",
  "stopping",
  "failed",
  "stopped",
] as const;

export const EVALUATION_MODEL_SERVER_LOG_SOURCES = ["launcher", "server"] as const;

export type EvaluationModelServerState =
  (typeof EVALUATION_MODEL_SERVER_STATUSES)[number];
export type EvaluationModelServerLogSource =
  (typeof EVALUATION_MODEL_SERVER_LOG_SOURCES)[number];

export type EvaluationModelServerLogFiles = {
  launcher: string;
  server: string;
};

export type EvaluationModelServerStatus = {
  benchmark: EvaluationBenchmark;
  label: string;
  status: EvaluationModelServerState;
  pid: number | null;
  port: number;
  startedAt: string | null;
  updatedAt: string | null;
  checkpointPath: string;
  logPath: string;
  logFiles: EvaluationModelServerLogFiles;
  errorMessage: string | null;
};

export type EvaluationModelServerLogResponse = {
  benchmark: EvaluationBenchmark;
  source: EvaluationModelServerLogSource;
  path: string;
  content: string;
  truncated: boolean;
  updatedAt: string | null;
};
