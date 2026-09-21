import type { InitialIdleProfile, SignalSchema } from "./types";

/** Trial tolerances, not automatic calibration or proof of acquisition units. */
export function createXarmIdleProfile(
  info: SignalSchema,
): InitialIdleProfile | null {
  const joints = Array.from({ length: 7 }, (_, i) => `J${i + 1}.pos`);
  const pose = [
    "pose.x",
    "pose.y",
    "pose.z",
    "pose.r11",
    "pose.r21",
    "pose.r31",
    "pose.r12",
    "pose.r22",
    "pose.r32",
  ];
  const names = info.features["observation.state"]?.names;
  const actions = info.features.action?.names;
  if (
    !Array.isArray(names) ||
    !Array.isArray(actions) ||
    JSON.stringify(names) !== JSON.stringify(actions)
  )
    return null;
  if (
    ![joints.concat("gripper.pos"), joints.concat(pose, "gripper.pos")].some(
      (expected) => JSON.stringify(expected) === JSON.stringify(names),
    )
  )
    return null;
  if (!Number.isFinite(info.fps) || info.fps <= 0) return null;
  return {
    version: 1,
    stateKey: "observation.state",
    actionKey: "action",
    gripper: "present",
    minIdleSeconds: 1,
    activityConfirmSeconds: 0.2,
    contextSeconds: 0.5,
    maxGapSeconds: 2.5 / info.fps,
    activityRatio: 2,
    channels: names.map((name, index) => {
      const gripper = name === "gripper.pos";
      const xyz = ["pose.x", "pose.y", "pose.z"].includes(name);
      const rotation = name.startsWith("pose.r");
      const speed = gripper ? 0.25 : xyz ? 2 : 0.02;
      const excursion = gripper ? 0.025 : xyz ? 1 : 0.01;
      const unit = gripper
        ? "normalized"
        : xyz
          ? "mm"
          : rotation
            ? "dimensionless"
            : "rad";
      return {
        name,
        role: gripper ? "gripper" : "joint",
        stateIndex: index,
        actionIndex: index,
        stateUnit: unit,
        actionUnit: unit,
        actionMode: "absolute",
        stateSpeed: speed,
        stateExcursion: excursion,
        // Protect gripper commands more strictly than quantized measurements.
        actionActivity: gripper ? 0.05 : speed,
        actionExcursion: gripper ? 0.01 : excursion,
      };
    }),
  };
}

export const idleReasonLabels: Record<string, string> = {
  significant_early_activity:
    "前段存在明显的短暂变化，不能跨过它裁剪；请查看触发明细。",
  insufficient_trailing_wait_after_context:
    "保留完成确认过程后，没有足够长的尾部等待。",
  tail_video_unavailable:
    "视频缺失、解码失败或画面异常，不能自动确认尾部静止。",
  no_confirmed_end: "整段没有明确活动边界，不能认定整个 episode 都是等待。",
  invalid_profile: "检测参数或通道对应关系不完整。",
  insufficient_frames: "有效帧不足，无法判断。",
  invalid_frame_identity_or_timestamp: "帧编号或时间戳异常，请检查数据。",
  missing_or_invalid_signal: "关节、夹爪或动作数据缺失。",
  missing_start_event: "配置的开始事件缺失。",
  timestamp_gap_or_disorder: "时间戳存在间隔过大、重复或乱序。",
  insufficient_leading_wait_after_context:
    "保留动作前上下文后，没有足够长的开头等待。",
  control_already_started: "记录开始时控制已启动。",
  active_command_at_first_frame: "第一帧已存在有效控制指令。",
  initial_target_tracking_error: "初始目标与实际位置不一致，需要人工检查。",
  target_tracking_error_during_wait: "等待期间目标与实际位置偏差过大。",
  brief_or_ambiguous_early_activity: "开头出现短暂或不明确的活动，请人工复核。",
  slow_accumulated_motion: "发现缓慢累积运动，暂不建议裁剪。",
  no_confirmed_start: "没有找到明确的动作开始点，不能认定整段都是等待。",
  unconfirmed_activity_at_end: "活动持续时间不足，尚不能确认开始点。",
};
