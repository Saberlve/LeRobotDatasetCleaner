"""Preserve xArm recording sidecars when whole episodes are exported.

Only episode identities and relative file references change. Clock values,
action/tactile indices, calibration files, PNGs and motion arrays do not.
Raw episode checkpoints are recording recovery inputs and are not exported.
"""

import json
import re
import shutil
from pathlib import Path

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq

EXPORTED_SIDECAR_DIRS = ("timestamps", "tactile_streams")
# Source-side clipping guards still account for raw recording checkpoints.
SIDECAR_DIRS = (*EXPORTED_SIDECAR_DIRS, "raw_episodes")
EPISODE_COMPONENT = re.compile(r"^episode([_-])(\d{6})(.*)$")


def contained_path(root, relative):
    path = root / relative
    if not path.resolve().is_relative_to(root.resolve()):
        raise ValueError(f"path escapes dataset root: {relative}")
    return path


def file_stamp(path):
    stat = path.stat()
    return stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns


def copy_file(source, target):
    """Independent files, never hardlinks; reject changes during copying."""
    before = file_stamp(source)
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)
    if file_stamp(source) != before:
        raise ValueError(f"source changed during export; stop recording first: {source}")


def remap_path(value, episode_map):
    if not isinstance(value, str):
        return value
    parts = value.split("/")
    for index, part in enumerate(parts):
        match = EPISODE_COMPONENT.fullmatch(part)
        if match and int(match[2]) in episode_map:
            parts[index] = f"episode{match[1]}{episode_map[int(match[2])]:06d}{match[3]}"
    return "/".join(parts)


def remap_json(value, episode_map, key=None):
    if isinstance(value, dict):
        return {k: remap_json(v, episode_map, k) for k, v in value.items()}
    if isinstance(value, list):
        return [remap_json(v, episode_map, key) for v in value]
    if key == "episode_index" and isinstance(value, int):
        return episode_map.get(value, value)
    return remap_path(value, episode_map)


def remap_reference_table(table, episode_map):
    """Rewrite reference strings and episode IDs, preserving every other column."""
    for index, field in enumerate(table.schema):
        column = table.column(index)
        is_reference = field.name.endswith("_path") or field.name.startswith("observation.images.")
        if is_reference and (pa.types.is_string(field.type) or pa.types.is_large_string(field.type)):
            values = [remap_path(v, episode_map) for v in column.to_pylist()]
            if values != column.to_pylist():
                table = table.set_column(index, field, pa.array(values, type=field.type))
        elif field.name == "episode_index":
            values = [episode_map.get(v, v) for v in column.to_pylist()]
            table = table.set_column(index, field, pa.array(values, type=field.type))
    return table


def copy_episode_assets(source_dir, target_dir, episode_map):
    for name in (*EXPORTED_SIDECAR_DIRS, "images"):
        root = source_dir / name
        if not root.exists():
            continue
        for path in sorted(root.rglob("*")):
            if not path.is_file():
                continue
            relative = path.relative_to(source_dir)
            matches = [EPISODE_COMPONENT.fullmatch(p) for p in relative.parts]
            ids = [int(m[2]) for m in matches if m]
            # Exclude staging files and discarded episodes.
            if any(p.startswith(".") for p in relative.parts) or not ids:
                continue
            if any(ep not in episode_map for ep in ids):
                continue
            contained_path(source_dir, relative)
            target = contained_path(target_dir, remap_path(relative.as_posix(), episode_map))
            if name == "tactile_streams" and path.suffix == ".parquet":
                before = file_stamp(path)
                table = pq.read_table(path)
                if name == "tactile_streams":
                    for column in ("frame_path", "motion_path", "mesh_path", "video_path"):
                        if column in table.column_names:
                            for reference in table[column].to_pylist():
                                if reference is not None and not contained_path(source_dir, reference).is_file():
                                    raise ValueError(f"missing tactile sample asset: {reference}")
                updated = remap_reference_table(table, episode_map)
                if table.equals(updated):
                    copy_file(path, target)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    pq.write_table(updated, target)
                if file_stamp(path) != before:
                    raise ValueError(f"source changed during export: {path}")
            elif path.suffix == ".json" and (
                path.name in ("manifest.json", "video.json", "mesh3dflow.json") or path.name.endswith("_commit.json")
            ):
                original = json.loads(path.read_text())
                if path.name.endswith("_commit.json"):
                    for reference in original.get("timestamp_files", []):
                        if not contained_path(source_dir, Path("timestamps") / reference).is_file():
                            raise ValueError(f"missing committed timestamp file: {reference}")
                    for stream in original.get("tactile_streams", []):
                        relative_samples = (
                            Path("tactile_streams")
                            / stream
                            / f"episode_{original['episode_index']:06d}"
                            / "samples.parquet"
                        )
                        if not contained_path(source_dir, relative_samples).is_file():
                            raise ValueError(f"missing committed tactile samples: {relative_samples}")
                updated = remap_json(original, episode_map)
                if original == updated:
                    copy_file(path, target)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_text(json.dumps(updated, indent=2, ensure_ascii=False) + "\n")
            else:
                copy_file(path, target)

    # Runtime snapshots are historical, potentially shared by several episodes.
    # Preserve their identities and bytes; manifests reference these session names.
    runtime = source_dir / "runtime"
    if runtime.exists():
        for path in sorted(runtime.rglob("*")):
            if path.is_file():
                relative = path.relative_to(source_dir)
                copy_file(contained_path(source_dir, relative), target_dir / relative)


def update_index_stats(row, source_row, new_id, global_start):
    for feature, delta in (
        ("episode_index", new_id - source_row["episode_index"]),
        ("index", global_start - source_row["dataset_from_index"]),
    ):
        prefix = f"stats/{feature}/"
        for key in list(row):
            stat = key.removeprefix(prefix)
            if key.startswith(prefix) and (stat in ("min", "max", "mean") or stat.startswith("q")):
                row[key] = (np.asarray(row[key]) + delta).tolist()


def aggregate_episode_stats(rows):
    """LeRobot pooled moments and count-weighted quantile aggregation."""
    features = sorted({k[6:].rsplit("/", 1)[0] for r in rows for k in r if k.startswith("stats/")})
    result = {}
    for feature in features:
        prefix = f"stats/{feature}/"
        stats = [{k[len(prefix) :]: np.asarray(v) for k, v in row.items() if k.startswith(prefix)} for row in rows]
        stats = [s for s in stats if s]
        required = {"min", "max", "mean", "std", "count"}
        if any(not required.issubset(s) for s in stats):
            raise ValueError(f"incomplete episode statistics for {feature}")
        means = np.stack([s["mean"] for s in stats])
        counts = np.stack([s["count"] for s in stats])
        total = counts.sum(axis=0)
        if np.any(total <= 0):
            raise ValueError(f"invalid statistic count for {feature}")
        weights = counts
        while weights.ndim < means.ndim:
            weights = np.expand_dims(weights, -1)
        mean = (means * weights).sum(axis=0) / total
        variance = ((np.stack([s["std"] ** 2 for s in stats]) + (means - mean) ** 2) * weights).sum(axis=0) / total
        aggregated = {
            "min": np.min(np.stack([s["min"] for s in stats]), axis=0),
            "max": np.max(np.stack([s["max"] for s in stats]), axis=0),
            "mean": mean,
            "std": np.sqrt(variance),
            "count": total,
        }
        for key in stats[0]:
            if key.startswith("q") and key[1:].isdigit() and all(key in s for s in stats):
                aggregated[key] = (np.stack([s[key] for s in stats]) * weights).sum(axis=0) / total
        result[feature] = {k: v.tolist() for k, v in aggregated.items()}
    return result
