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
    if len(sys.argv) != 5:
        raise SystemExit(
            "usage: rewrite_episode_parquet.py SOURCE OUTPUT EPISODE_INDEX INDEX_START"
        )

    source_path = sys.argv[1]
    output_path = sys.argv[2]
    episode_index = int(sys.argv[3])
    index_start = int(sys.argv[4])

    table = pq.read_table(source_path)
    row_count = table.num_rows
    table = replace_column(table, "episode_index", [episode_index] * row_count)
    table = replace_column(table, "index", range(index_start, index_start + row_count))
    table = replace_column(table, "frame_index", range(row_count))
    table = table.replace_schema_metadata(
        normalize_schema_metadata(table.schema.metadata)
    )

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(table, output_path)


if __name__ == "__main__":
    main()
