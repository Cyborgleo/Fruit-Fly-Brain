"""Print the schema and a tiny sample from an Arrow Feather file."""

from __future__ import annotations

import argparse
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", help="Path to an official Feather/Arrow file")
    args = parser.parse_args()

    try:
        import pyarrow as pa
        import pyarrow.ipc as ipc
    except ImportError:
        print("Install the project Python dependencies first (pyarrow is required).", file=sys.stderr)
        return 2

    try:
        source = pa.memory_map(args.file, "r")
        reader = ipc.open_file(source)
    except Exception as error:
        print(f"Could not open Arrow IPC file: {error}", file=sys.stderr)
        return 1

    print(f"Record batches: {reader.num_record_batches}")
    print("Schema:")
    print(reader.schema)
    if reader.num_record_batches:
        batch = reader.get_batch(0).slice(0, 5)
        print("\nFirst five rows of first record batch:")
        print(pa.Table.from_batches([batch]).to_pydict())
    source.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

