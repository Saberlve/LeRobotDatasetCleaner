import type { InitialIdleProfile, SignalSchema } from "./types";

const positive = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n > 0;
const nonnegative = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0;
const text = (s: unknown): s is string =>
  typeof s === "string" && s.trim() !== "";

/** Validates saved JSON as well as typed callers. No semantic defaults. */
export function profileIssues(value: unknown): string[] {
  if (!value || typeof value !== "object") return ["Missing detector profile"];
  const p = value as InitialIdleProfile;
  const issues: string[] = [];
  if (
    p.tailVisual &&
    ![p.tailVisual.mean, p.tailVisual.fraction, p.tailVisual.pixel].every(
      (n) => positive(n) && n <= 1,
    )
  )
    issues.push("Image thresholds must be in (0, 1]");
  if (p.version !== 1) issues.push("Unsupported profile version");
  if (!text(p.stateKey) || !text(p.actionKey) || p.stateKey === p.actionKey)
    issues.push("State and action must name distinct columns");
  if (p.gripper !== "present" && p.gripper !== "none")
    issues.push("Declare whether the robot has a gripper");
  for (const key of [
    "minIdleSeconds",
    "activityConfirmSeconds",
    "maxGapSeconds",
  ] as const)
    if (!positive(p[key])) issues.push(`${key} must be positive`);
  if (!nonnegative(p.contextSeconds))
    issues.push("contextSeconds must be nonnegative");
  if (!positive(p.activityRatio) || p.activityRatio <= 1)
    issues.push("activityRatio must exceed one");
  if (
    p.startEventKey !== undefined &&
    (!text(p.startEventKey) ||
      [
        p.stateKey,
        p.actionKey,
        "timestamp",
        "frame_index",
        "episode_index",
        "index",
      ].includes(p.startEventKey))
  )
    issues.push("Start event must name a separate boolean column");
  if (!Array.isArray(p.channels) || p.channels.length === 0)
    return [
      ...issues,
      "Explicit joint and gripper channel mappings are required",
    ];
  const stateIndices = new Set<number>();
  const actionIndices = new Set<number>();
  let grippers = 0;
  for (const c of p.channels) {
    if (!c || typeof c !== "object") {
      issues.push("Invalid channel");
      continue;
    }
    if (!text(c.name) || !text(c.stateUnit) || !text(c.actionUnit))
      issues.push("Each channel needs a name and explicit units");
    if (c.role !== "joint" && c.role !== "gripper")
      issues.push("Unknown channel role");
    if (c.role === "gripper") grippers++;
    for (const [index, seen] of [
      [c.stateIndex, stateIndices],
      [c.actionIndex, actionIndices],
    ] as const) {
      if (!Number.isSafeInteger(index) || index < 0 || seen.has(index))
        issues.push("Channel indices must be unique nonnegative integers");
      seen.add(index);
    }
    if (!["absolute", "delta", "velocity"].includes(c.actionMode))
      issues.push("Specify absolute, delta, or velocity action semantics");
    if (
      !positive(c.stateSpeed) ||
      !positive(c.stateExcursion) ||
      !positive(c.actionActivity)
    )
      issues.push(`${c.name}: positive calibrated thresholds are required`);
    if (c.actionMode === "absolute" && !positive(c.actionExcursion))
      issues.push(`${c.name}: absolute targets need an excursion threshold`);
    if (
      c.trackingError !== undefined &&
      (!positive(c.trackingError) ||
        c.actionMode !== "absolute" ||
        c.stateUnit !== c.actionUnit)
    )
      issues.push(
        `${c.name}: tracking error requires matching absolute units and coordinates`,
      );
    if (
      c.period !== undefined &&
      (!positive(c.period) ||
        (c.actionMode === "absolute" && c.stateUnit !== c.actionUnit))
    )
      issues.push(`${c.name}: invalid periodic-joint units or period`);
  }
  // Full contiguous coverage prevents silently ignoring a moving actuator.
  for (let i = 0; i < p.channels.length; i++)
    if (!stateIndices.has(i) || !actionIndices.has(i))
      issues.push("Every state/action dimension must be mapped exactly once");
  if ((p.gripper === "present") !== grippers > 0)
    issues.push("Gripper declaration and channel roles disagree");
  return [...new Set(issues)];
}

export function inspectIdleSignals(
  info: SignalSchema,
  profile?: InitialIdleProfile,
) {
  const features = Object.entries(info.features).map(([key, feature]) => ({
    key,
    ...feature,
  }));
  const issues = profile
    ? profileIssues(profile)
    : ["Configure signal semantics and thresholds before detection"];
  if (!positive(info.fps)) issues.push("Invalid dataset fps");
  if (profile && issues.length === 0) {
    for (const key of [profile.stateKey, profile.actionKey]) {
      const f = info.features[key];
      if (
        !f ||
        f.shape.length !== 1 ||
        f.shape[0] !== profile.channels.length ||
        !/^(float|int|uint)/.test(f.dtype)
      )
        issues.push(
          `${key}: expected a numeric vector fully covered by the profile`,
        );
    }
    if (profile.startEventKey) {
      const event = info.features[profile.startEventKey];
      if (
        !event ||
        !["bool", "boolean"].includes(event.dtype) ||
        event.shape.length > 1 ||
        (event.shape.length === 1 && event.shape[0] !== 1)
      )
        issues.push("Configured start event must be a declared scalar boolean");
    }
    for (const key of ["timestamp", "frame_index", "episode_index", "index"])
      if (!info.features[key])
        issues.push(`Missing identity/timing column: ${key}`);
  }
  return { features, issues, ready: issues.length === 0 };
}

function signature(info: SignalSchema): string {
  return JSON.stringify([
    info.codebase_version,
    info.fps,
    Object.entries(info.features)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, f]) => [key, f.dtype, f.shape, f.names]),
  ]);
}

type ProfileStorage = Pick<Storage, "getItem" | "setItem">;
const storageKey = (repoId: string) => `lerobot-initial-idle:${repoId}`;

export function saveIdleProfile(
  storage: ProfileStorage,
  repoId: string,
  info: SignalSchema,
  profile: InitialIdleProfile,
): void {
  const { issues } = inspectIdleSignals(info, profile);
  if (issues.length) throw new Error(issues.join("; "));
  storage.setItem(
    storageKey(repoId),
    JSON.stringify({ signature: signature(info), profile }),
  );
}

export function loadIdleProfile(
  storage: ProfileStorage,
  repoId: string,
  info: SignalSchema,
): InitialIdleProfile | null {
  try {
    const saved = JSON.parse(storage.getItem(storageKey(repoId)) ?? "null");
    if (
      !saved ||
      saved.signature !== signature(info) ||
      !saved.profile ||
      !inspectIdleSignals(info, saved.profile).ready
    )
      return null;
    return saved.profile;
  } catch {
    return null;
  }
}
