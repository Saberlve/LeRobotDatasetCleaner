import { profileIssues } from "./profile";
import type {
  ActivityTrigger,
  InitialIdleProfile,
  InitialIdleResult,
  SignalFrame,
} from "./types";

export function idleResult(
  status: InitialIdleResult["status"],
  reason: string,
  warnings: string[] = [],
): InitialIdleResult {
  return {
    detectorVersion: "initial-idle/2",
    status,
    reason,
    warnings,
    candidate: null,
  };
}

function difference(a: number, b: number, period?: number): number {
  const d = a - b;
  return period === undefined
    ? d
    : ((((d + period / 2) % period) + period) % period) - period / 2;
}

/** Pure detector over ALL original frames, never chart-sampled rows. */
export function detectInitialIdle(
  frames: readonly SignalFrame[],
  profile: InitialIdleProfile,
): InitialIdleResult {
  const issues = profileIssues(profile);
  if (issues.length)
    return idleResult("needs_review", "invalid_profile", issues);
  if (frames.length < 2)
    return idleResult("needs_review", "insufficient_frames");
  const dimensions = profile.channels.length;
  // Validate before proposing anything; never drop malformed rows or invent zeros.
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    if (f.frameIndex !== i || !Number.isFinite(f.timestamp) || f.timestamp < 0)
      return idleResult("needs_review", "invalid_frame_identity_or_timestamp");
    if (
      ![f.state, f.action].every(
        (v) =>
          Array.isArray(v) &&
          v.length === dimensions &&
          v.every(Number.isFinite),
      )
    )
      return idleResult("needs_review", "missing_or_invalid_signal");
    if (profile.startEventKey && typeof f.startEvent !== "boolean")
      return idleResult("needs_review", "missing_start_event");
    if (i > 0) {
      const dt = f.timestamp - frames[i - 1].timestamp;
      if (dt <= 0 || dt > profile.maxGapSeconds + 1e-6)
        return idleResult("needs_review", "timestamp_gap_or_disorder");
    }
  }
  const warnings = [
    "Low activity does not establish that a segment has no task value. Human review is required.",
  ];
  if (!profile.startEventKey)
    warnings.push(
      "No trusted control-start event; onset is inferred from signals.",
    );
  const candidateAt = (
    onset: number,
    source: NonNullable<InitialIdleResult["candidate"]>["activitySource"],
    evidence: string[],
  ): InitialIdleResult => {
    const time = frames[onset].timestamp;
    const cutoff = time - profile.contextSeconds;
    // Keep the sample BEFORE the cutoff so retained context is never too short.
    let keepFrom = 0;
    while (
      keepFrom + 1 < onset &&
      frames[keepFrom + 1].timestamp <= cutoff + 1e-9
    )
      keepFrom++;
    const duration = frames[keepFrom].timestamp - frames[0].timestamp;
    if (keepFrom === 0 || duration + 1e-9 < profile.minIdleSeconds)
      return idleResult(
        "no_candidate",
        "insufficient_leading_wait_after_context",
        warnings,
      );
    return {
      ...idleResult(
        "candidate",
        "leading_low_activity_before_control",
        warnings,
      ),
      candidate: {
        removedFrames: {
          start: frames[0].frameIndex,
          end: frames[keepFrom - 1].frameIndex,
        },
        removedTime: {
          start: frames[0].timestamp,
          endExclusive: frames[keepFrom].timestamp,
          duration,
        },
        activityFrame: frames[onset].frameIndex,
        activityTimestamp: time,
        activitySource: source,
        retainedContextSeconds: time - frames[keepFrom].timestamp,
        evidence,
        reviewStatus: "pending",
      },
    };
  };
  if (profile.startEventKey && frames[0].startEvent)
    return {
      ...idleResult("no_candidate", "control_already_started", warnings),
      diagnostics: {
        ignoredSmallChanges: 0,
        triggers: [
          {
            channel: profile.startEventKey,
            signal: "event",
            frame: 0,
            timestamp: frames[0].timestamp,
            onsetFrame: 0,
            windowSeconds: 0,
            speed: 0,
            speedThreshold: 0,
            displacement: 0,
            displacementThreshold: 0,
            unit: "",
            reason: "start_event",
          },
        ],
      },
    };
  const initialTrigger = (
    c: InitialIdleProfile["channels"][number],
    reason: ActivityTrigger["reason"],
    magnitude: number,
    threshold: number,
  ): ActivityTrigger => ({
    channel: c.name,
    signal: "action",
    frame: 0,
    timestamp: frames[0].timestamp,
    onsetFrame: 0,
    windowSeconds: 0,
    speed: magnitude,
    speedThreshold: threshold,
    displacement: magnitude,
    displacementThreshold: threshold,
    unit: c.actionUnit,
    reason,
  });
  for (const c of profile.channels) {
    if (
      c.actionMode !== "absolute" &&
      Math.abs(frames[0].action[c.actionIndex]) > c.actionActivity
    )
      return {
        ...idleResult(
          "no_candidate",
          "active_command_at_first_frame",
          warnings,
        ),
        diagnostics: {
          ignoredSmallChanges: 0,
          triggers: [
            initialTrigger(
              c,
              "active_command",
              Math.abs(frames[0].action[c.actionIndex]),
              c.actionActivity,
            ),
          ],
        },
      };
    if (
      c.trackingError !== undefined &&
      Math.abs(
        difference(
          frames[0].action[c.actionIndex],
          frames[0].state[c.stateIndex],
          c.period,
        ),
      ) > c.trackingError
    )
      return {
        ...idleResult(
          "needs_review",
          "initial_target_tracking_error",
          warnings,
        ),
        diagnostics: {
          ignoredSmallChanges: 0,
          triggers: [
            initialTrigger(
              c,
              "tracking_error",
              Math.abs(
                difference(
                  frames[0].action[c.actionIndex],
                  frames[0].state[c.stateIndex],
                  c.period,
                ),
              ),
              c.trackingError,
            ),
          ],
        },
      };
  }

  // Independent state/action histories: unrelated channel spikes cannot be
  // stitched into one sustained motion. Unwrap only explicitly periodic axes.
  const streams = profile.channels.flatMap((channel) =>
    (["state", "action"] as const).map((signal) => ({
      channel,
      signal,
      values: [0],
      rates: [0],
      runStart: null as number | null,
      min: 0,
      max: 0,
      hazard: null as ActivityTrigger | null,
    })),
  );
  let ignoredSmallChanges = 0;
  const annotate = (value: InitialIdleResult, triggers: ActivityTrigger[]) => ({
    ...value,
    diagnostics: {
      ignoredSmallChanges,
      triggers: [...triggers].sort((a, b) => a.frame - b.frame),
    },
  });
  const hazards = () => streams.flatMap((s) => (s.hazard ? [s.hazard] : []));
  const protectedCandidate = (
    onset: number,
    source: NonNullable<InitialIdleResult["candidate"]>["activitySource"],
    triggers: ActivityTrigger[],
    labels: string[],
  ) => {
    const allHazards = hazards();
    const earlier = allHazards.filter((h) => h.onsetFrame < onset);
    if (allHazards.some((h) => h.reason === "slow_drift"))
      return annotate(
        idleResult("needs_review", "slow_accumulated_motion", warnings),
        [...allHazards, ...triggers],
      );
    // Never erase a significant transient: move the protected boundary BEFORE
    // it. Continue searching only to establish that later task activity exists.
    const protectedOnset = Math.min(onset, ...earlier.map((h) => h.onsetFrame));
    const value = candidateAt(protectedOnset, source, [
      ...new Set([
        ...earlier.map(
          (t) =>
            `${t.channel}: ${t.signal === "state" ? "measured motion" : "command activity"}`,
        ),
        ...labels,
      ]),
    ]);
    if (earlier.length && !value.candidate)
      return annotate(
        idleResult("needs_review", "significant_early_activity", warnings),
        [...earlier, ...triggers],
      );
    if (earlier.length)
      value.warnings.push(
        "裁剪边界已前移以保留更早的明显短暂变化；请检查该变化是否属于任务过程。",
      );
    return annotate(value, [...earlier, ...triggers]);
  };
  let windowStart = 0;
  for (let i = 1; i < frames.length; i++) {
    const current = frames[i],
      previous = frames[i - 1];
    const dt = current.timestamp - previous.timestamp;
    // Include the sample immediately before the requested window boundary.
    while (
      windowStart + 1 < i &&
      current.timestamp - frames[windowStart + 1].timestamp >=
        profile.activityConfirmSeconds - 1e-9
    )
      windowStart++;
    const confirmed: ActivityTrigger[] = [];
    const grippers: ActivityTrigger[] = [];
    const commands: ActivityTrigger[] = [];
    const tracking: ActivityTrigger[] = [];
    for (const stream of streams) {
      const c = stream.channel;
      const key = stream.signal;
      const index = key === "state" ? c.stateIndex : c.actionIndex;
      const absolute = key === "state" || c.actionMode === "absolute";
      const threshold = key === "state" ? c.stateSpeed : c.actionActivity;
      const excursion =
        key === "state" ? c.stateExcursion : (c.actionExcursion ?? 0);
      const delta = absolute
        ? difference(current[key][index], previous[key][index], c.period)
        : current[key][index];
      const rate = Math.abs(delta) / (absolute ? dt : 1);
      stream.values.push(stream.values[i - 1] + (absolute ? delta : 0));
      stream.rates.push(rate);
      stream.min = Math.min(stream.min, stream.values[i]);
      stream.max = Math.max(stream.max, stream.values[i]);
      if (rate > threshold) stream.runStart ??= i - 1;
      else stream.runStart = null;
      const start = Math.max(windowStart, stream.runStart ?? i - 1);
      const elapsed = current.timestamp - frames[start].timestamp;
      const displacement = absolute
        ? Math.abs(stream.values[i] - stream.values[start])
        : Math.abs(delta);
      const trigger = (
        reason: ActivityTrigger["reason"],
        onset = start,
      ): ActivityTrigger => ({
        channel: c.name,
        signal: key,
        frame: i,
        timestamp: current.timestamp,
        onsetFrame: onset,
        windowSeconds: elapsed,
        speed: rate,
        speedThreshold: threshold,
        displacement,
        displacementThreshold: absolute ? excursion : threshold,
        unit: key === "state" ? c.stateUnit : c.actionUnit,
        reason,
      });
      // Gripper changes and non-absolute commands remain immediately protected.
      if (c.role === "gripper" && rate > threshold)
        grippers.push(trigger("gripper", i - 1));
      if (!absolute && rate > threshold)
        commands.push(trigger("active_command", i - 1));
      if (
        key === "state" &&
        c.trackingError !== undefined &&
        Math.abs(
          difference(
            current.action[c.actionIndex],
            current.state[c.stateIndex],
            c.period,
          ),
        ) > c.trackingError
      )
        tracking.push({
          ...trigger("tracking_error", i - 1),
          displacement: Math.abs(
            difference(
              current.action[c.actionIndex],
              current.state[c.stateIndex],
              c.period,
            ),
          ),
          displacementThreshold: c.trackingError,
        });
      const significant = absolute && displacement > excursion;
      const persistent =
        stream.runStart !== null &&
        elapsed + 1e-9 >= profile.activityConfirmSeconds;
      let high = false;
      if (significant && persistent) {
        for (let j = start + 1; j <= i; j++)
          if (stream.rates[j] >= threshold * profile.activityRatio) high = true;
      }
      if (
        c.role !== "gripper" &&
        significant &&
        persistent &&
        high &&
        displacement / elapsed > threshold
      )
        confirmed.push(trigger("confirmed_motion"));
      if (absolute && stream.max - stream.min > excursion && !stream.hazard) {
        stream.hazard = {
          ...trigger(
            stream.runStart === null ||
              (Math.abs(delta) < excursion / profile.activityRatio &&
                Math.abs(stream.values[i] - stream.values[windowStart]) /
                  (current.timestamp - frames[windowStart].timestamp) <=
                  threshold)
              ? "slow_drift"
              : "significant_pulse",
          ),
          displacement: stream.max - stream.min,
        };
      }
      if (
        absolute &&
        rate > threshold &&
        stream.max - stream.min <= excursion &&
        c.role !== "gripper"
      )
        ignoredSmallChanges++;
    }
    if (tracking.length)
      return annotate(
        idleResult(
          "needs_review",
          "target_tracking_error_during_wait",
          warnings,
        ),
        tracking,
      );
    if (grippers.length || commands.length) {
      const triggers = [...grippers, ...commands];
      const onset = Math.min(...triggers.map((t) => t.onsetFrame));
      return protectedCandidate(
        onset,
        grippers.length ? "gripper" : "motion",
        triggers,
        triggers.map(
          (t) =>
            `${t.channel}: ${t.signal === "state" ? "measured motion" : "command activity"}`,
        ),
      );
    }
    if (confirmed.length) {
      // A preceding significant departure is kept even if confirmation arrives
      // later. An unrelated earlier hazard blocks trimming across that event.
      const onset = Math.min(...confirmed.map((t) => t.onsetFrame));
      return protectedCandidate(
        onset,
        "motion",
        confirmed,
        confirmed.map(
          (t) =>
            `${t.channel}: ${t.signal === "state" ? "measured motion" : "command activity"}`,
        ),
      );
    }
    if (profile.startEventKey && current.startEvent) {
      const t: ActivityTrigger = {
        channel: profile.startEventKey,
        signal: "event",
        frame: i,
        timestamp: current.timestamp,
        onsetFrame: i,
        windowSeconds: 0,
        speed: 0,
        speedThreshold: 0,
        displacement: 0,
        displacementThreshold: 0,
        unit: "",
        reason: "start_event",
      };
      return protectedCandidate(i, "start_event", [t], [profile.startEventKey]);
    }
  }
  const unresolved = hazards();
  return annotate(
    idleResult(
      "needs_review",
      unresolved.length
        ? unresolved.some((h) => h.reason === "slow_drift")
          ? "slow_accumulated_motion"
          : "significant_early_activity"
        : "no_confirmed_start",
      warnings,
    ),
    unresolved,
  );
}
