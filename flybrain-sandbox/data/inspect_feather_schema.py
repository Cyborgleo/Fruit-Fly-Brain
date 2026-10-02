#!/usr/bin/env python3
"""Read Arrow IPC / Feather v2 schema metadata without loading table bodies.

Only the small FlatBuffers footer is read from each file. This is useful for
large connectome releases where a full Feather table can be many gigabytes.
"""

from __future__ import annotations

import argparse
import struct
from pathlib import Path


TYPE_NAMES = {
    0: "NONE", 1: "Null", 2: "Int", 3: "FloatingPoint", 4: "Binary",
    5: "Utf8", 6: "Bool", 7: "Decimal", 8: "Date", 9: "Time",
    10: "Timestamp", 11: "Interval", 12: "List", 13: "Struct",
    14: "Union", 15: "FixedSizeBinary", 16: "FixedSizeList", 17: "Map",
    18: "Duration", 19: "LargeBinary", 20: "LargeUtf8", 21: "LargeList",
    22: "RunEndEncoded", 23: "BinaryView", 24: "Utf8View", 25: "ListView",
    26: "LargeListView",
}


class FooterReader:
    def __init__(self, path: Path):
        self.path = path
        self.file = path.open("rb")
        self.size = path.stat().st_size
        if self.size < 18:
            raise ValueError("file is too small to be Arrow IPC")
        self.file.seek(self.size - 6)
        if self.file.read(6) != b"ARROW1":
            raise ValueError("missing trailing ARROW1 magic; expected Feather v2 / Arrow IPC file")
        self.file.seek(self.size - 10)
        footer_length = self.u32()
        self.base = self.size - 10 - footer_length
        if self.base < 8 or footer_length <= 0:
            raise ValueError(f"invalid footer length {footer_length}")

    def read(self, offset: int, size: int) -> bytes:
        self.file.seek(offset)
        value = self.file.read(size)
        if len(value) != size:
            raise ValueError("truncated Arrow footer")
        return value

    def u16(self, offset: int | None = None) -> int:
        return struct.unpack("<H", self.read(offset if offset is not None else self.file.tell(), 2))[0]

    def u32(self, offset: int | None = None) -> int:
        return struct.unpack("<I", self.read(offset if offset is not None else self.file.tell(), 4))[0]

    def i32(self, offset: int) -> int:
        return struct.unpack("<i", self.read(offset, 4))[0]

    def table_field(self, table: int, index: int) -> int | None:
        vtable = table - self.i32(table)
        vtable_size = self.u16(vtable)
        slot = vtable + 4 + index * 2
        if slot + 2 > vtable + vtable_size:
            return None
        relative = self.u16(slot)
        return table + relative if relative else None

    def indirect(self, field: int | None) -> int | None:
        return field + self.u32(field) if field is not None else None

    def string(self, field: int | None) -> str:
        target = self.indirect(field)
        if target is None:
            return ""
        length = self.u32(target)
        return self.read(target + 4, length).decode("utf-8", errors="replace")

    def vector_tables(self, field: int | None) -> list[int]:
        target = self.indirect(field)
        if target is None:
            return []
        count = self.u32(target)
        return [target + 4 + i * 4 + self.u32(target + 4 + i * 4) for i in range(count)]

    def field_schema(self, table: int, depth: int = 0) -> list[str]:
        if depth > 12:
            return ["  " * depth + "… (nested field limit)"]
        name = self.string(self.table_field(table, 0)) or "<unnamed>"
        nullable_slot = self.table_field(table, 1)
        nullable = bool(self.read(nullable_slot, 1)[0]) if nullable_slot is not None else False
        type_slot = self.table_field(table, 2)
        type_id = self.read(type_slot, 1)[0] if type_slot is not None else 0
        type_name = TYPE_NAMES.get(type_id, f"ArrowType({type_id})")
        lines = ["  " * depth + f"{name}: {type_name}{'?' if nullable else ''}"]
        children = self.vector_tables(self.table_field(table, 5))
        for child in children:
            lines.extend(self.field_schema(child, depth + 1))
        return lines

    def schema(self) -> list[str]:
        root = self.base + self.u32(self.base)
        schema_slot = self.table_field(root, 1)
        schema_table = self.indirect(schema_slot)
        if schema_table is None:
            raise ValueError("Arrow footer has no schema")
        field_tables = self.vector_tables(self.table_field(schema_table, 1))
        lines = []
        for field in field_tables:
            lines.extend(self.field_schema(field))
        return lines

    def close(self) -> None:
        self.file.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("files", nargs="+", type=Path, help="Feather v2 files; only each file's footer is read")
    args = parser.parse_args()
    for path in args.files:
        reader = None
        try:
            reader = FooterReader(path)
            print(f"\n{path} ({reader.size:,} bytes)")
            print("  fields:")
            for line in reader.schema():
                print("  " + line)
        except (OSError, ValueError, struct.error) as exc:
            print(f"\n{path}: ERROR: {exc}")
        finally:
            if reader is not None:
                reader.close()


if __name__ == "__main__":
    main()
