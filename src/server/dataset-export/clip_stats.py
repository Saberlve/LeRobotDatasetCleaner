"""Recompute stored episode statistics from the actual clipped output."""

import subprocess
import tempfile

import numpy as np


def video_stats(path, count, quantiles):
    # RGB histograms keep memory bounded even for long, high-resolution videos.
    histogram = np.zeros((3, 256), dtype=np.int64)
    with tempfile.TemporaryFile() as errors:
        with subprocess.Popen(
            ["ffmpeg", "-v", "error", "-i", str(path), "-map", "0:v:0",
             "-f", "rawvideo", "-pix_fmt", "rgb24", "-vsync", "0", "pipe:1"],
            stdout=subprocess.PIPE, stderr=errors,
        ) as process:
            pending = b""
            while block := process.stdout.read(3 * 65536):
                pending += block
                size = len(pending) // 3 * 3
                pixels = np.frombuffer(pending[:size], dtype=np.uint8).reshape(-1, 3)
                for channel in range(3):
                    histogram[channel] += np.bincount(pixels[:, channel], minlength=256)
                pending = pending[size:]
            if process.wait() or pending:
                errors.seek(0)
                raise ValueError(f"cannot compute video statistics: {errors.read().decode()}")
    total = histogram.sum(axis=1)
    if np.any(total == 0):
        raise ValueError(f"empty video while computing statistics: {path}")
    values = np.arange(256) / 255.0
    mean = (histogram * values).sum(axis=1) / total
    result = {
        "min": (histogram > 0).argmax(axis=1) / 255.0,
        "max": (255 - (histogram[:, ::-1] > 0).argmax(axis=1)) / 255.0,
        "mean": mean,
        "std": np.sqrt((histogram * (values - mean[:, None]) ** 2).sum(axis=1) / total),
    }
    cumulative = histogram.cumsum(axis=1)
    for key, q in quantiles.items():
        ranks = (total - 1) * q
        lower, upper = np.floor(ranks), np.ceil(ranks)
        lo = np.array([np.searchsorted(cumulative[c], lower[c], side="right") for c in range(3)])
        hi = np.array([np.searchsorted(cumulative[c], upper[c], side="right") for c in range(3)])
        result[key] = (lo + (hi - lo) * (ranks - lower)) / 255.0
    return {**{key: value.reshape(3, 1, 1).tolist() for key, value in result.items()}, "count": [count]}


def recompute_episode_stats(row, table, videos):
    features = {key[6:].rsplit("/", 1)[0] for key in row if key.startswith("stats/")}
    for feature in features:
        prefix = f"stats/{feature}/"
        keys = [key[len(prefix):] for key in row if key.startswith(prefix)]
        quantiles = {key: int(key[1:]) / 100 for key in keys if key.startswith("q") and key[1:].isdigit()}
        if feature in videos:
            stats = video_stats(videos[feature], table.num_rows, quantiles)
        else:
            if feature not in table.column_names:
                raise ValueError(f"cannot recompute clipped statistics for missing feature: {feature}")
            values = np.asarray(table[feature].to_pylist())
            if values.dtype.kind not in "biuf":
                raise ValueError(f"cannot recompute clipped statistics for non-numeric feature: {feature}")
            values = values.astype(np.float64)
            if values.ndim == 1:
                values = values[:, None]
            stats = {
                "min": values.min(axis=0).tolist(),
                "max": values.max(axis=0).tolist(),
                "mean": values.mean(axis=0).tolist(),
                "std": values.std(axis=0).tolist(),
                "count": [table.num_rows],
                **{key: np.quantile(values, q, axis=0).tolist() for key, q in quantiles.items()},
            }
        for key in keys:
            if key not in stats:
                raise ValueError(f"unsupported clipped statistic: {prefix}{key}")
            row[prefix + key] = stats[key]
