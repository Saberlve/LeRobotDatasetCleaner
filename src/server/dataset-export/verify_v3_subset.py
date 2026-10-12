#!/usr/bin/env python3
"""Verify a whole-episode export against its source, including file hashes."""

import argparse
import hashlib
import json
import math
from pathlib import Path

import pyarrow.compute as pc
import pyarrow.parquet as pq
from native_tactile import validate_native_episode
from export_v3_subset import get_video_feature_keys, load_episode_metadata
from preserve_episode_assets import (
    EPISODE_COMPONENT,
    EXPORTED_SIDECAR_DIRS,
    SIDECAR_DIRS,
    aggregate_episode_stats,
    contained_path,
    remap_json,
    remap_path,
    remap_reference_table,
    update_index_stats,
)


def equal_values(left, right):
    if isinstance(left, dict) and isinstance(right, dict):
        return left.keys() == right.keys() and all(equal_values(left[k], right[k]) for k in left)
    if isinstance(left, list) and isinstance(right, list):
        return len(left) == len(right) and all(equal_values(a, b) for a, b in zip(left, right))
    if isinstance(left, float) and isinstance(right, float) and math.isnan(left) and math.isnan(right):
        return True
    return left == right


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(path):
    hasher = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b""):
            hasher.update(block)
    return hasher.digest()


def verify_subset(source_dir, output_dir):
    source_dir = Path(source_dir).resolve()
    output_dir = Path(output_dir).resolve()
    require(not (output_dir / "raw_episodes").exists(), "raw episode checkpoints must not be exported")
    mapping = json.loads((output_dir / "meta/episode_id_map.json").read_text())
    episode_map = {int(k): v for k, v in mapping["old_to_new"].items()}
    require(Path(mapping["source_path"]).resolve() == source_dir, "wrong source dataset")
    source_rows, _ = load_episode_metadata(source_dir)
    output_rows, _ = load_episode_metadata(output_dir)
    source_info = json.loads((source_dir / "meta/info.json").read_text())
    output_info = json.loads((output_dir / "meta/info.json").read_text())
    require(
        sorted(episode_map.values()) == list(range(len(episode_map))),
        "invalid episode ID mapping",
    )
    require(set(output_rows) == set(episode_map.values()), "unexpected/missing episodes")
    require(output_info["total_episodes"] == len(episode_map), "wrong episode count")
    require(output_info["features"] == source_info["features"], "feature metadata changed")
    require(output_info["fps"] == source_info["fps"], "fps changed")
    checked_files = set()
    expected_assets = set()
    source_cache = {}
    global_start = 0
    native_video_cache = {}
    for old_id, new_id in sorted(episode_map.items(), key=lambda item: item[1]):
        old_row, new_row = source_rows[old_id], output_rows[new_id]
        template = source_info["data_path"]
        relative = template.format(
            chunk_index=old_row["data/chunk_index"],
            file_index=old_row["data/file_index"],
        )
        if relative not in source_cache:
            source_cache[relative] = pq.read_table(contained_path(source_dir, relative))
        source = source_cache[relative]
        source = source.filter(pc.equal(source["episode_index"], old_id)).sort_by("frame_index")
        relative_out = output_info["data_path"].format(
            chunk_index=new_row["data/chunk_index"],
            file_index=new_row["data/file_index"],
        )
        target = pq.read_table(contained_path(output_dir, relative_out))
        validate_native_episode(output_dir, output_info, new_row, target, native_video_cache)
        require(
            source.num_rows == target.num_rows == old_row["length"] == new_row["length"],
            f"frame loss: episode {old_id}",
        )
        require(source.column_names == target.column_names, "data columns changed")
        for key in source.column_names:
            if key in ("episode_index", "index"):
                continue
            require(
                source.schema.field(key).type == target.schema.field(key).type,
                f"data type changed: {key}",
            )
            require(
                equal_values(source[key].to_pylist(), target[key].to_pylist()),
                f"data changed: episode {old_id}, {key}",
            )
        require(
            target["episode_index"].to_pylist() == [new_id] * target.num_rows,
            "incorrect episode indices",
        )
        require(
            target["index"].to_pylist() == list(range(global_start, global_start + target.num_rows)),
            "incorrect global indices",
        )
        require(
            new_row["dataset_from_index"] == global_start
            and new_row["dataset_to_index"] == global_start + target.num_rows,
            "incorrect episode bounds",
        )
        expected_row = dict(old_row)
        update_index_stats(expected_row, old_row, new_id, global_start)
        for key, value in expected_row.items():
            if key in (
                "episode_index",
                "data/chunk_index",
                "data/file_index",
                "dataset_from_index",
                "dataset_to_index",
                "meta/episodes/chunk_index",
                "meta/episodes/file_index",
            ):
                continue
            require(
                equal_values(value, new_row[key]),
                f"episode metadata changed: {old_id}, {key}",
            )
        global_start += target.num_rows
        for key in get_video_feature_keys(source_info):
            prefix = f"videos/{key}/"
            for suffix in (
                "chunk_index",
                "file_index",
                "from_timestamp",
                "to_timestamp",
            ):
                require(
                    old_row[prefix + suffix] == new_row[prefix + suffix],
                    f"video alignment changed: {key}",
                )
            relative = source_info["video_path"].format(
                video_key=key,
                chunk_index=old_row[prefix + "chunk_index"],
                file_index=old_row[prefix + "file_index"],
            )
            if relative not in checked_files:
                require(
                    digest(contained_path(source_dir, relative)) == digest(contained_path(output_dir, relative)),
                    f"video bytes changed: {relative}",
                )
                checked_files.add(relative)
        print(f"Verified episode {old_id} -> {new_id}", flush=True)
    require(output_info["total_frames"] == global_start, "wrong total_frames")

    for name in (*EXPORTED_SIDECAR_DIRS, "images", "runtime"):
        root = source_dir / name
        for path in sorted(root.rglob("*")):
            if not path.is_file():
                continue
            relative = path.relative_to(source_dir)
            if name != "runtime":
                ids = [int(m[2]) for p in relative.parts if (m := EPISODE_COMPONENT.fullmatch(p))]
                if any(p.startswith(".") for p in relative.parts) or not ids or any(ep not in episode_map for ep in ids):
                    continue
            target_rel = relative.as_posix() if name == "runtime" else remap_path(relative.as_posix(), episode_map)
            expected_assets.add(target_rel)
            target = contained_path(output_dir, target_rel)
            contained_path(source_dir, relative)
            require(target.is_file(), f"missing asset: {target_rel}")
            if name == "tactile_streams" and path.suffix == ".parquet":
                original = pq.read_table(path)
                expected = remap_reference_table(original, episode_map)
                actual = pq.read_table(target)
                require(
                    expected.schema.equals(actual.schema),
                    f"sidecar schema changed: {relative}",
                )
                require(
                    equal_values(expected.to_pydict(), actual.to_pydict()),
                    f"sidecar values changed: {relative}",
                )
                if name == "tactile_streams":
                    for column in ("frame_path", "motion_path", "mesh_path", "video_path"):
                        if column in actual.column_names:
                            for reference in actual[column].to_pylist():
                                if reference is not None:
                                    require(
                                        contained_path(output_dir, reference).is_file(),
                                        f"broken tactile reference: {reference}",
                                    )
            elif (
                name != "runtime"
                and path.suffix == ".json"
                and (
                    path.name in ("manifest.json", "video.json", "mesh3dflow.json") or path.name.endswith("_commit.json")
                )
            ):
                require(
                    equal_values(
                        remap_json(json.loads(path.read_text()), episode_map),
                        json.loads(target.read_text()),
                    ),
                    f"identity/path mapping changed: {relative}",
                )
            else:
                require(digest(path) == digest(target), f"asset bytes changed: {relative}")
            checked_files.add(target_rel)
    actual_assets = {
        p.relative_to(output_dir).as_posix()
        for name in (*SIDECAR_DIRS, "images", "runtime")
        for p in (output_dir / name).rglob("*")
        if p.is_file()
    }
    require(actual_assets == expected_assets, "unexpected episode assets in output")
    stats = aggregate_episode_stats(list(output_rows.values()))
    if stats:
        require(
            equal_values(stats, json.loads((output_dir / "meta/stats.json").read_text())),
            "aggregate statistics mismatch",
        )
    report = {
        "verified": True,
        "episodes": len(episode_map),
        "frames": global_start,
        "checked_asset_files": len(checked_files),
    }
    print(json.dumps(report), flush=True)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    verify_subset(args.source, args.output)
