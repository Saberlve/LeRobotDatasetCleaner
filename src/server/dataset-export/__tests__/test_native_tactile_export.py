"""Three-episode native-format exports through the same engine as the web route."""

import hashlib
import json
import shutil
import subprocess
import sys
import unittest

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq

from test_v3_preservation import PreservationTest, SCRIPTS, write_json, write_table
from verify_v3_subset import verify_subset


class NativeExportTest(unittest.TestCase):
    def setUp(self):
        fixture = PreservationTest()
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        self.fixture = fixture
        self.source, self.parent = fixture.source, fixture.parent
        self.key = "observation.photon_left.tactile_range"
        self.video_key = "observation.images.photon_left"
        self.video_path = "videos/observation.images.photon_left/chunk-002/file-004.mp4"
        info = json.loads((self.source / "meta/info.json").read_text())
        info["features"][self.key] = {"dtype": "int64", "shape": [2], "names": None}
        info["features"][self.video_key]["info"] = {"video.fps": 60, "video.codec": "h264"}
        write_json(self.source / "meta/info.json", info)
        write_json(
            self.source / "meta/camera_streams.json",
            {
                "dataset_fps": 15,
                "cameras": {
                    "photon_left": {
                        "fps": 60,
                        "tactile": True,
                        "interval": True,
                        "storage": "video",
                        "require_mesh": True,
                    }
                },
            },
        )
        data_path = self.source / "data/chunk-001/file-007.parquet"
        rows = pq.read_table(data_path).to_pylist()
        for row in rows:
            row.pop("observation.photon_left.mesh_motion_3d")
            row[self.key] = [row["frame_index"] * 4, (row["frame_index"] + 1) * 4]
        write_table(data_path, rows)
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "color=red:s=64x64:r=60",
                "-frames:v",
                "24",
                "-c:v",
                "libx264",
                "-g",
                "2",
                "-pix_fmt",
                "yuv420p",
                str(self.source / self.video_path),
            ],
            check=True,
        )
        for ep in range(3):
            base = f"episode_{ep:06d}"
            path = self.source / f"meta/episodes/chunk-000/file-{ep:03d}.parquet"
            meta = pq.read_table(path).to_pylist()[0]
            prefix = f"videos/{self.video_key}/"
            offset = ep * 8 / 60
            meta[prefix + "from_timestamp"] = offset
            meta[prefix + "to_timestamp"] = offset + 8 / 60
            write_table(path, [meta])
            stream = self.source / f"tactile_streams/photon_left/{base}"
            shutil.rmtree(stream)
            stream.mkdir()
            mesh = np.arange(8 * 2 * 2 * 3, dtype=np.float64).reshape(8, 2, 2, 3) / 7
            mesh.flat[0] = -0.0
            mesh.flat[1] = np.nextafter(np.float64(ep + 1), np.float64(np.inf))
            np.save(stream / "mesh3dflow.npy", mesh, allow_pickle=False)
            write_json(
                stream / "mesh3dflow.json",
                {
                    "dtype": mesh.dtype.str,
                    "shape": list(mesh.shape),
                    "lossless": True,
                    "roundtrip": "bit_exact",
                    "sha256": hashlib.sha256((stream / "mesh3dflow.npy").read_bytes()).hexdigest(),
                },
            )
            write_json(
                stream / "video.json",
                {"fps": 60, "frame_count": 8, "video_path": self.video_path, "from_timestamp": offset},
            )
            samples = [
                {
                    "tactile_index": index,
                    "capture_monotonic_ns": ep * 100000 + index,
                    "capture_monotonic_s": 10.0 + index / 60,
                    "sensor_timestamp_s": 20 + index / 60,
                    "device_to_host_offset_s": -10.0,
                    "camera_fps": 60.0,
                    "frame_path": None,
                    "motion_path": None,
                    "image_encoding": "h264_yuv420p",
                    "video_path": self.video_path,
                    "video_frame_index": index,
                    "video_timestamp_s": offset + index / 60,
                    "mesh_path": f"tactile_streams/photon_left/{base}/mesh3dflow.npy",
                    "mesh_frame_index": index,
                }
                for index in range(8)
            ]
            write_table(stream / "samples.parquet", samples)
            clocks_path = self.source / f"timestamps/{base}.parquet"
            clocks = pq.read_table(clocks_path).to_pylist()
            for frame, row in enumerate(clocks):
                mapping = {
                    "photon_left": {
                        "start_index": frame * 4,
                        "end_index": (frame + 1) * 4,
                        "frame_count": 4,
                        "camera_fps": 60,
                        "capture_monotonic_ns": [
                            r["capture_monotonic_ns"] for r in samples[frame * 4 : (frame + 1) * 4]
                        ],
                        "representative_tactile_index": (frame + 1) * 4 - 1,
                    }
                }
                row["camera_intervals_json"] = json.dumps(mapping)
                row["tactile_timing_json"] = json.dumps(mapping)
            write_table(clocks_path, clocks)

    def run_export(self, kept, name):
        output = self.parent / name
        result = self.fixture.export(kept=kept, output=output)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(verify_subset(self.source, output)["verified"])
        for new, old in enumerate(kept):
            base = f"episode_{new:06d}"
            stream = output / f"tactile_streams/photon_left/{base}"
            wanted = np.load(self.source / f"tactile_streams/photon_left/episode_{old:06d}/mesh3dflow.npy")
            actual = np.load(stream / "mesh3dflow.npy")
            self.assertEqual(actual.dtype, np.float64)
            self.assertEqual(wanted.tobytes(), actual.tobytes())
            samples = pq.read_table(stream / "samples.parquet").to_pylist()
            self.assertEqual(samples[0]["mesh_path"], f"tactile_streams/photon_left/{base}/mesh3dflow.npy")
            self.assertEqual(samples[-1]["video_timestamp_s"], old * 8 / 60 + 7 / 60)
        return output

    def test_delete_head_middle_tail_and_flagged_only(self):
        for label, kept in [
            ("head", [1, 2]),
            ("middle", [0, 2]),
            ("tail", [0, 1]),
            ("flagged", [1]),
            ("reorder", [2, 0, 1]),
        ]:
            with self.subTest(label=label):
                self.run_export(kept, label)

    def test_broken_mesh_range_fails_atomically(self):
        path = self.source / "data/chunk-001/file-007.parquet"
        rows = pq.read_table(path).to_pylist()
        rows[0][self.key] = [0, 5]
        write_table(path, rows)
        result = self.fixture.export(kept=[0, 1, 2])
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("tactile range/clock mismatch", result.stderr)
        self.assertFalse(self.fixture.output.exists())
        self.assertEqual(list(self.parent.glob("result.tmp-*")), [])

    def test_legacy_range_is_still_exportable(self):
        legacy = self.key.replace(".tactile_range", ".mesh3dflow_range")
        path = self.source / "meta/info.json"
        info = json.loads(path.read_text())
        info["features"][legacy] = info["features"].pop(self.key)
        write_json(path, info)
        path = self.source / "data/chunk-001/file-007.parquet"
        table = pq.read_table(path)
        table = table.rename_columns([legacy if name == self.key else name for name in table.column_names])
        pq.write_table(table, path)
        self.run_export([2, 0, 1], "legacy")

    def test_duplicate_ranges_are_rejected(self):
        path = self.source / "meta/info.json"
        info = json.loads(path.read_text())
        info["features"][self.key.replace(".tactile_range", ".mesh3dflow_range")] = info["features"][self.key]
        write_json(path, info)
        result = self.fixture.export(kept=[0])
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("duplicate tactile range", result.stderr)
        self.assertFalse(self.fixture.output.exists())

    def test_mesh_corruption_is_rejected_before_export(self):
        path = self.source / "tactile_streams/photon_left/episode_000000/mesh3dflow.npy"
        mesh = np.load(path)
        mesh.flat[2] = np.nextafter(mesh.flat[2], np.inf)
        np.save(path, mesh)
        result = self.fixture.export(kept=[0])
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("mesh manifest/hash mismatch", result.stderr)
        self.assertFalse(self.fixture.output.exists())


if __name__ == "__main__":
    unittest.main()
