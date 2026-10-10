"""Validate native camera/mesh references before publishing a subset export."""

import hashlib
import json
import subprocess
from fractions import Fraction

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq

from preserve_episode_assets import contained_path


def native_tactile_fields(info):
    fields = {}
    cameras = set()
    for key in info.get("features", {}):
        for suffix in (".tactile_range", ".mesh3dflow_range"):
            if key.startswith("observation.") and key.endswith(suffix):
                camera = key.removeprefix("observation.").removesuffix(suffix)
                if camera in cameras:
                    raise ValueError(f"duplicate tactile range fields: {camera}")
                fields[key] = camera
                cameras.add(camera)
                break
    return fields


def validate_native_episode(root, info, metadata, table, video_cache=None):
    fields = native_tactile_fields(info)
    if not fields:
        return
    video_cache = video_cache if video_cache is not None else {}
    episode = int(metadata["episode_index"])
    base = f"episode_{episode:06d}"
    plan = json.loads(contained_path(root, "meta/camera_streams.json").read_text())
    if plan["dataset_fps"] != info["fps"]:
        raise ValueError("native camera plan disagrees with dataset fps")
    clocks = pq.read_table(contained_path(root, f"timestamps/{base}.parquet"))
    if clocks.num_rows != table.num_rows:
        raise ValueError(f"native timing/action row count mismatch: episode {episode}")
    if clocks["frame_index"].to_pylist() != table["frame_index"].to_pylist():
        raise ValueError(f"native timing frame indices mismatch: episode {episode}")
    mappings = [json.loads(value) for value in clocks["camera_intervals_json"].to_pylist()]
    for key, camera in fields.items():
        field = table.schema.field(key)
        if (
            not (pa.types.is_list(field.type) or pa.types.is_fixed_size_list(field.type))
            or field.type.value_type != pa.int64()
        ):
            raise ValueError(f"tactile ranges must be int64 pairs: {key}")
        ranges = table[key].to_pylist()
        setting = plan["cameras"][camera]
        if key.endswith(".tactile_range") and (
            setting.get("tactile_range_key", key) != key
            or setting.get("tactile_range_targets", ["video", "mesh3dflow"]) != ["video", "mesh3dflow"]
        ):
            raise ValueError(f"shared tactile range plan mismatch: {camera}")
        fps = float(setting["fps"])
        video_key = f"observation.images.{camera}"
        if fps <= 0 or info["features"][video_key]["info"]["video.fps"] != fps:
            raise ValueError(f"native camera fps mismatch: {camera}")
        stream = contained_path(root, f"tactile_streams/{camera}/{base}")
        samples = pq.read_table(stream / "samples.parquet").to_pylist()
        if not samples:
            raise ValueError(f"missing native samples: {camera}, episode {episode}")
        prefix = f"videos/{video_key}/"
        video_path = info["video_path"].format(
            video_key=video_key, chunk_index=metadata[prefix + "chunk_index"], file_index=metadata[prefix + "file_index"]
        )
        offset = float(metadata[prefix + "from_timestamp"])
        if abs(float(metadata[prefix + "to_timestamp"]) - offset - len(samples) / fps) > 1e-6:
            raise ValueError(f"native video duration mismatch: {camera}, episode {episode}")
        video = contained_path(root, video_path)
        if video_path not in video_cache:
            result = subprocess.run(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-select_streams",
                    "v:0",
                    "-show_entries",
                    "stream=avg_frame_rate,nb_frames",
                    "-of",
                    "json",
                    str(video),
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            video_cache[video_path] = json.loads(result.stdout)["streams"][0]
        probe = video_cache[video_path]
        if abs(float(Fraction(probe["avg_frame_rate"])) - fps) > 1e-6:
            raise ValueError(f"encoded video fps mismatch: {camera}")
        if int(probe["nb_frames"]) < round(offset * fps) + len(samples):
            raise ValueError(f"native video missing frames: {camera}")
        video_info = json.loads((stream / "video.json").read_text())
        if (
            video_info["video_path"] != video_path
            or video_info["frame_count"] != len(samples)
            or video_info["fps"] != fps
            or abs(video_info["from_timestamp"] - offset) > 1e-6
        ):
            raise ValueError(f"native video manifest mismatch: {camera}")
        previous = 0
        for pair, mapping in zip(ranges, mappings, strict=True):
            interval = mapping[camera]
            expected = [interval["start_index"], interval["end_index"]]
            if pair != expected or len(pair) != 2 or pair[0] != previous or not 0 <= pair[0] <= pair[1] <= len(samples):
                raise ValueError(f"native tactile range/clock mismatch: {camera}, episode {episode}")
            start, end = pair
            if interval["frame_count"] != end - start:
                raise ValueError(f"native interval count mismatch: {camera}")
            if interval["capture_monotonic_ns"] != [s["capture_monotonic_ns"] for s in samples[start:end]]:
                raise ValueError(f"native capture timestamps mismatch: {camera}")
            representative = interval.get("representative_tactile_index")
            if representative is not None and not 0 <= representative < end:
                raise ValueError(f"native representative index out of bounds: {camera}")
            previous = end
        if previous != len(samples):
            raise ValueError(f"unreferenced native mesh frames: {camera}")
        meshes = {}
        for index, sample in enumerate(samples):
            if (
                sample["tactile_index"] != index
                or sample["video_frame_index"] != index
                or sample["video_path"] != video_path
                or abs(sample["video_timestamp_s"] - offset - index / fps) > 1e-6
                or sample["camera_fps"] != fps
            ):
                raise ValueError(f"native sample/video index mismatch: {camera}:{index}")
            relative = sample.get("mesh_path") or sample.get("motion_path")
            if not relative:
                raise ValueError(f"missing native mesh path: {camera}:{index}")
            path = contained_path(root, relative)
            if relative not in meshes:
                mesh = np.load(path, allow_pickle=False, mmap_mode="r")
                if mesh.dtype.kind != "f" or not np.isfinite(mesh).all():
                    raise ValueError(f"invalid lossless mesh values: {relative}")
                meshes[relative] = mesh
            mesh = meshes[relative]
            if sample.get("mesh_path"):
                if (
                    path.resolve() != (stream / "mesh3dflow.npy").resolve()
                    or sample["mesh_frame_index"] != index
                    or mesh.ndim != 4
                    or len(mesh) != len(samples)
                ):
                    raise ValueError(f"native mesh frame index mismatch: {camera}:{index}")
            elif mesh.ndim != 3:
                raise ValueError(f"invalid per-frame mesh shape: {relative}")
        manifest_path = stream / "mesh3dflow.json"
        if any(sample.get("mesh_path") for sample in samples) and not manifest_path.is_file():
            raise ValueError(f"missing lossless mesh manifest: {camera}")
        if manifest_path.exists():
            manifest = json.loads(manifest_path.read_text())
            mesh_path = stream / "mesh3dflow.npy"
            mesh = np.load(mesh_path, allow_pickle=False, mmap_mode="r")
            hasher = hashlib.sha256()
            with mesh_path.open("rb") as handle:
                for block in iter(lambda: handle.read(1024 * 1024), b""):
                    hasher.update(block)
            if (
                manifest["sha256"] != hasher.hexdigest()
                or manifest["dtype"] != mesh.dtype.str
                or manifest["shape"] != list(mesh.shape)
                or manifest.get("roundtrip") != "bit_exact"
                or manifest.get("lossless") is not True
            ):
                raise ValueError(f"lossless mesh manifest/hash mismatch: {camera}")
