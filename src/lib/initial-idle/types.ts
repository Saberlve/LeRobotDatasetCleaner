import type { DatasetInfo } from "@/utils/versionUtils";

export type SignalSchema = Pick<
  DatasetInfo,
  "codebase_version" | "fps" | "features"
>;

export interface IdleChannel {
  name: string;
  role: "joint" | "gripper";
  stateIndex: number;
  actionIndex: number;
  stateUnit: string;
  actionUnit: string;
  actionMode: "absolute" | "delta" | "velocity";
  /** Measured units per second. All thresholds must be calibrated per dataset. */
  stateSpeed: number;
  /** Max idle excursion; leading v2 uses prefix range and window net displacement. */
  stateExcursion: number;
  /** Absolute targets: units/s; delta or velocity: native command magnitude. */
  actionActivity: number;
  /** Required for absolute targets; same excursion guard as measured state. */
  actionExcursion?: number;
  /** Optional absolute target error, only for matching units and coordinates. */
  trackingError?: number;
  /** Set only for genuinely periodic joints, in both state and action units. */
  period?: number;
}

export interface InitialIdleProfile {
  version: 1;
  stateKey: string;
  actionKey: string;
  gripper: "present" | "none";
  channels: IdleChannel[];
  minIdleSeconds: number;
  activityConfirmSeconds: number;
  contextSeconds: number;
  maxGapSeconds: number;
  /** High threshold divided by low threshold (> 1). */
  activityRatio: number;
  /** Optional trusted boolean indicating that control has started. */
  startEventKey?: string;
  /** Tail-only image thresholds in normalized RGB [0, 1]. */
  tailVisual?: { mean: number; fraction: number; pixel: number };
}

export interface SignalFrame {
  frameIndex: number;
  timestamp: number;
  state: number[];
  action: number[];
  startEvent?: boolean;
}

export interface InitialIdleResult {
  detectorVersion: "initial-idle/1" | "initial-idle/2" | "trailing-idle/1";
  status: "candidate" | "no_candidate" | "needs_review";
  reason: string;
  warnings: string[];
  diagnostics?: {
    ignoredSmallChanges: number;
    triggers: ActivityTrigger[];
  };
  candidate: null | {
    /** Inclusive, ORIGINAL frame indices; never pass directly to export. */
    removedFrames: { start: number; end: number };
    removedTime: { start: number; endExclusive: number; duration: number };
    activityFrame: number;
    activityTimestamp: number;
    activitySource: "start_event" | "gripper" | "motion" | "visual";
    retainedContextSeconds: number;
    evidence: string[];
    reviewStatus: "pending";
  };
}

export interface ActivityTrigger {
  channel: string;
  signal: "state" | "action" | "event";
  frame: number;
  timestamp: number;
  onsetFrame: number;
  windowSeconds: number;
  speed: number;
  speedThreshold: number;
  displacement: number;
  displacementThreshold: number;
  unit: string;
  reason:
    | "confirmed_motion"
    | "gripper"
    | "slow_drift"
    | "significant_pulse"
    | "active_command"
    | "tracking_error"
    | "start_event";
}
