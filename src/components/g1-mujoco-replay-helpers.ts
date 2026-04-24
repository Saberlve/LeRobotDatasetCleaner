const FLOATING_BASE_QPOS = [0, 0, 0, 1, 0, 0, 0] as const;
const PSI0_STATE_DIM = 32;
const PSI0_HAND_DIM = 14;
const PSI0_ARM_DIM = 14;
const PSI0_TORSO_RPY_START = 28;

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
  "/mujoco/g1/assets/pelvis_contour_link.STL",
  "/mujoco/g1/assets/left_hip_pitch_link.STL",
  "/mujoco/g1/assets/left_hip_roll_link.STL",
  "/mujoco/g1/assets/left_hip_yaw_link.STL",
  "/mujoco/g1/assets/left_knee_link.STL",
  "/mujoco/g1/assets/left_ankle_pitch_link.STL",
  "/mujoco/g1/assets/left_ankle_roll_link.STL",
  "/mujoco/g1/assets/right_hip_pitch_link.STL",
  "/mujoco/g1/assets/right_hip_roll_link.STL",
  "/mujoco/g1/assets/right_hip_yaw_link.STL",
  "/mujoco/g1/assets/right_knee_link.STL",
  "/mujoco/g1/assets/right_ankle_pitch_link.STL",
  "/mujoco/g1/assets/right_ankle_roll_link.STL",
  "/mujoco/g1/assets/waist_yaw_link_rev_1_0.STL",
  "/mujoco/g1/assets/waist_roll_link_rev_1_0.STL",
  "/mujoco/g1/assets/torso_link_rev_1_0.STL",
  "/mujoco/g1/assets/logo_link.STL",
  "/mujoco/g1/assets/head_link.STL",
  "/mujoco/g1/assets/left_shoulder_pitch_link.STL",
  "/mujoco/g1/assets/left_shoulder_roll_link.STL",
  "/mujoco/g1/assets/left_shoulder_yaw_link.STL",
  "/mujoco/g1/assets/left_elbow_link.STL",
  "/mujoco/g1/assets/left_wrist_roll_link.STL",
  "/mujoco/g1/assets/left_wrist_pitch_link.STL",
  "/mujoco/g1/assets/left_wrist_yaw_link.STL",
  "/mujoco/g1/assets/left_rubber_hand.STL",
  "/mujoco/g1/assets/right_shoulder_pitch_link.STL",
  "/mujoco/g1/assets/right_shoulder_roll_link.STL",
  "/mujoco/g1/assets/right_shoulder_yaw_link.STL",
  "/mujoco/g1/assets/right_elbow_link.STL",
  "/mujoco/g1/assets/right_wrist_roll_link.STL",
  "/mujoco/g1/assets/right_wrist_pitch_link.STL",
  "/mujoco/g1/assets/right_wrist_yaw_link.STL",
  "/mujoco/g1/assets/right_rubber_hand.STL",
];

export function extractOrderedG1StateColumns(row: Record<string, unknown>) {
  const statesColumns = Array.from(
    { length: PSI0_STATE_DIM },
    (_, index) => `states | ${index}`,
  );
  if (statesColumns.every((key) => key in row)) {
    return statesColumns;
  }

  const observationStateColumns = G1_JOINT_NAMES.map((_, index) => {
    const key = `observation.state | ${index}`;
    if (!(key in row)) {
      throw new Error(`Missing G1 state column ${key}`);
    }
    return key;
  });
  return observationStateColumns;
}

export function buildG1QposFrame(
  row: Record<string, unknown>,
  orderedColumns: string[],
) {
  const qpos = new Float64Array(
    FLOATING_BASE_QPOS.length + G1_JOINT_NAMES.length,
  );

  FLOATING_BASE_QPOS.forEach((value, index) => {
    qpos[index] = value;
  });

  if (
    orderedColumns.length === PSI0_STATE_DIM &&
    orderedColumns.every((column) => column.startsWith("states | "))
  ) {
    const read = (stateIndex: number) => {
      const value = row[orderedColumns[stateIndex]];
      return typeof value === "number" ? value : Number(value) || 0;
    };

    // Psi0 state layout: hand(14), arm(14), torso_rpy(3), torso_height(1).
    qpos[FLOATING_BASE_QPOS.length + 12] = read(PSI0_TORSO_RPY_START + 2);
    qpos[FLOATING_BASE_QPOS.length + 13] = read(PSI0_TORSO_RPY_START);
    qpos[FLOATING_BASE_QPOS.length + 14] = read(PSI0_TORSO_RPY_START + 1);

    for (let index = 0; index < PSI0_ARM_DIM; index++) {
      qpos[FLOATING_BASE_QPOS.length + 15 + index] = read(
        PSI0_HAND_DIM + index,
      );
    }

    return qpos;
  }

  orderedColumns.slice(0, G1_JOINT_NAMES.length).forEach((column, index) => {
    const value = row[column];
    qpos[FLOATING_BASE_QPOS.length + index] =
      typeof value === "number" ? value : Number(value) || 0;
  });

  return qpos;
}
