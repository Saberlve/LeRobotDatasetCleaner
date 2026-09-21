# Initial waiting detection: steps 1 and 2

This module inspects signal semantics and generates leading-idle candidates.
It does not delete data, write clip drafts, export, or add UI controls. Every
candidate has `reviewStatus: "pending"`; low activity does not prove task value.

## Inspection on 2026-09-21

Target: `/home/liushiqi/projects/VLArmory/tools/lerobot_dataset_cleaner`.
Baseline: `9ac7871605279a94b7bab09df81657cb2de5d453`.

- Existing chart loading subsamples rows. Detection instead reads every original
  signal row with its frame index and timestamp.
- Existing manual clipping uses inclusive intervals; detection returns the same
  convention but does not apply candidates to the clipping/export workflow.
- `datasets/xarm7_gello_pick_bar/meta/info.json` declares LeRobot v3.0, 30 Hz,
  38 episodes, 16133 frames, two cameras, and eight-dimensional state/action
  vectors named `J1.pos` through `J7.pos` and `gripper.pos`.
- No control-start or movement-enabled field is declared. The checked server
  example directory contains metadata only, without raw trajectory/video files.
- The checked xArm collector reads joint positions in radians, normalizes
  gripper observations with `get_gripper_norm`, and sends absolute joint targets
  in radians. This is source-code evidence, not proof of the exact configuration
  used to collect the example dataset. Normalized gripper values are not mm.
- Metadata does not fully specify action semantics, units, or noise thresholds.
  Require explicit configuration and calibration against actual recordings.

## API

Exports are in `src/lib/initial-idle/index.ts`:

- `inspectIdleSignals(info, profile?)`: inventory features and validate mappings;
  no automatic guessing of action semantics, gripper indices, or units.
- `saveIdleProfile(storage, repoId, info, profile)` / `loadIdleProfile(...)`:
  per-dataset settings, using injected storage such as localStorage. Changes to
  feature schema or FPS invalidate stored settings.
- `loadEpisodeSignalFrames(repoId, episodeId, profile)`: complete unsampled rows
  for v2.0/v2.1/v3.0, with strict identities and v3 episode-length validation.
- `detectInitialIdle(frames, profile)`: pure detector, never mutates input.
- `analyzeEpisodeInitialIdle(repoId, episodeId, profile)`: loader + detector;
  loading failures produce `needs_review` with a reason.

```ts
import { analyzeEpisodeInitialIdle } from "@/lib/initial-idle";

const result = await analyzeEpisodeInitialIdle(repoId, episodeId, profile);
// Present evidence for human review; do not automatically apply the interval.
```

## Configuration

Map every state/action dimension exactly once. This initial implementation
requires equal paired vector dimensions; incompatible schemas report an error.
Each channel declares its role, indices, units, action mode and thresholds.

| Setting                  | Interpretation                                                                    |
| ------------------------ | --------------------------------------------------------------------------------- |
| `stateSpeed`             | Measured change per actual second, in channel units/s                             |
| `stateExcursion`         | Maximum accumulated displacement from the initial state allowed in a quiet prefix |
| `actionActivity`         | Absolute targets: units/s; delta/velocity: native command magnitude               |
| `actionExcursion`        | Maximum displacement from initial absolute target, required in absolute mode      |
| `trackingError`          | Optional target/state error, only for verified matching units and coordinates     |
| `period`                 | Optional period for genuinely periodic joints; never assume bounded joints wrap   |
| `minIdleSeconds`         | Minimum deletable duration after retaining context                                |
| `activityConfirmSeconds` | Required uninterrupted arm activity duration                                      |
| `activityRatio`          | High/low threshold ratio; joint onset must reach the high threshold               |
| `contextSeconds`         | Retained observation context before earliest activity                             |
| `maxGapSeconds`          | Largest acceptable gap between original timestamps                                |
| `startEventKey`          | Optional, explicitly trusted boolean control-start field                          |

No universal robot thresholds are shipped. Trial timing values might be 1 s
minimum wait, 0.2 s confirmation and 0.5 s context; these are not validated
defaults. Set the maximum gap from actual timing jitter and calibrate each
channel using both known waits and deliberately slow motion. Test fixtures use
synthetic units and must not be copied as robot calibration.

## Decisions

1. Validate all frames before proposing a cut: missing/nonfinite signals, wrong
   dimensions, missing events, noncontiguous indices, bad timestamps or excessive
   gaps produce `needs_review`. Do not fill zeros or silently discard bad rows.
2. Scan the prefix using measured velocities and command activity. Constant
   nonzero absolute targets may be idle; delta/velocity commands are evaluated
   by magnitude, not just by change between adjacent commands.
3. Joint activity must persist and reach the high threshold. Gripper activity,
   including a single-frame command, immediately protects the boundary. Preserve
   the pre-transition observation. A trusted start event can establish an earlier
   boundary but cannot move previously detected activity later.
4. Slow accumulated displacement and brief/ambiguous arm pulses require review.
   An entirely still episode has no confirmed start: never propose deleting all
   of it. `next.done`, reward and the final frame are not inferred start events.
5. Preserve context using actual timestamps, including the sample before the
   cutoff. A sufficiently long remainder produces `candidate`; otherwise return
   `no_candidate`. Return original inclusive frame bounds, a half-open time
   interval, onset, evidence, warnings, and pending review status.

v3 loading reuses the existing multi-chunk metadata iterator, converts global
bounds to file-local ranges, and checks episode/frame/global indices and length.
Full-file fallback isolates the episode and repeats these checks. v2 reads the
complete per-episode file and validates indices; it cannot detect absent trailing
rows without an independent expected-length record.

## Limits and validation

The detector cannot infer scene changes, object settling, contact/grasp intent,
or all sensor freezes from these numeric signals alone. Below-threshold motion
can still be meaningful. Video/curve review remains necessary. Middle pauses,
trailing waits, review UI, and synchronized export are later stages.

Synthetic tests cover boundaries/context, gripper-only activity, command modes,
slow drift, periodic joints, events, corrupt data, saved profiles and v2/v3 shared
file loading. They verify software behavior, not real-data accuracy or latency.
Real-episode validation and threshold calibration await raw recordings.
