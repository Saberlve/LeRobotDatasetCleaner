const FLOATING_BASE_QPOS = [0, 0, 0, 1, 0, 0, 0] as const;

export const G1_JOINT_NAMES = [
  "left_hip_pitch_joint",
  "left_hip_roll_joint",
  "left_hip_yaw_joint",
  "left_knee_joint",
  "left_ankle_pitch_joint",
  "left_ankle_roll_joint",
  "right_hip_pitch_joint",
  "right_hip_roll_joint",
  "right_hip_yaw_joint",
  "right_knee_joint",
  "right_ankle_pitch_joint",
  "right_ankle_roll_joint",
  "waist_yaw_joint",
  "waist_roll_joint",
  "waist_pitch_joint",
  "left_shoulder_pitch_joint",
  "left_shoulder_roll_joint",
  "left_shoulder_yaw_joint",
  "left_elbow_joint",
  "left_wrist_roll_joint",
  "left_wrist_pitch_joint",
  "left_wrist_yaw_joint",
  "right_shoulder_pitch_joint",
  "right_shoulder_roll_joint",
  "right_shoulder_yaw_joint",
  "right_elbow_joint",
  "right_wrist_roll_joint",
  "right_wrist_pitch_joint",
  "right_wrist_yaw_joint",
] as const;

export const G1_REQUIRED_ASSET_PATHS = [
  "/mujoco/g1/g1.xml",
  "/mujoco/g1/assets/pelvis.STL",
  "/mujoco/g1/assets/torso_link_rev_1_0.STL",
  "/mujoco/g1/assets/head_link.STL",
];

export function extractOrderedG1StateColumns(row: Record<string, unknown>) {
  return G1_JOINT_NAMES.map((_, index) => {
    const key = `observation.state | ${index}`;
    if (!(key in row)) {
      throw new Error(`Missing G1 state column ${key}`);
    }
    return key;
  });
}

export function buildG1QposFrame(
  row: Record<string, unknown>,
  orderedColumns: string[],
) {
  const qpos = new Float64Array(
    FLOATING_BASE_QPOS.length + orderedColumns.length,
  );

  FLOATING_BASE_QPOS.forEach((value, index) => {
    qpos[index] = value;
  });

  orderedColumns.forEach((column, index) => {
    const value = row[column];
    qpos[FLOATING_BASE_QPOS.length + index] =
      typeof value === "number" ? value : 0;
  });

  return qpos;
}
