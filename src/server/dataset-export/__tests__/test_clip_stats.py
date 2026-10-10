"""Exercise clipped statistics through the production export entry point."""

import json
import shutil
import subprocess
import unittest

import numpy as np
import pyarrow.parquet as pq

import test_v3_preservation as fixtures


class ClipStatsTest(unittest.TestCase):
    def test_clipped_and_unclipped_episodes_have_current_stats(self):
        fixture = fixtures.PreservationTest()
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        source = fixture.source
        for name in ("timestamps", "tactile_streams", "raw_episodes"):
            shutil.rmtree(source / name)
        video_key = "observation.images.photon_left"
        video = source / f"videos/{video_key}/chunk-002/file-004.mp4"
        # Alternating black/white frames make a removed frame change pixel stats.
        frames = np.zeros((6, 16, 16, 3), dtype=np.uint8)
        frames[1::2] = 255
        subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
             "-s", "16x16", "-r", "15", "-i", "pipe:0", "-c:v", "libx264",
             "-pix_fmt", "yuv420p", str(video)], input=frames.tobytes(), check=True,
        )
        for ep in range(3):
            path = source / f"meta/episodes/chunk-000/file-{ep:03d}.parquet"
            row = pq.read_table(path).to_pylist()[0]
            row[f"videos/{video_key}/from_timestamp"] = ep * 2 / 15
            row[f"videos/{video_key}/to_timestamp"] = (ep + 1) * 2 / 15
            fixtures.write_table(path, [row])
        result = fixture.export(kept=(1, 2), clips={"1": [{"start": 1, "end": 1}]})
        self.assertEqual(result.returncode, 0, result.stderr)
        rows = pq.read_table(fixture.output / "meta/episodes/chunk-000/file-000.parquet").to_pylist()
        first, second = rows
        self.assertEqual(first["length"], 1)
        self.assertEqual(first["stats/action/max"], [10.0])
        self.assertEqual(first["stats/action/mean"], [10.0])
        self.assertEqual(first["stats/action/std"], [0.0])
        self.assertEqual(first["stats/action/q50"], [10.0])
        self.assertEqual(first["stats/action/count"], [1])
        self.assertEqual(first["stats/episode_index/mean"], [0.0])
        self.assertEqual(second["stats/episode_index/mean"], [1.0])
        self.assertEqual(second["stats/index/min"], [1.0])
        self.assertEqual(second["stats/index/max"], [2.0])
        self.assertEqual(second["stats/action/count"], [2])
        self.assertEqual(first[f"stats/{video_key}/count"], [1])
        np.testing.assert_allclose(first[f"stats/{video_key}/mean"], np.zeros((3, 1, 1)), atol=0.01)
        np.testing.assert_allclose(second[f"stats/{video_key}/mean"], np.full((3, 1, 1), 0.5), atol=0.01)
        stats = json.loads((fixture.output / "meta/stats.json").read_text())
        self.assertEqual(stats["action"]["count"], [3])
        self.assertEqual(stats["action"]["max"], [22.0])
        np.testing.assert_allclose(stats["action"]["mean"], [52 / 3])
        np.testing.assert_allclose(stats["action"]["std"], [np.std([10, 20, 22])])
        self.assertEqual(stats["index"]["max"], [2.0])
        self.assertEqual(stats[video_key]["count"], [3])


if __name__ == "__main__":
    unittest.main()
