const FLOATING_BASE_QPOS = [0, 0, 0, 1, 0, 0, 0] as const;
const PSI0_STATE_DIM = 32;
const PSI0_HAND_DIM = 14;
const PSI0_ARM_DIM = 14;
const PSI0_TORSO_RPY_START = 28;
const PSI0_TORSO_HEIGHT_INDEX = 31;
const PSI0_ACTION_TORSO_HEIGHT_INDEX = 31;
const PSI0_ACTION_VX_INDEX = 32;
const PSI0_ACTION_VY_INDEX = 33;
const PSI0_ACTION_VYAW_INDEX = 34;
const PSI0_ACTION_TARGET_YAW_INDEX = 35;

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

export const G1_REQUIRED_ASSET_PATHS = ["/mujoco/g1/g1.xml"];

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

export function buildG1QposFrames(
  rows: Record<string, unknown>[],
  orderedColumns: string[],
  fps: number,
) {
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : 30;
  const dt = 1 / safeFps;
  let x = 0;
  let y = 0;
  let yaw = 0;

  return rows.map((row, index) => {
    const hasBaseCommand = hasPsi0BaseCommand(row);
    if (hasBaseCommand) {
      const targetYaw = readNumber(
        row,
        actionKey(PSI0_ACTION_TARGET_YAW_INDEX),
      );
      if (targetYaw !== null) {
        yaw = targetYaw;
      } else if (index > 0) {
        yaw += (readNumber(row, actionKey(PSI0_ACTION_VYAW_INDEX)) ?? 0) * dt;
      }

      if (index > 0) {
        const vx = readNumber(row, actionKey(PSI0_ACTION_VX_INDEX)) ?? 0;
        const vy = readNumber(row, actionKey(PSI0_ACTION_VY_INDEX)) ?? 0;
        const cosYaw = Math.cos(yaw);
        const sinYaw = Math.sin(yaw);
        x += (vx * cosYaw - vy * sinYaw) * dt;
        y += (vx * sinYaw + vy * cosYaw) * dt;
      }
    }

    const qpos = buildG1QposFrame(row, orderedColumns);
    if (!hasBaseCommand) return qpos;

    const height =
      readNumber(row, stateKey(PSI0_TORSO_HEIGHT_INDEX)) ??
      readNumber(row, actionKey(PSI0_ACTION_TORSO_HEIGHT_INDEX)) ??
      0;
    qpos[0] = x;
    qpos[1] = y;
    qpos[2] = height;
    writeYawQuaternion(qpos, yaw);
    return qpos;
  });
}

function hasPsi0BaseCommand(row: Record<string, unknown>) {
  return (
    actionKey(PSI0_ACTION_VX_INDEX) in row ||
    actionKey(PSI0_ACTION_VY_INDEX) in row ||
    actionKey(PSI0_ACTION_VYAW_INDEX) in row ||
    actionKey(PSI0_ACTION_TARGET_YAW_INDEX) in row
  );
}

function stateKey(index: number) {
  return `states | ${index}`;
}

function actionKey(index: number) {
  return `action | ${index}`;
}

function readNumber(row: Record<string, unknown>, key: string) {
  const raw = row[key];
  const value = typeof raw === "number" ? raw : Number(raw);
  if (Number.isFinite(value)) return value;
  return null;
}

function writeYawQuaternion(qpos: Float64Array, yaw: number) {
  const halfYaw = yaw / 2;
  qpos[3] = Math.cos(halfYaw);
  qpos[4] = 0;
  qpos[5] = 0;
  qpos[6] = Math.sin(halfYaw);
}
