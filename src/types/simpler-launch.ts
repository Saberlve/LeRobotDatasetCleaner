export const SIMPLER_TASK_IDS = [
  "bridge_carrot",
  "bridge_stack",
  "bridge_spoon",
  "eggplant",
] as const;

export type SimplerTaskId = (typeof SIMPLER_TASK_IDS)[number];

export const SIMPLER_RUN_STATUSES = [
  "idle",
  "starting",
  "running",
  "stopping",
  "succeeded",
  "failed",
  "stopped",
] as const;

export type SimplerLaunchRunStatus = (typeof SIMPLER_RUN_STATUSES)[number];

export const SIMPLER_LOG_SOURCES = ["server", "client"] as const;

export type SimplerLaunchLogSource = (typeof SIMPLER_LOG_SOURCES)[number];

export type SimplerLaunchLogFiles = {
  launcher: string;
  server: string;
  client: string;
};

export type SimplerLaunchActionPoint = {
  step: number;
  timestamp: number;
  [dimension: string]: number;
};

export type SimplerLaunchRuntimeStatus = {
  runId: string;
  taskId: SimplerTaskId;
  prompt: string;
  status: SimplerLaunchRunStatus;
  step: number;
  startedAt: string;
  updatedAt: string;
  pid: number | null;
  latestFramePath: string | null;
  actionCount: number;
  logPath: string;
  logFiles?: SimplerLaunchLogFiles;
  errorMessage: string | null;
};

export type SimplerLaunchMeta = {
  taskId: SimplerTaskId;
  envName: string;
  sceneName: string;
  robot: string;
  rgbOverlayPath: string;
  checkpointPath: string;
  serverPort: number;
  renderScale: number;
};

export type SimplerLaunchStatusResponse = {
  runId: string | null;
  taskId: SimplerTaskId | null;
  prompt: string;
  status: SimplerLaunchRunStatus;
  step: number;
  startedAt: string | null;
  updatedAt: string | null;
  latestFrameUrl: string | null;
  frameVersion: number;
  actionSeries: SimplerLaunchActionPoint[];
  errorMessage: string | null;
  logPath: string | null;
  logFiles: SimplerLaunchLogFiles | null;
};

export type SimplerLaunchLogResponse = {
  runId: string;
  source: SimplerLaunchLogSource;
  path: string;
  content: string;
  truncated: boolean;
  updatedAt: string | null;
};
