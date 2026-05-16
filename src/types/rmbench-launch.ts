export const RMBENCH_TASK_IDS = ["swap_blocks"] as const;

export const RMBENCH_TASK_CONFIGS = ["demo_clean"] as const;

export const RMBENCH_RUN_STATUSES = [
  "idle",
  "starting",
  "running",
  "stopping",
  "succeeded",
  "failed",
  "stopped",
] as const;

export const RMBENCH_LOG_SOURCES = ["server", "client"] as const;

export const RMBENCH_CAMERA_KEYS = [
  "third_view",
  "head_camera",
  "left_camera",
  "right_camera",
] as const;

export type RmbenchTaskId = (typeof RMBENCH_TASK_IDS)[number];
export type RmbenchTaskConfig = (typeof RMBENCH_TASK_CONFIGS)[number];
export type RmbenchLaunchRunStatus = (typeof RMBENCH_RUN_STATUSES)[number];
export type RmbenchLaunchLogSource = (typeof RMBENCH_LOG_SOURCES)[number];
export type RmbenchCameraKey = (typeof RMBENCH_CAMERA_KEYS)[number];

export type RmbenchLaunchLogFiles = {
  launcher: string;
  server: string;
  client: string;
};

export type RmbenchFramePaths = Record<RmbenchCameraKey, string | null>;
export type RmbenchFrameUrls = Record<RmbenchCameraKey, string | null>;
export type RmbenchFrameVersions = Record<RmbenchCameraKey, number>;

export type RmbenchLaunchActionPoint = {
  step: number;
  timestamp: number;
  [dimension: string]: number;
};

export type RmbenchLaunchRuntimeStatus = {
  runId: string;
  taskId: RmbenchTaskId;
  taskConfig: RmbenchTaskConfig;
  prompt: string;
  status: RmbenchLaunchRunStatus;
  step: number;
  startedAt: string;
  updatedAt: string;
  pid: number | null;
  latestFramePaths: RmbenchFramePaths;
  actionCount: number;
  logPath: string;
  logFiles?: RmbenchLaunchLogFiles;
  errorMessage: string | null;
};

export type RmbenchLaunchMeta = {
  taskId: RmbenchTaskId;
  taskConfig: RmbenchTaskConfig;
  checkpointPath: string;
  policyName: string;
  policyConfigName: string;
  serverPort: number;
  pi0Step: number;
};

export type RmbenchLaunchStatusResponse = {
  runId: string | null;
  taskId: RmbenchTaskId | null;
  taskConfig: RmbenchTaskConfig | null;
  prompt: string;
  status: RmbenchLaunchRunStatus;
  processActive: boolean;
  step: number;
  actionCount: number;
  startedAt: string | null;
  updatedAt: string | null;
  frameUrls: RmbenchFrameUrls;
  frameVersions: RmbenchFrameVersions;
  actionSeries: RmbenchLaunchActionPoint[];
  errorMessage: string | null;
  logPath: string | null;
  logFiles: RmbenchLaunchLogFiles | null;
};

export type RmbenchLaunchActionResponse = {
  runId: string;
  actionCount: number;
  actionSeries: RmbenchLaunchActionPoint[];
};

export type RmbenchLaunchLogResponse = {
  runId: string;
  source: RmbenchLaunchLogSource;
  path: string;
  content: string;
  truncated: boolean;
  updatedAt: string | null;
};
