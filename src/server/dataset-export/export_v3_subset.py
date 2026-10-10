#!/usr/bin/env python3
"""Export a subset of episodes from a local LeRobot v3.0 dataset.

Whole-episode exports copy shared video shards unchanged and preserve their
original offsets. Data gets continuous episode/global indices; all observation
values, frame indices and timestamps remain unchanged. Recording sidecars are
copied with only identity/path references remapped. Frame clipping is refused
for datasets with recording sidecars because their clock mappings must survive.

usage: export_v3_subset.py SOURCE_DIR OUTPUT_DIR JOB_JSON
JOB_JSON: {"kept_episode_ids": [int, ...],
           "removed_frame_intervals": {"<episode_id>": [{"start": int, "end": int}, ...]}}
"""

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq
from clip_stats import recompute_episode_stats
from native_tactile import validate_native_episode
from preserve_episode_assets import (
    SIDECAR_DIRS,
    aggregate_episode_stats,
    contained_path,
    copy_episode_assets,
    copy_file,
    file_stamp,
    update_index_stats,
)


def normalize_huggingface_types(value):
    if isinstance(value, dict):
        return {
            key: ("Sequence" if key == "_type" and child == "List" else normalize_huggingface_types(child))
            for key, child in value.items()
        }
    if isinstance(value, list):
        return [normalize_huggingface_types(child) for child in value]
    return value


def normalize_schema_metadata(metadata):
    if not metadata:
        return metadata

    next_metadata = dict(metadata)
    huggingface_metadata = next_metadata.get(b"huggingface")
    if not huggingface_metadata:
        return next_metadata

    try:
        parsed = json.loads(huggingface_metadata.decode("utf-8"))
    except json.JSONDecodeError:
        return next_metadata

    next_metadata[b"huggingface"] = json.dumps(normalize_huggingface_types(parsed)).encode("utf-8")
    return next_metadata


def replace_column(table, column_name, values):
    if column_name not in table.column_names:
        return table

    column_index = table.column_names.index(column_name)
    field = table.schema.field(column_index)
    array = pa.array(values, type=field.type)
    return table.set_column(column_index, field, array)


def format_path(template, **variables):
    return template.format(**variables)


def normalize_clips(intervals, length):
    normalized = sorted((int(interval["start"]), int(interval["end"])) for interval in intervals)
    previous_end = -1
    for start, end in normalized:
        if start < 0 or end < start or end >= length or start <= previous_end:
            raise ValueError("invalid normalized removed frame intervals")
        previous_end = end
    return normalized


def probe_video_frames(video_path):
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-count_frames",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=nb_read_frames",
            "-of",
            "default=nokey=1:noprint_wrappers=1",
            str(video_path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    count = int(result.stdout.strip())
    if count < 1:
        raise ValueError(f"ffprobe could not count video frames: {video_path}")
    return count


def extract_video_segment(source_path, output_path, from_frame, kept_offsets, expected_frames, fps):
    first = from_frame + kept_offsets[0]
    last = from_frame + kept_offsets[-1]
    conditions = [f"gte(n\\,{first})", f"lte(n\\,{last})"]
    removed = []
    for start, end in removed_intervals_from_offsets(kept_offsets):
        removed.append(f"between(n\\,{from_frame + start}\\,{from_frame + end})")
    if removed:
        conditions.append(f"not({'+'.join(removed)})")
    select = f"select='{'*'.join(conditions)}',setpts=N/FRAME_RATE/TB"

    output_path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-i",
            str(source_path),
            "-vf",
            select,
            "-an",
            "-r",
            str(fps),
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            str(output_path),
        ],
        check=True,
    )

    actual = probe_video_frames(output_path)
    if actual != expected_frames:
        raise ValueError(f"Rewritten video frame mismatch for {output_path}: expected {expected_frames}, got {actual}")


def removed_intervals_from_offsets(kept_offsets):
    """Return the removed [start, end] gaps inside the kept offsets' span."""
    removed = []
    cursor = kept_offsets[0]
    for offset in kept_offsets[1:]:
        if offset > cursor + 1:
            removed.append((cursor + 1, offset - 1))
        cursor = offset
    return removed


def compute_kept_offsets(length, clips):
    keep = [True] * length
    for start, end in clips:
        for frame in range(start, end + 1):
            keep[frame] = False
    offsets = [frame for frame in range(length) if keep[frame]]
    if not offsets:
        raise ValueError("a clip cannot remove every frame of an episode")
    return offsets


def load_episode_metadata(source_dir):
    episodes_dir = source_dir / "meta" / "episodes"
    rows = {}
    schema = None
    for parquet_path in sorted(episodes_dir.glob("chunk-*/file-*.parquet")):
        table = pq.read_table(contained_path(source_dir, parquet_path.relative_to(source_dir)))
        if schema is None:
            schema = table.schema
        for row in table.to_pylist():
            if row["episode_index"] in rows:
                raise ValueError(f"duplicate episode metadata: {row['episode_index']}")
            rows[row["episode_index"]] = row
    if schema is None:
        raise ValueError(f"no episode metadata found under {episodes_dir}")
    return rows, schema


def get_video_feature_keys(info):
    return [
        key
        for key, feature in (info.get("features") or {}).items()
        if isinstance(feature, dict) and feature.get("dtype") == "video"
    ]


def should_copy_meta_file(relative_path):
    normalized = relative_path.as_posix()
    if normalized in ("info.json", "episode_id_map.json") or normalized.startswith("episodes/"):
        return False
    base_name = relative_path.name
    return not base_name.startswith(("stats.", "stats_"))


def source_snapshot(source_dir):
    return {
        str(p.relative_to(source_dir)): file_stamp(p)
        for name in (
            "meta",
            "data",
            "videos",
            "timestamps",
            "raw_episodes",
            "tactile_streams",
            "images",
            "runtime",
        )
        for p in (source_dir / name).rglob("*")
        if p.is_file()
    }


def main():
    if len(sys.argv) != 4:
        raise SystemExit("usage: export_v3_subset.py SOURCE_DIR OUTPUT_DIR JOB_JSON")

    source_dir = Path(sys.argv[1]).resolve()
    output_dir = Path(sys.argv[2]).resolve()
    job = json.loads(sys.argv[3])
    kept_episode_ids = [int(value) for value in job["kept_episode_ids"]]
    raw_clips = job.get("removed_frame_intervals") or {}

    if not kept_episode_ids:
        raise ValueError("kept_episode_ids must not be empty")
    if len(set(kept_episode_ids)) != len(kept_episode_ids):
        raise ValueError("kept_episode_ids must be unique")
    if source_dir == output_dir or source_dir in output_dir.parents or output_dir in source_dir.parents:
        raise ValueError("source and output directories must be separate, non-nested directories")
    if output_dir.exists():
        raise ValueError(f"output directory already exists: {output_dir}")

    # Capture before reading any metadata so concurrent replacements cannot
    # turn the initial reads and subsequent copies into a mixed snapshot.
    snapshot = source_snapshot(source_dir)
    info = json.loads((source_dir / "meta" / "info.json").read_text())
    if job.get("source_total_episodes", info["total_episodes"]) != info["total_episodes"]:
        raise ValueError("source episode count changed; stop recording and refresh the selection")
    fps = float(info["fps"])
    if fps <= 0:
        raise ValueError("dataset info must contain a positive fps")
    chunks_size = int(info.get("chunks_size") or 1000)
    data_template = info["data_path"]
    video_template = info.get("video_path")
    video_keys = get_video_feature_keys(info) if video_template else []
    episodes, episodes_schema = load_episode_metadata(source_dir)
    if set(episodes) != set(range(int(info["total_episodes"]))):
        raise ValueError("episode metadata disagrees with info.json; stop recording/postprocessing first")
    if sum(int(row["length"]) for row in episodes.values()) != int(info["total_frames"]):
        raise ValueError("frame count disagrees with info.json; stop recording/postprocessing first")
    if any(ep not in episodes for ep in kept_episode_ids):
        raise ValueError("kept_episode_ids contains an unknown episode")
    has_clips = any(raw_clips.get(str(ep)) for ep in kept_episode_ids)
    if has_clips and any((source_dir / name).exists() for name in SIDECAR_DIRS):
        raise ValueError("带时间戳/触觉/原始记录的数据集仅支持整段 episode 删除；请清除保留 episode 的帧剪辑草稿。")
    if json.loads((source_dir / "meta/info.json").read_text()) != info:
        raise ValueError("source changed during export; stop recording first")

    data_cache = {}
    new_meta_rows = []
    global_index_start = 0
    total_videos = 0
    copied_videos = set()
    native_video_cache = {}

    output_dir.parent.mkdir(parents=True, exist_ok=True)
    temp_dir = Path(tempfile.mkdtemp(prefix=f"{output_dir.name}.tmp-", dir=str(output_dir.parent)))
    try:
        for new_index, source_id in enumerate(kept_episode_ids):
            if source_id not in episodes:
                raise ValueError(f"missing episode metadata for {source_id}")
            source_row = episodes[source_id]
            length = int(source_row["length"])
            clips = normalize_clips(raw_clips.get(str(source_id), []), length)
            kept_offsets = compute_kept_offsets(length, clips)
            retained = len(kept_offsets)

            chunk_index = new_index // chunks_size
            file_index = new_index % chunks_size

            # ── data parquet ──────────────────────────────────────────
            source_data_rel = format_path(
                data_template,
                chunk_index=int(source_row["data/chunk_index"]),
                file_index=int(source_row["data/file_index"]),
            )
            if source_data_rel not in data_cache:
                data_cache[source_data_rel] = pq.read_table(contained_path(source_dir, source_data_rel))
            table = data_cache[source_data_rel]
            mask = pc.equal(table.column("episode_index"), source_id)
            episode_table = table.filter(mask)
            if episode_table.num_rows != length:
                raise ValueError(f"episode {source_id}: expected {length} parquet rows, found {episode_table.num_rows}")
            episode_table = episode_table.sort_by("frame_index")
            if episode_table["frame_index"].to_pylist() != list(range(length)):
                raise ValueError(f"episode {source_id}: frame indices are not continuous")
            if episode_table["index"].to_pylist() != list(
                range(
                    int(source_row["dataset_from_index"]),
                    int(source_row["dataset_to_index"]),
                )
            ):
                raise ValueError(f"episode {source_id}: global indices disagree with metadata")
            validate_native_episode(source_dir, info, source_row, episode_table, native_video_cache)
            if clips:
                kept_set = set(kept_offsets)
                keep_mask = pa.array([frame in kept_set for frame in range(length)])
                episode_table = episode_table.filter(keep_mask)
            episode_table = replace_column(episode_table, "episode_index", [new_index] * retained)
            if clips:
                episode_table = replace_column(episode_table, "frame_index", range(retained))
            episode_table = replace_column(
                episode_table,
                "index",
                range(global_index_start, global_index_start + retained),
            )
            if clips:
                episode_table = replace_column(
                    episode_table,
                    "timestamp",
                    [frame / fps for frame in range(retained)],
                )
            episode_table = episode_table.replace_schema_metadata(
                normalize_schema_metadata(episode_table.schema.metadata)
            )
            output_data_path = contained_path(
                temp_dir,
                format_path(
                    data_template,
                    chunk_index=chunk_index,
                    file_index=file_index,
                ),
            )
            output_data_path.parent.mkdir(parents=True, exist_ok=True)
            pq.write_table(episode_table, output_data_path)

            # ── videos ────────────────────────────────────────────────
            video_updates = {}
            output_videos = {}
            for video_key in video_keys:
                prefix = f"videos/{video_key}/"
                source_video_rel = format_path(
                    video_template,
                    video_key=video_key,
                    chunk_index=int(source_row[prefix + "chunk_index"]),
                    file_index=int(source_row[prefix + "file_index"]),
                )
                if not has_clips:
                    # Copy once, including any unused frames from deleted
                    # episodes. Keeping byte-identical shards is the only
                    # way to preserve codec, pixels and exact video PTS.
                    if source_video_rel not in copied_videos:
                        copy_file(
                            contained_path(source_dir, source_video_rel),
                            contained_path(temp_dir, source_video_rel),
                        )
                        copied_videos.add(source_video_rel)
                        total_videos += 1
                    continue
                from_frame = round(float(source_row[prefix + "from_timestamp"]) * fps)
                output_video_path = temp_dir / format_path(
                    video_template,
                    video_key=video_key,
                    chunk_index=chunk_index,
                    file_index=file_index,
                )
                extract_video_segment(
                    contained_path(source_dir, source_video_rel),
                    output_video_path,
                    from_frame,
                    kept_offsets,
                    retained,
                    fps,
                )
                total_videos += 1
                output_videos[video_key] = output_video_path
                video_updates[prefix + "chunk_index"] = chunk_index
                video_updates[prefix + "file_index"] = file_index
                video_updates[prefix + "from_timestamp"] = 0.0
                video_updates[prefix + "to_timestamp"] = retained / fps

            # ── episode metadata row ──────────────────────────────────
            meta_chunk = new_index // chunks_size
            new_row = dict(source_row)
            new_row.update(
                {
                    "episode_index": new_index,
                    "length": retained,
                    "data/chunk_index": chunk_index,
                    "data/file_index": file_index,
                    "dataset_from_index": global_index_start,
                    "dataset_to_index": global_index_start + retained,
                    "meta/episodes/chunk_index": meta_chunk,
                    # the exporter writes a single meta file per chunk
                    "meta/episodes/file_index": 0,
                }
            )
            new_row.update(video_updates)
            if has_clips:
                recompute_episode_stats(new_row, episode_table, output_videos)
            else:
                update_index_stats(new_row, source_row, new_index, global_index_start)
            new_meta_rows.append(new_row)

            global_index_start += retained
            print(
                f"Exported episode {source_id} -> {new_index} ({retained} frames)",
                file=sys.stderr,
            )

        # ── meta/episodes parquet ─────────────────────────────────────
        for meta_chunk_start in range(0, len(new_meta_rows), chunks_size):
            chunk_rows = new_meta_rows[meta_chunk_start : meta_chunk_start + chunks_size]
            meta_path = (
                temp_dir / "meta" / "episodes" / f"chunk-{meta_chunk_start // chunks_size:03d}" / "file-000.parquet"
            )
            meta_path.parent.mkdir(parents=True, exist_ok=True)
            pq.write_table(
                pa.Table.from_pylist(chunk_rows, schema=episodes_schema),
                meta_path,
            )

        # ── other meta files ──────────────────────────────────────────
        source_meta = source_dir / "meta"
        for source_path in sorted(source_meta.rglob("*")):
            if not source_path.is_file():
                continue
            relative = source_path.relative_to(source_meta)
            if not should_copy_meta_file(relative):
                continue
            target_path = temp_dir / "meta" / relative
            target_path.parent.mkdir(parents=True, exist_ok=True)
            copy_file(
                contained_path(source_dir, source_path.relative_to(source_dir)),
                target_path,
            )

        if not has_clips:
            print(
                "Copying original timestamps, tactile streams and raw records...",
                file=sys.stderr,
            )
            episode_map = {ep: index for index, ep in enumerate(kept_episode_ids)}
            copy_episode_assets(source_dir, temp_dir, episode_map)
            (temp_dir / "meta/episode_id_map.json").write_text(
                json.dumps(
                    {
                        "source_path": str(source_dir),
                        "source_total_episodes": int(info["total_episodes"]),
                        "old_to_new": episode_map,
                        "dropped_episode_ids": sorted(set(episodes) - set(kept_episode_ids)),
                        "video_storage": "byte-identical shared shards; unused frames may remain",
                    },
                    indent=2,
                )
                + "\n"
            )

        stats = aggregate_episode_stats(new_meta_rows)
        if stats:
            (temp_dir / "meta/stats.json").write_text(json.dumps(stats, indent=2) + "\n")

        # ── info.json ─────────────────────────────────────────────────
        next_info = dict(info)
        next_info["total_episodes"] = len(new_meta_rows)
        next_info["total_frames"] = global_index_start
        if has_clips:
            for key in video_keys:
                next_info["features"][key].setdefault("info", {})["video.codec"] = "h264"
        if isinstance(info.get("total_videos"), int):
            next_info["total_videos"] = total_videos
        if isinstance(info.get("total_chunks"), int):
            next_info["total_chunks"] = max(1, -(-len(new_meta_rows) // chunks_size))
        if isinstance(info.get("splits"), dict):
            next_info["splits"] = {}
            for split, interval in info["splits"].items():
                start, end = map(int, interval.split(":"))
                indices = [i for i, ep in enumerate(kept_episode_ids) if start <= ep < end]
                if indices:
                    if indices != list(range(indices[0], indices[-1] + 1)):
                        raise ValueError(f"selection makes split {split} non-contiguous")
                    next_info["splits"][split] = f"{indices[0]}:{indices[-1] + 1}"
        (temp_dir / "meta").mkdir(parents=True, exist_ok=True)
        (temp_dir / "meta" / "info.json").write_text(json.dumps(next_info, indent=2, ensure_ascii=False) + "\n")

        output_video_cache = {}
        for row in new_meta_rows:
            relative = format_path(data_template, chunk_index=row["data/chunk_index"], file_index=row["data/file_index"])
            validate_native_episode(temp_dir, next_info, row, pq.read_table(temp_dir / relative), output_video_cache)

        if source_snapshot(source_dir) != snapshot:
            raise ValueError("source changed during export; stop recording/postprocessing and retry")
        if output_dir.exists():
            raise ValueError(f"output directory already exists: {output_dir}")
        temp_dir.rename(output_dir)
    except BaseException:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise

    print(
        json.dumps(
            {
                "outputPath": str(output_dir),
                "totalEpisodes": len(new_meta_rows),
                "totalFrames": global_index_start,
            }
        )
    )


if __name__ == "__main__":
    main()
