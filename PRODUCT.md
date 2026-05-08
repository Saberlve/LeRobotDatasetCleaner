# Product Context

## Register

product

## Product Purpose

LeRobotDatasetCleaner is a task-focused robotics data and evaluation workspace. It helps robotics researchers inspect LeRobot datasets, clean real robot episodes, compare memory-policy training runs, and replay evaluation videos from one local web application.

## Users

- Robotics researchers preparing thesis or paper evidence.
- VLA/VLM policy engineers comparing training checkpoints and rollout behavior.
- Dataset operators cleaning local LeRobot-format recordings before training.

## Core Jobs

- Open local or remote LeRobot datasets and inspect synchronized video, action curves, statistics, URDF playback, and filtering state.
- Review training configuration and W&B training curves without losing the link to downstream evaluation evidence.
- Compare SimplerEnv and RMBench results across runs, checkpoints, tasks, and videos.
- Move from evaluation evidence back into real ACONE dataset inspection.

## Brand And Tone

The interface should feel like an integrated research platform: calm, precise, and operational. It uses a warm Claude-like surface language: off-white canvas, ink-brown text, muted clay accents, soft but crisp borders, and restrained typography.

## Anti-References

- Poster-like thesis pages with oversized headlines and large promotional blocks.
- Disconnected cards that make each tool feel like a separate demo.
- Decorative dashboards that hide the underlying training and evaluation workflow.
- Generic dark analytics UI, neon robotics styling, or noisy metric walls.

## Strategic Principles

- Preserve function before decoration: existing training config editing, W&B linking, SimplerEnv results, video replay, RMBench replay, and ACONE data entry must remain available.
- Make the platform structure obvious: data viewing, training configuration and curves, and evaluation replay should be separate work areas connected by shared navigation.
- Keep evidence close to controls: selectors, metrics, result text, and video playback should sit in the same working context.
- Prefer compact hierarchy, readable tables, clear controls, and stable panel dimensions over hero-scale storytelling.
