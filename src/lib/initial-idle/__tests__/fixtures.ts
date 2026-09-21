import type { InitialIdleProfile, SignalFrame, SignalSchema } from "../types";

// Deliberately synthetic units/thresholds; not robot calibration defaults.
export function profile(): InitialIdleProfile {
  return {
    version: 1,
    stateKey: "observation.state",
    actionKey: "action",
    gripper: "present",
    channels: ["joint", "gripper"].map((role, index) => ({
      name: role,
      role: role as "joint" | "gripper",
      stateIndex: index,
      actionIndex: index,
      stateUnit: "test-unit",
      actionUnit: "test-unit",
      actionMode: "absolute",
      stateSpeed: 0.05,
      stateExcursion: 0.02,
      actionActivity: 0.05,
      actionExcursion: 0.02,
    })),
    minIdleSeconds: 1,
    activityConfirmSeconds: 0.2,
    contextSeconds: 0.5,
    maxGapSeconds: 0.2,
    activityRatio: 2,
  };
}

export function frames(): SignalFrame[] {
  return Array.from({ length: 60 }, (_, i) => {
    const position = Math.max(0, i - 29) * 0.1;
    return {
      frameIndex: i,
      timestamp: i / 10,
      state: [position, 0],
      action: [position, 0],
    };
  });
}

export function schema(): SignalSchema {
  return {
    codebase_version: "v3.0",
    fps: 10,
    features: {
      "observation.state": {
        dtype: "float32",
        shape: [2],
        names: ["joint", "gripper"],
      },
      action: { dtype: "float32", shape: [2], names: ["joint", "gripper"] },
      ...Object.fromEntries(
        ["timestamp", "frame_index", "episode_index", "index"].map((key) => [
          key,
          {
            dtype: key === "timestamp" ? "float32" : "int64",
            shape: [1],
            names: null,
          },
        ]),
      ),
    },
  };
}
