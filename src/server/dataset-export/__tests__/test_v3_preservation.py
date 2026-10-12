"""Integration coverage for packed videos and asynchronous recording sidecars."""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
from verify_v3_subset import verify_subset


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value))


def write_table(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(pa.Table.from_pylist(rows), path)


class PreservationTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="v3-preservation-")
        self.addCleanup(self.temporary.cleanup)
        self.parent = Path(self.temporary.name)
        self.source = self.parent / "source"
        self.output = self.parent / "result"
        write_json(
            self.source / "meta/info.json",
            {
                "codebase_version": "v3.0",
                "total_episodes": 3,
                "total_frames": 6,
                "fps": 15,
                "chunks_size": 1000,
                "total_videos": 1,
                "splits": {"train": "0:2", "test": "2:3"},
                "data_path": "data/chunk-{chunk_index:03d}/file-{file_index:03d}.parquet",
                "video_path": "videos/{video_key}/chunk-{chunk_index:03d}/file-{file_index:03d}.mp4",
                "features": {
                    "action": {"dtype": "float32"},
                    "timestamp": {"dtype": "float64"},
                    "observation.images.photon_left": {
                        "dtype": "video",
                        "info": {"video.codec": "av1"},
                    },
                },
            },
        )
        data_rows = []
        for ep in range(3):
            index = ep * 2
            meta = {
                "episode_index": ep,
                "length": 2,
                "tasks": ["erase"],
                "data/chunk_index": 1,
                "data/file_index": 7,
                "dataset_from_index": index,
                "dataset_to_index": index + 2,
                "meta/episodes/chunk_index": 0,
                "meta/episodes/file_index": ep,
                "videos/observation.images.photon_left/chunk_index": 2,
                "videos/observation.images.photon_left/file_index": 4,
                "videos/observation.images.photon_left/from_timestamp": 10.0
                + ep * 2 / 15,
                "videos/observation.images.photon_left/to_timestamp": 10.0
                + (ep + 1) * 2 / 15,
            }
            for feature, values in {
                "action": [ep * 10.0, ep * 10.0 + 2],
                "index": [float(index), float(index + 1)],
                "episode_index": [float(ep), float(ep)],
            }.items():
                for stat, value in {
                    "min": [min(values)],
                    "max": [max(values)],
                    "mean": [sum(values) / 2],
                    "std": [(max(values) - min(values)) / 2],
                    "count": [2],
                    "q50": [sum(values) / 2],
                }.items():
                    meta[f"stats/{feature}/{stat}"] = value
            for stat, value in {
                "min": [[[0.0]], [[0.0]], [[0.0]]],
                "max": [[[1.0]], [[1.0]], [[1.0]]],
                "mean": [[[0.5]], [[0.5]], [[0.5]]],
                "std": [[[0.1]], [[0.1]], [[0.1]]],
                "count": [2],
            }.items():
                meta[f"stats/observation.images.photon_left/{stat}"] = value
            write_table(
                self.source / f"meta/episodes/chunk-000/file-{ep:03d}.parquet", [meta]
            )
            base = f"episode_{ep:06d}"
            for frame in range(2):
                data_rows.append(
                    {
                        "episode_index": ep,
                        "index": index + frame,
                        "frame_index": frame,
                        "timestamp": 0.003 + frame * 0.067,
                        "action": [ep * 10.0 + frame * 2],
                        "observation.photon_left.mesh_motion_3d": [
                            [[1.125, float("nan"), -0.25]]
                        ],
                        "task_index": 0,
                    }
                )
            clocks = [
                {
                    "frame_index": f,
                    "action_index": 9000 + f,
                    "action_send_start_ns": 123456789000000 + ep * 100 + f,
                    "tactile_timing_json": json.dumps(
                        {
                            "photon_left": {
                                "start_index": f * 2,
                                "end_index": f * 2 + 2,
                                "sensor_timestamp_s": [1.0001 + ep],
                                "window_end_ns": 765432100000 + f,
                            }
                        }
                    ),
                }
                for f in range(2)
            ]
            write_table(self.source / f"timestamps/{base}.parquet", clocks)
            write_table(
                self.source / f"timestamps/{base}_actions.parquet",
                [{"action_index": 9000, "gello_read_start_ns": 887766554433}],
            )
            write_json(
                self.source / f"timestamps/{base}_summary.json",
                {"timing_basis": "host/device", "span_ms": 12.25},
            )
            csv = self.source / f"timestamps/{base}.csv"
            csv.write_bytes(b"frame_index,time_ns\n0,123456789000000\n")
            write_json(
                self.source / f"timestamps/{base}_commit.json",
                {
                    "episode_index": ep,
                    "transaction_id": "keep-this-identity",
                    "tactile_streams": ["photon_left"],
                    "timestamp_files": [
                        f"{base}.parquet",
                        f"{base}_actions.parquet",
                        f"{base}_summary.json",
                        f"{base}.csv",
                    ],
                },
            )
            tactile = self.source / f"tactile_streams/photon_left/{base}"
            tactile.mkdir(parents=True)
            sample_rows = []
            for sample in range(4):
                frame_rel = (
                    f"tactile_streams/photon_left/{base}/frames/frame_{sample:06d}.png"
                )
                motion_rel = (
                    f"tactile_streams/photon_left/{base}/motion/motion_{sample:06d}.npy"
                )
                for rel in (frame_rel, motion_rel):
                    path = self.source / rel
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(f"original-{ep}-{sample}-{path.suffix}".encode())
                sample_rows.append(
                    {
                        "tactile_index": sample,
                        "capture_monotonic_ns": 87654321000000 + sample,
                        "sensor_timestamp_s": 123456.0000001 + sample * 0.01,
                        "device_to_host_offset_s": -99887.123456,
                        "frame_path": frame_rel,
                        "motion_path": motion_rel,
                    }
                )
            write_table(tactile / "samples.parquet", sample_rows)
            image_rel = f"images/observation.images.photon_left/episode-{ep:06d}/frame-000000.png"
            image = self.source / image_rel
            image.parent.mkdir(parents=True, exist_ok=True)
            image.write_bytes(b"archived-camera-image")
            write_table(
                self.source / f"raw_episodes/{base}/frames.parquet",
                [
                    {
                        "timestamp": 0.003,
                        "frame_index": 0,
                        "action": [1.23456789],
                        "task": f"episode_{ep:06d}",
                        "observation.images.photon_left": image_rel,
                    }
                ],
            )
            raw_image = self.source / f"raw_episodes/{base}/images/observation.images.photon_left/frame-000000.png"
            raw_image.parent.mkdir(parents=True, exist_ok=True)
            raw_image.write_bytes(b"raw-checkpoint-camera-image")
            write_json(
                self.source / f"raw_episodes/{base}/manifest.json",
                {
                    "episode_index": ep,
                    "runtime_dir": "runtime/session_original",
                    "created_unix_s": 123456.789,
                },
            )
        write_table(self.source / "data/chunk-001/file-007.parquet", data_rows)
        video = (
            self.source / "videos/observation.images.photon_left/chunk-002/file-004.mp4"
        )
        video.parent.mkdir(parents=True, exist_ok=True)
        # Invalid encoded bytes prove that no decoder/encoder is invoked.
        video.write_bytes(b"byte-identical-shared-AV1-shard-including-unused-frames")
        write_json(
            self.source / "runtime/session_original/manifest.json",
            {"first_episode_index": 1, "calibration": 0.123456789},
        )
        (self.source / "runtime/session_original/runtime_sensor").write_bytes(
            b"original-calibration"
        )
        write_json(self.source / "meta/stats.json", {"action": {"count": [999]}})

    def export(self, kept=(0, 2), clips=None, output=None):
        return subprocess.run(
            [
                sys.executable,
                str(SCRIPTS / "export_v3_subset.py"),
                str(self.source),
                str(output or self.output),
                json.dumps(
                    {"kept_episode_ids": kept, "removed_frame_intervals": clips or {}}
                ),
            ],
            text=True,
            capture_output=True,
            check=False,
        )

    def test_middle_episode_deletion_preserves_all_clocks_samples_video_bytes_and_paths(
        self,
    ):
        result = self.export()
        self.assertEqual(result.returncode, 0, result.stderr)
        report = verify_subset(self.source, self.output)
        self.assertEqual(report["episodes"], 2)
        self.assertEqual(report["frames"], 4)
        self.assertFalse(
            (self.output / "tactile_streams/photon_left/episode_000002").exists()
        )
        stats = json.loads((self.output / "meta/stats.json").read_text())
        self.assertEqual(stats["action"]["count"], [4])
        self.assertEqual(stats["action"]["mean"], [11.0])
        self.assertAlmostEqual(stats["action"]["std"][0], 101.0**0.5)
        self.assertEqual(stats["index"]["max"], [3.0])
        self.assertFalse((self.output / "raw_episodes").exists())
        raw = pq.read_table(self.source / "raw_episodes/episode_000002/frames.parquet")
        self.assertEqual(raw["task"].to_pylist(), ["episode_000002"])
        self.assertEqual(
            (self.source / "raw_episodes/episode_000002/images/"
             "observation.images.photon_left/frame-000000.png").read_bytes(),
            b"raw-checkpoint-camera-image",
        )
        samples = pq.read_table(
            self.output / "tactile_streams/photon_left/episode_000001/samples.parquet"
        )
        self.assertEqual(
            samples["frame_path"][0].as_py(),
            "tactile_streams/photon_left/episode_000001/frames/frame_000000.png",
        )
        self.assertEqual(
            json.loads((self.output / "meta/info.json").read_text())["splits"],
            {"train": "0:1", "test": "1:2"},
        )

    def test_export_excludes_raw_checkpoints_without_changing_source(self):
        original = {
            p.relative_to(self.source): p.read_bytes()
            for p in (self.source / "raw_episodes").rglob("*")
            if p.is_file()
        }
        for kept in ((0, 2), (1,)):
            output = self.parent / f"subset-{len(kept)}"
            result = self.export(kept=kept, output=output)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertFalse((output / "raw_episodes").exists())
            self.assertTrue(verify_subset(self.source, output)["verified"])
        self.assertEqual(
            original,
            {relative: (self.source / relative).read_bytes() for relative in original},
        )

    def test_verifier_rejects_exported_raw_directory(self):
        self.assertEqual(self.export().returncode, 0)
        (self.output / "raw_episodes").mkdir()
        with self.assertRaisesRegex(ValueError, "raw episode checkpoints must not be exported"):
            verify_subset(self.source, self.output)

    def test_refuses_clipping_with_clock_sidecars_and_leaves_no_partial_output(self):
        result = self.export(clips={"2": [{"start": 0, "end": 0}]})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("仅支持整段", result.stderr)
        self.assertFalse(self.output.exists())
        self.assertEqual(list(self.parent.glob("result.tmp-*")), [])

    def test_ignores_clip_drafts_for_discarded_episodes(self):
        result = self.export(clips={"1": [{"start": 0, "end": 0}]})
        self.assertEqual(result.returncode, 0, result.stderr)
        verify_subset(self.source, self.output)

    def test_refuses_duplicate_and_unknown_ids(self):
        for ids in ((0, 0), (0, 99)):
            self.assertNotEqual(self.export(kept=ids).returncode, 0)
            self.assertFalse(self.output.exists())

    def test_refuses_existing_and_nested_output(self):
        self.output.mkdir()
        (self.output / "keep.txt").write_text("original")
        self.assertNotEqual(self.export().returncode, 0)
        self.assertEqual((self.output / "keep.txt").read_text(), "original")
        self.assertNotEqual(self.export(output=self.source / "nested").returncode, 0)

    def test_missing_tactile_asset_fails_atomically(self):
        (
            self.source
            / "tactile_streams/photon_left/episode_000002/frames/frame_000003.png"
        ).unlink()
        result = self.export()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("missing tactile", result.stderr)
        self.assertFalse(self.output.exists())
        self.assertEqual(list(self.parent.glob("result.tmp-*")), [])

    def test_symlink_escape_fails_atomically(self):
        path = (
            self.source
            / "tactile_streams/photon_left/episode_000002/frames/frame_000003.png"
        )
        path.unlink()
        outside = self.parent / "outside.png"
        outside.write_bytes(b"outside")
        path.symlink_to(outside)
        result = self.export()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("escapes dataset root", result.stderr)
        self.assertFalse(self.output.exists())

    def test_detects_source_changes_and_cleans_up(self):
        code = """
import json, pathlib, runpy, sys
sys.path.insert(0, sys.argv[1])
import preserve_episode_assets as assets
original = assets.copy_file
source_root = pathlib.Path(sys.argv[2])
def changing_copy(source, target):
    original(source, target)
    if source.suffix == '.mp4':
        path = source_root / 'meta/info.json'
        info = json.loads(path.read_text())
        info['robot_type'] = 'concurrent-recorder'
        path.write_text(json.dumps(info))
assets.copy_file = changing_copy
sys.argv = [str(pathlib.Path(sys.argv[1]) / 'export_v3_subset.py'), sys.argv[2], sys.argv[3], '{"kept_episode_ids": [0, 2]}']
runpy.run_path(sys.argv[0], run_name='__main__')
"""
        result = subprocess.run(
            [
                sys.executable,
                "-c",
                code,
                str(SCRIPTS),
                str(self.source),
                str(self.output),
            ],
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("source changed", result.stderr)
        self.assertFalse(self.output.exists())
        self.assertEqual(list(self.parent.glob("result.tmp-*")), [])

    def test_verifier_detects_clock_corruption(self):
        self.assertEqual(self.export().returncode, 0)
        path = self.output / "timestamps/episode_000001.parquet"
        table = pq.read_table(path)
        idx = table.schema.get_field_index("action_send_start_ns")
        table = table.set_column(idx, table.schema.field(idx), pa.array([0, 1]))
        pq.write_table(table, path)
        with self.assertRaisesRegex(ValueError, "asset bytes changed"):
            verify_subset(self.source, self.output)

    def test_reordered_selection_preserves_assets_and_verifies(self):
        result = self.export(kept=(2, 0))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(verify_subset(self.source, self.output)["verified"])


if __name__ == "__main__":
    unittest.main()
