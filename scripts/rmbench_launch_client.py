#!/usr/bin/env python3
from __future__ import annotations

import argparse
import importlib
import json
import os
import random
import subprocess
import sys
import time
import traceback
from pathlib import Path
from typing import Any

import numpy as np
import yaml

try:
    from PIL import Image
except ImportError as exc:  # pragma: no cover - depends on RMBench env
    raise SystemExit(f"Pillow is required in the RMBench conda env: {exc}")

CAMERA_KEYS = ("third_view", "head_camera", "left_camera", "right_camera")
ACTION_LABELS = ("x", "y", "z", "roll", "pitch", "yaw", "gripper")


class RuntimeWriter:
    def __init__(self, runtime_dir: Path, run_id: str):
        self.runtime_dir = runtime_dir
        self.run_id = run_id
        self.frames_dir = runtime_dir / "frames"
        self.status_path = runtime_dir / "status.json"
        self.actions_path = runtime_dir / "actions.json"
        self.actions: list[dict[str, Any]] = self._load_actions()
        self.frames_dir.mkdir(parents=True, exist_ok=True)

    def _load_actions(self) -> list[dict[str, Any]]:
        try:
            loaded = json.loads(self.actions_path.read_text(encoding="utf-8"))
        except Exception:
            return []
        return loaded if isinstance(loaded, list) else []

    def _read_status(self) -> dict[str, Any]:
        return json.loads(self.status_path.read_text(encoding="utf-8"))

    def _write_text_atomic(self, path: Path, content: str) -> None:
        temp_path = path.with_name(f".{path.name}.tmp")
        temp_path.write_text(content, encoding="utf-8")
        os.replace(temp_path, path)

    def _write_json_atomic(self, path: Path, payload: Any) -> None:
        self._write_text_atomic(
            path,
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        )

    def _frame_path(self, camera_key: str) -> Path:
        return self.frames_dir / f"{camera_key}.jpg"

    def _normalize_image(self, image: Any) -> np.ndarray | None:
        if image is None:
            return None
        array = np.asarray(image)
        if array.ndim == 2:
            array = np.stack([array] * 3, axis=-1)
        if array.ndim != 3:
            return None
        if array.shape[-1] == 4:
            array = array[:, :, :3]
        if array.shape[-1] != 3:
            return None
        if array.dtype != np.uint8:
            if np.issubdtype(array.dtype, np.floating) and np.nanmax(array) <= 1.0:
                array = array * 255.0
            array = np.clip(array, 0, 255).astype(np.uint8)
        return np.ascontiguousarray(array)

    def _write_frame(self, camera_key: str, image: Any) -> str | None:
        normalized = self._normalize_image(image)
        if normalized is None:
            return None
        frame_path = self._frame_path(camera_key)
        temp_path = frame_path.with_name(f".{frame_path.name}.tmp")
        Image.fromarray(normalized).save(temp_path, format="JPEG", quality=85)
        os.replace(temp_path, frame_path)
        return str(frame_path)

    def _extract_frames(self, observation: dict[str, Any]) -> dict[str, str | None]:
        cameras = observation.get("observation", {}) if isinstance(observation, dict) else {}
        latest_paths = {
            "third_view": self._write_frame("third_view", observation.get("third_view_rgb")),
            "head_camera": self._write_frame(
                "head_camera",
                cameras.get("head_camera", {}).get("rgb") if isinstance(cameras, dict) else None,
            ),
            "left_camera": self._write_frame(
                "left_camera",
                cameras.get("left_camera", {}).get("rgb") if isinstance(cameras, dict) else None,
            ),
            "right_camera": self._write_frame(
                "right_camera",
                cameras.get("right_camera", {}).get("rgb") if isinstance(cameras, dict) else None,
            ),
        }
        status = self._read_status()
        previous = (
            status.get("latestFramePaths")
            if isinstance(status.get("latestFramePaths"), dict)
            else {}
        )
        return {
            camera_key: latest_paths[camera_key]
            or previous.get(camera_key)
            or str(self._frame_path(camera_key))
            for camera_key in CAMERA_KEYS
        }

    def _serialize_action(self, action: Any, step: int) -> dict[str, Any]:
        values = np.asarray(action, dtype=np.float64).reshape(-1)
        point: dict[str, Any] = {
            "step": int(step),
            "timestamp": float(time.time()),
        }
        for index, value in enumerate(values):
            key = ACTION_LABELS[index] if index < len(ACTION_LABELS) else f"action_{index}"
            point[key] = float(value)
        return point

    def update_status(
        self,
        *,
        run_status: str,
        step: int,
        prompt: str | None = None,
        latest_frame_paths: dict[str, str | None] | None = None,
        error_message: str | None = None,
    ) -> None:
        status = self._read_status()
        status["status"] = run_status
        status["step"] = int(step)
        status["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        status["actionCount"] = len(self.actions)
        status["pid"] = os.getpid()
        if prompt is not None:
            status["prompt"] = prompt
        if latest_frame_paths is not None:
            status["latestFramePaths"] = latest_frame_paths
        if error_message is not None or run_status in {"failed", "stopped", "succeeded"}:
            status["errorMessage"] = error_message
        self._write_json_atomic(self.status_path, status)

    def record_step(
        self,
        task_env: Any,
        prompt: str,
        observation: dict[str, Any],
        action: Any,
    ) -> None:
        self.actions.append(self._serialize_action(action, task_env.take_action_cnt))
        self._write_json_atomic(self.actions_path, self.actions)
        latest_frame_paths = self._extract_frames(observation)
        self.update_status(
            run_status="running",
            step=task_env.take_action_cnt,
            prompt=prompt,
            latest_frame_paths=latest_frame_paths,
            error_message=None,
        )

    def publish_running(
        self,
        task_env: Any,
        prompt: str,
        observation: dict[str, Any] | None = None,
    ) -> None:
        latest_frame_paths = self._extract_frames(observation) if observation else None
        self.update_status(
            run_status="running",
            step=getattr(task_env, "take_action_cnt", 0),
            prompt=prompt,
            latest_frame_paths=latest_frame_paths,
            error_message=None,
        )

    def finalize(
        self,
        task_env: Any,
        prompt: str,
        final_status: str,
        observation: dict[str, Any] | None = None,
        error_message: str | None = None,
    ) -> None:
        latest_frame_paths = self._extract_frames(observation) if observation else None
        self.update_status(
            run_status=final_status,
            step=getattr(task_env, "take_action_cnt", 0),
            prompt=prompt,
            latest_frame_paths=latest_frame_paths,
            error_message=error_message,
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--task-name", required=True)
    parser.add_argument("--task-config", default="demo_clean")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--runtime-dir", required=True)
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--policy-name", default="pi05_mem")
    parser.add_argument("--policy-config-name", default="pi05_rmbench_memory_lora_pytorch")
    parser.add_argument("--checkpoint-dir", required=True)
    parser.add_argument("--pi0-step", type=int, default=30)
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


def prepare_rmbench_root(openpi_root: str) -> Path:
    rmbench_root = Path(openpi_root) / "third_party" / "RMBench"
    for extra in (
        rmbench_root,
        rmbench_root / "policy",
        rmbench_root / "description" / "utils",
        rmbench_root / "script",
    ):
        sys.path.insert(0, str(extra))
    os.chdir(rmbench_root)
    return rmbench_root


def build_user_args(rmbench_root: Path, args: argparse.Namespace) -> dict[str, Any]:
    config_path = rmbench_root / "policy" / args.policy_name / "deploy_policy.yml"
    config = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    config.update(
        {
            "port": args.port,
            "policy_name": args.policy_name,
            "policy_config_name": args.policy_config_name,
            "checkpoint_dir": args.checkpoint_dir,
            "pi0_step": args.pi0_step,
            "task_name": args.task_name,
            "task_config": args.task_config,
            "ckpt_setting": Path(args.checkpoint_dir).name,
            "seed": args.seed,
            "test_num": 1,
        }
    )
    return config


def create_launch_eval_policy(client_mod: Any, runtime: RuntimeWriter):
    def run_single_episode(
        task_name: str,
        task_env: Any,
        args: dict[str, Any],
        model: Any,
        st_seed: int,
        test_num: int = 100,
        video_size: str | None = None,
        instruction_type: str | None = None,
        policy_conda_env: str | None = None,
    ) -> tuple[int, int]:
        del test_num
        print(f"[launch] task={task_name} seed={st_seed}", flush=True)
        eval_func = client_mod.eval_function_decorator(
            args["policy_name"],
            "eval",
            conda_env=policy_conda_env,
        )
        # Mirror the state that RMBench's stock eval loop initializes on TASK_ENV.
        # Some env helpers and video writers assume these counters already exist.
        if not hasattr(task_env, "suc"):
            task_env.suc = 0
        if not hasattr(task_env, "test_num"):
            task_env.test_num = 0
        # RMBench populates rollout limits during setup_demo only when eval mode is on.
        args["eval_mode"] = True

        now_seed = st_seed
        episode_info: dict[str, Any] | None = None
        while episode_info is None:
            render_freq = args["render_freq"]
            args["render_freq"] = 0
            try:
                task_env.setup_demo(now_ep_num=0, seed=now_seed, is_test=True, **args)
                candidate_info = task_env.play_once()
                expert_check_passed = task_env.plan_success and task_env.check_success()
                task_env.close_env()
                if expert_check_passed:
                    episode_info = candidate_info
                else:
                    now_seed += 1
            except client_mod.UnStableError:
                task_env.close_env()
                now_seed += 1
            except Exception:
                traceback.print_exc()
                task_env.close_env()
                now_seed += 1
            finally:
                args["render_freq"] = render_freq

        task_env.setup_demo(now_ep_num=0, seed=now_seed, is_test=True, **args)
        episode_info_list = [episode_info.get("info", {})]
        descriptions = client_mod.generate_episode_descriptions(task_name, episode_info_list, 1)
        instruction_pool = descriptions[0][
            instruction_type or args.get("instruction_type", "unseen")
        ]
        instruction = random.choice(instruction_pool)
        task_env.set_instruction(instruction=instruction)

        if task_env.eval_video_path is not None:
            ffmpeg = subprocess.Popen(
                [
                    "ffmpeg",
                    "-y",
                    "-loglevel",
                    "error",
                    "-f",
                    "rawvideo",
                    "-pixel_format",
                    "rgb24",
                    "-video_size",
                    str(video_size),
                    "-framerate",
                    str(args.get("eval_video_fps", 25)),
                    "-i",
                    "-",
                    "-pix_fmt",
                    "yuv420p",
                    "-vcodec",
                    "libx264",
                    "-crf",
                    "23",
                    f"{task_env.eval_video_path}/episode{task_env.test_num}.mp4",
                ],
                stdin=subprocess.PIPE,
            )
            task_env._set_eval_video_ffmpeg(ffmpeg)
            task_env._maybe_write_eval_video_frame(force=True)

        initial_observation = task_env.get_obs()
        runtime.publish_running(task_env, instruction, initial_observation)

        original_take_action = task_env.take_action

        def wrapped_take_action(action: Any, action_type: str = "qpos"):
            result = original_take_action(action, action_type)
            observation_after = task_env.get_obs()
            runtime.record_step(task_env, instruction, observation_after, action)
            return result

        task_env.take_action = wrapped_take_action

        success = False
        try:
            model.call(func_name="reset_model")
            while task_env.take_action_cnt < task_env.step_lim:
                observation = task_env.get_obs()
                eval_func(task_env, model, observation)
                if task_env.eval_success:
                    success = True
                    break
                if getattr(task_env, "press_cnt", 0) >= 1:
                    break
        finally:
            task_env.take_action = original_take_action
            final_observation = task_env.get_obs()
            runtime.finalize(
                task_env,
                instruction,
                "succeeded" if success else "failed",
                final_observation,
                None,
            )
            if task_env.eval_video_path is not None:
                task_env._del_eval_video_ffmpeg()
            task_env.close_env(clear_cache=False)
            if getattr(task_env, "render_freq", 0):
                task_env.viewer.close()

        print(
            f"[launch] completed status={'success' if success else 'failed'} step={task_env.take_action_cnt}",
            flush=True,
        )
        return now_seed + 1, 1 if success else 0

    return run_single_episode


def main() -> int:
    args = parse_args()
    runtime_dir = Path(args.runtime_dir)
    runtime_dir.mkdir(parents=True, exist_ok=True)
    runtime = RuntimeWriter(runtime_dir, args.run_id)

    openpi_root = os.environ.get("OPENPI_CODE_ROOT", "/VLA/openpi")
    rmbench_root = prepare_rmbench_root(openpi_root)

    from test_render import Sapien_TEST

    Sapien_TEST()
    client_mod = importlib.import_module("eval_policy_client")
    client_mod.eval_policy = create_launch_eval_policy(client_mod, runtime)
    user_args = build_user_args(rmbench_root, args)

    try:
        client_mod.main(user_args)
        return 0
    except Exception as exc:
        traceback.print_exc()
        try:
            runtime.finalize(
                task_env=type("TaskState", (), {"take_action_cnt": 0})(),
                prompt="",
                final_status="failed",
                observation=None,
                error_message=str(exc),
            )
        except Exception:
            traceback.print_exc()
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
