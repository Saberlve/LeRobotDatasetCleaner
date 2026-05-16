#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import math
import os
from pathlib import Path
from typing import Iterable


def _set_default_openpi_env() -> None:
    os.environ.setdefault("OPENPI_CODE_ROOT", "/VLA/openpi")
    os.environ.setdefault("OPENPI_MODELS_ROOT", "/root/autodl-tmp")
    os.environ.setdefault("OPENPI_DATASETS_ROOT", "/root/autodl-tmp/datasets")
    os.environ.setdefault("OPENPI_CHECKPOINTS_ROOT", "/root/autodl-tmp/checkpoints")
    os.environ.setdefault("OPENPI_CACHE_ROOT", "/root/autodl-tmp")


_set_default_openpi_env()

import cv2  # noqa: E402
import matplotlib  # noqa: E402

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from openpi.policies import policy_config  # noqa: E402
from openpi.training import config as openpi_config  # noqa: E402


DEFAULT_CHECKPOINT = "/root/autodl-tmp/checkpoints/pi05_arx/pick_X_times/pick_X_times/13000"
DEFAULT_DATASET = "/root/autodl-tmp/pick_X_times_filterd_twice"
DEFAULT_OUTPUT = "/root/autodl-tmp/eval_results/pi05_arx_13000_open_loop"
DEFAULT_PROMPT = "Pick up the black pouch three times, then touch the green grommet"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Open-loop evaluation for pi05 ARX pick_X_times checkpoints.")
    parser.add_argument("--config-name", default="pi05_arx")
    parser.add_argument("--checkpoint-dir", default=DEFAULT_CHECKPOINT)
    parser.add_argument("--dataset-root", default=DEFAULT_DATASET)
    parser.add_argument("--output-dir", default=DEFAULT_OUTPUT)
    parser.add_argument("--head-image-key", default="observation.images.head")
    parser.add_argument("--left-wrist-image-key", default="observation.images.left_wrist")
    parser.add_argument("--right-wrist-image-key", default="observation.images.right_wrist")
    parser.add_argument("--state-key", default="observation.state")
    parser.add_argument("--action-key", default="action")
    parser.add_argument("--prompt", default=None)
    parser.add_argument("--stride", type=int, default=30)
    parser.add_argument("--horizon", type=int, default=30)
    parser.add_argument("--max-episodes", type=int, default=None)
    parser.add_argument("--max-frames-per-episode", type=int, default=None)
    parser.add_argument("--seed", type=int, default=0)
    return parser.parse_args()


def load_jsonl(path: Path) -> list[dict]:
    rows: list[dict] = []
    with path.open() as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def episode_parquet(dataset_root: Path, episode_index: int) -> Path:
    chunk = episode_index // 1000
    return dataset_root / "data" / f"chunk-{chunk:03d}" / f"episode_{episode_index:06d}.parquet"


def episode_video(dataset_root: Path, image_key: str, episode_index: int) -> Path:
    chunk = episode_index // 1000
    return dataset_root / "videos" / f"chunk-{chunk:03d}" / image_key / f"episode_{episode_index:06d}.mp4"


def read_video_frames(path: Path) -> list[np.ndarray]:
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video: {path}")
    frames: list[np.ndarray] = []
    while True:
        ok, frame_bgr = cap.read()
        if not ok:
            break
        frames.append(cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB))
    cap.release()
    if not frames:
        raise RuntimeError(f"No frames decoded from video: {path}")
    return frames


def as_float_array(value) -> np.ndarray:
    return np.asarray(value, dtype=np.float32)


def iter_episode_indices(dataset_root: Path, max_episodes: int | None) -> Iterable[int]:
    episodes = load_jsonl(dataset_root / "meta" / "episodes.jsonl")
    indices = [int(row["episode_index"]) for row in episodes]
    if max_episodes is not None:
        indices = indices[:max_episodes]
    return indices


def make_policy(config_name: str, checkpoint_dir: Path, prompt: str | None, seed: int):
    np.random.seed(seed)
    cfg = openpi_config.get_config(config_name)
    return policy_config.create_trained_policy(
        cfg,
        checkpoint_dir,
        default_prompt=prompt or DEFAULT_PROMPT,
        asset_id="arx",
    )


def infer_actions(
    policy,
    head_image: np.ndarray,
    left_wrist_image: np.ndarray,
    right_wrist_image: np.ndarray,
    state: np.ndarray,
    prompt: str,
) -> tuple[np.ndarray, float]:
    result = policy.infer(
        {
            "observation/images/head": head_image,
            "observation/images/left_wrist": left_wrist_image,
            "observation/images/right_wrist": right_wrist_image,
            "observation/state": state,
            "prompt": prompt,
        }
    )
    actions = np.asarray(result["actions"], dtype=np.float32)
    timing = result.get("policy_timing", {})
    infer_ms = float(timing.get("infer_ms", math.nan))
    return actions, infer_ms


def write_csv(path: Path, rows: list[dict], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def plot_overall(summary_df: pd.DataFrame, long_df: pd.DataFrame, output_dir: Path) -> None:
    if summary_df.empty:
        return
    plt.figure(figsize=(12, 5))
    for episode, part in summary_df.groupby("episode_index"):
        plt.plot(part["frame_index"], part["mae"], alpha=0.35, linewidth=1)
    grouped = summary_df.groupby("frame_index", as_index=False)["mae"].mean()
    plt.plot(grouped["frame_index"], grouped["mae"], color="black", linewidth=2.2, label="mean")
    plt.xlabel("Frame index")
    plt.ylabel("MAE")
    plt.title("Open-loop first-action MAE by frame")
    plt.legend()
    plt.tight_layout()
    plt.savefig(output_dir / "overall_first_action_mae.png", dpi=180)
    plt.close()

    dim_mae = long_df.groupby("action_dim", as_index=False)["abs_error"].mean()
    plt.figure(figsize=(12, 5))
    plt.bar(dim_mae["action_dim"].astype(str), dim_mae["abs_error"])
    plt.xlabel("Action dimension")
    plt.ylabel("Mean absolute error")
    plt.title("Action-dimension MAE across all evaluated horizons")
    plt.tight_layout()
    plt.savefig(output_dir / "action_dim_mae.png", dpi=180)
    plt.close()

    episode_mae = summary_df.groupby("episode_index", as_index=False)["mae"].mean()
    plt.figure(figsize=(12, 5))
    plt.plot(episode_mae["episode_index"], episode_mae["mae"], marker="o")
    plt.xlabel("Episode")
    plt.ylabel("Mean first-action MAE")
    plt.title("Episode-level open-loop error")
    plt.tight_layout()
    plt.savefig(output_dir / "episode_mae.png", dpi=180)
    plt.close()


def plot_episode_curves(summary_rows: list[dict], first_action_rows: list[dict], output_dir: Path) -> None:
    curves_dir = output_dir / "curves"
    curves_dir.mkdir(parents=True, exist_ok=True)
    if not first_action_rows:
        return
    first_df = pd.DataFrame(first_action_rows)
    for episode, part in first_df.groupby("episode_index"):
        dims = sorted(part["action_dim"].unique())
        ncols = 2
        nrows = int(math.ceil(len(dims) / ncols))
        fig, axes = plt.subplots(nrows, ncols, figsize=(14, max(4, 2.2 * nrows)), squeeze=False)
        for ax, dim in zip(axes.ravel(), dims):
            dim_df = part[part["action_dim"] == dim]
            ax.plot(dim_df["frame_index"], dim_df["target"], label="target", linewidth=1.2)
            ax.plot(dim_df["frame_index"], dim_df["pred"], label="pred", linewidth=1.2)
            ax.set_title(f"dim {dim}")
            ax.grid(alpha=0.25)
        for ax in axes.ravel()[len(dims) :]:
            ax.axis("off")
        handles, labels = axes[0, 0].get_legend_handles_labels()
        fig.legend(handles, labels, loc="upper right")
        fig.suptitle(f"Episode {int(episode):06d}: first predicted action vs target")
        fig.tight_layout(rect=(0, 0, 0.98, 0.97))
        fig.savefig(curves_dir / f"episode_{int(episode):06d}_first_action_curves.png", dpi=170)
        plt.close(fig)


def main() -> None:
    args = parse_args()
    if args.stride <= 0:
        raise ValueError("--stride must be positive")
    if args.horizon <= 0:
        raise ValueError("--horizon must be positive")

    dataset_root = Path(args.dataset_root)
    checkpoint_dir = Path(args.checkpoint_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    prompt = args.prompt or DEFAULT_PROMPT
    policy = make_policy(args.config_name, checkpoint_dir, prompt, args.seed)

    long_rows: list[dict] = []
    summary_rows: list[dict] = []
    first_action_rows: list[dict] = []

    for episode_index in iter_episode_indices(dataset_root, args.max_episodes):
        if hasattr(policy, "reset"):
            policy.reset()

        parquet_path = episode_parquet(dataset_root, episode_index)
        head_video_path = episode_video(dataset_root, args.head_image_key, episode_index)
        left_wrist_video_path = episode_video(dataset_root, args.left_wrist_image_key, episode_index)
        right_wrist_video_path = episode_video(dataset_root, args.right_wrist_image_key, episode_index)
        df = pd.read_parquet(parquet_path)
        head_frames = read_video_frames(head_video_path)
        left_wrist_frames = read_video_frames(left_wrist_video_path)
        right_wrist_frames = read_video_frames(right_wrist_video_path)
        usable = min(len(df), len(head_frames), len(left_wrist_frames), len(right_wrist_frames))
        max_start = usable - args.horizon
        if max_start < 0:
            continue

        starts = list(range(0, max_start + 1, args.stride))
        if args.max_frames_per_episode is not None:
            starts = starts[: args.max_frames_per_episode]

        for start in starts:
            state = as_float_array(df.iloc[start][args.state_key])
            head_image = head_frames[start]
            left_wrist_image = left_wrist_frames[start]
            right_wrist_image = right_wrist_frames[start]
            target = np.stack([as_float_array(v) for v in df.iloc[start : start + args.horizon][args.action_key]])
            pred, infer_ms = infer_actions(policy, head_image, left_wrist_image, right_wrist_image, state, prompt)

            pred_h = min(pred.shape[0], target.shape[0])
            pred_d = min(pred.shape[-1], target.shape[-1])
            pred_eval = pred[:pred_h, :pred_d]
            target_eval = target[:pred_h, :pred_d]
            error = pred_eval - target_eval
            abs_error = np.abs(error)
            mae = float(abs_error[0].mean())
            rmse = float(np.sqrt(np.mean(error[0] ** 2)))
            max_abs = float(abs_error[0].max())

            summary_rows.append(
                {
                    "episode_index": episode_index,
                    "frame_index": int(df.iloc[start]["frame_index"]),
                    "timestamp": float(df.iloc[start]["timestamp"]),
                    "horizon": pred_h,
                    "action_dim": pred_d,
                    "mae": mae,
                    "rmse": rmse,
                    "max_abs": max_abs,
                    "infer_ms": infer_ms,
                }
            )

            for horizon_step in range(pred_h):
                frame_index = int(df.iloc[start + horizon_step]["frame_index"])
                timestamp = float(df.iloc[start + horizon_step]["timestamp"])
                for dim in range(pred_d):
                    row = {
                        "episode_index": episode_index,
                        "eval_start_frame": int(df.iloc[start]["frame_index"]),
                        "frame_index": frame_index,
                        "timestamp": timestamp,
                        "horizon_step": horizon_step,
                        "action_dim": dim,
                        "pred": float(pred_eval[horizon_step, dim]),
                        "target": float(target_eval[horizon_step, dim]),
                        "error": float(error[horizon_step, dim]),
                        "abs_error": float(abs_error[horizon_step, dim]),
                    }
                    long_rows.append(row)
                    if horizon_step == 0:
                        first_action_rows.append(row)

        print(f"episode {episode_index}: evaluated {len(starts)} start frames")

    write_csv(
        output_dir / "open_loop_summary.csv",
        summary_rows,
        ["episode_index", "frame_index", "timestamp", "horizon", "action_dim", "mae", "rmse", "max_abs", "infer_ms"],
    )
    write_csv(
        output_dir / "open_loop_actions.csv",
        long_rows,
        [
            "episode_index",
            "eval_start_frame",
            "frame_index",
            "timestamp",
            "horizon_step",
            "action_dim",
            "pred",
            "target",
            "error",
            "abs_error",
        ],
    )
    summary_df = pd.DataFrame(summary_rows)
    long_df = pd.DataFrame(long_rows)
    if not summary_df.empty:
        summary_df.groupby("episode_index", as_index=False).agg(
            frames=("frame_index", "count"),
            mae_mean=("mae", "mean"),
            mae_std=("mae", "std"),
            rmse_mean=("rmse", "mean"),
            max_abs_mean=("max_abs", "mean"),
            infer_ms_mean=("infer_ms", "mean"),
        ).to_csv(output_dir / "episode_summary.csv", index=False)
    plot_overall(summary_df, long_df, output_dir)
    plot_episode_curves(summary_rows, first_action_rows, output_dir)
    print(f"saved results to {output_dir}")


if __name__ == "__main__":
    main()
