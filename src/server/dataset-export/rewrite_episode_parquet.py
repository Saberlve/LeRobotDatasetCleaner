#!/usr/bin/env python3
import json
import sys
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq


def normalize_huggingface_types(value):
    if isinstance(value, dict):
        return {
            key: (
                "Sequence"
                if key == "_type" and child == "List"
                else normalize_huggingface_types(child)
            )
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

    next_metadata[b"huggingface"] = json.dumps(
        normalize_huggingface_types(parsed)
    ).encode("utf-8")
    return next_metadata


def replace_column(table, column_name, values):
    if column_name not in table.column_names:
        return table

    column_index = table.column_names.index(column_name)
    field = table.schema.field(column_name)
    array = pa.array(values, type=field.type)
    return table.set_column(column_index, field, array)


def main() -> None:
    if len(sys.argv) not in (5, 7):
        raise SystemExit(
            "usage: rewrite_episode_parquet.py SOURCE OUTPUT EPISODE_INDEX INDEX_START [REMOVED_INTERVALS_JSON FPS]"
        )

    source_path = sys.argv[1]
    output_path = sys.argv[2]
    episode_index = int(sys.argv[3])
    index_start = int(sys.argv[4])
    removed = json.loads(sys.argv[5]) if len(sys.argv) == 7 else []
    fps = float(sys.argv[6]) if len(sys.argv) == 7 else None

    table = pq.read_table(source_path)
    row_count = table.num_rows
    previous_end = -1
    keep = [True] * row_count
    for interval in removed:
        if (not isinstance(interval, dict) or not isinstance(interval.get("start"), int)
                or not isinstance(interval.get("end"), int)
                or interval["start"] < 0 or interval["end"] < interval["start"]
                or interval["end"] >= row_count or interval["start"] <= previous_end):
            raise ValueError("invalid normalized removed frame intervals")
        previous_end = interval["end"]
        for frame in range(interval["start"], interval["end"] + 1):
            keep[frame] = False
    if not any(keep):
        raise ValueError("a clip cannot remove every parquet row")
    if removed:
        table = table.filter(pa.array(keep))
    row_count = table.num_rows
    table = replace_column(table, "episode_index", [episode_index] * row_count)
    table = replace_column(table, "index", range(index_start, index_start + row_count))
    table = replace_column(table, "frame_index", range(row_count))
    if fps is not None:
        if fps <= 0:
            raise ValueError("fps must be positive")
        table = replace_column(table, "timestamp", [frame / fps for frame in range(row_count)])
    table = table.replace_schema_metadata(
        normalize_schema_metadata(table.schema.metadata)
    )

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(table, output_path)


if __name__ == "__main__":
    main()
