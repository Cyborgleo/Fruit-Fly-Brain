"""Build disk-backed outgoing CSR arrays from official MaleCNS Feather files.

This prepares unsigned anatomical synapse counts only. It does not assign
transmitter signs or neuron-model weights, and its output must not be passed
to the LIF kernel as though those choices had already been made.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import numpy as np


def arrow_reader(path: Path, columns: list[str]):
    try:
        import pyarrow as pa
        import pyarrow.ipc as ipc
    except ImportError as error:
        raise RuntimeError("Install the project requirements before importing Feather data") from error

    source = pa.memory_map(str(path), "r")
    reader = ipc.open_file(source)
    missing = [name for name in columns if name not in reader.schema.names]
    if missing:
        source.close()
        raise ValueError(
            f"{path.name} is missing columns {missing}; found {reader.schema.names}. "
            "Inspect the official file schema and pass the matching column options."
        )
    non_integer = [
        name for name in columns
        if not pa.types.is_integer(reader.schema.field(name).type)
    ]
    if non_integer:
        source.close()
        raise ValueError(
            f"Expected integer ID/count columns, but these are not integer typed: {non_integer}"
        )
    return source, reader


def column_numpy(batch, name: str) -> np.ndarray:
    index = batch.schema.get_field_index(name)
    if index < 0:
        raise ValueError(f"Column {name!r} is absent from the record batch")
    return batch.column(index).to_numpy(zero_copy_only=False)


def read_neuron_ids(path: Path, id_column: str, chunk_rows: int) -> np.ndarray:
    source, reader = arrow_reader(path, [id_column])
    pieces: list[np.ndarray] = []
    try:
        for batch_index in range(reader.num_record_batches):
            batch = reader.get_batch(batch_index)
            for start in range(0, batch.num_rows, chunk_rows):
                pieces.append(column_numpy(batch.slice(start, chunk_rows), id_column).astype(np.int64, copy=False))
    finally:
        source.close()
    if not pieces:
        raise ValueError("Neuron annotation file contains no rows")
    ids = np.unique(np.concatenate(pieces))
    if not len(ids):
        raise ValueError("Neuron annotation file contains no usable IDs")
    if len(ids) >= 2**31:
        raise ValueError("Dense neuron indices exceed the supported int32 target range")
    return ids


def collect_graph_ids(
    path: Path,
    annotation_ids: np.ndarray,
    pre_column: str,
    post_column: str,
    chunk_rows: int,
) -> np.ndarray:
    """Build a complete node index from annotations plus every edge endpoint.

    Some valid connectome endpoints have no row in the annotation table. They
    must remain in the graph as unannotated neurons instead of being dropped.
    """
    source, reader = arrow_reader(path, [pre_column, post_column])
    ids = annotation_ids
    try:
        for batch_index in range(reader.num_record_batches):
            batch = reader.get_batch(batch_index)
            for start in range(0, batch.num_rows, chunk_rows):
                chunk = batch.slice(start, min(chunk_rows, batch.num_rows - start))
                pre = column_numpy(chunk, pre_column).astype(np.int64, copy=False)
                post = column_numpy(chunk, post_column).astype(np.int64, copy=False)
                endpoints = np.unique(np.concatenate((pre, post)))
                ids = np.union1d(ids, endpoints)
    finally:
        source.close()
    if len(ids) >= 2**31:
        raise ValueError("Dense neuron indices exceed the supported int32 target range")
    return ids


def iter_edge_chunks(
    path: Path,
    pre_column: str,
    post_column: str,
    weight_column: str,
    chunk_rows: int,
):
    source, reader = arrow_reader(path, [pre_column, post_column, weight_column])
    try:
        for batch_index in range(reader.num_record_batches):
            batch = reader.get_batch(batch_index)
            for start in range(0, batch.num_rows, chunk_rows):
                chunk = batch.slice(start, min(chunk_rows, batch.num_rows - start))
                yield (
                    column_numpy(chunk, pre_column).astype(np.int64, copy=False),
                    column_numpy(chunk, post_column).astype(np.int64, copy=False),
                    column_numpy(chunk, weight_column).astype(np.int64, copy=False),
                )
    finally:
        source.close()


def map_ids(root_ids: np.ndarray, ids: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    dense = np.searchsorted(root_ids, ids)
    valid = dense < len(root_ids)
    matched = np.zeros(len(ids), dtype=np.bool_)
    matched[valid] = root_ids[dense[valid]] == ids[valid]
    return dense.astype(np.int32, copy=False), matched


def hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--edges", type=Path, required=True, help="Official connectivity Feather file")
    parser.add_argument("--neurons", type=Path, required=True, help="Official neuron-annotation Feather file")
    parser.add_argument("--output", type=Path, required=True, help="New or empty output directory")
    parser.add_argument("--id-column", default="bodyId")
    parser.add_argument("--pre-column", default="body_pre")
    parser.add_argument("--post-column", default="body_post")
    parser.add_argument("--weight-column", default="weight")
    parser.add_argument("--min-synapses", type=int, default=1)
    parser.add_argument("--chunk-rows", type=int, default=1_000_000)
    parser.add_argument("--skip-hashes", action="store_true", help="Skip the final full-file SHA-256 reads")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.min_synapses < 1:
        print("--min-synapses must be at least 1", file=sys.stderr)
        return 2
    if args.chunk_rows < 1:
        print("--chunk-rows must be at least 1", file=sys.stderr)
        return 2
    if not args.edges.is_file() or not args.neurons.is_file():
        print("Both input files must exist", file=sys.stderr)
        return 2
    if args.output.exists():
        if not args.output.is_dir():
            print(f"Output path exists and is not a directory: {args.output}", file=sys.stderr)
            return 2
        if any(args.output.iterdir()):
            print(f"Refusing to overwrite a non-empty output directory: {args.output}", file=sys.stderr)
            return 2

    try:
        args.output.mkdir(parents=True, exist_ok=True)
        annotation_ids = read_neuron_ids(args.neurons, args.id_column, args.chunk_rows)
        root_ids = collect_graph_ids(
            args.edges, annotation_ids, args.pre_column, args.post_column, args.chunk_rows
        )
        n_neurons = len(root_ids)
        annotated_mask = np.isin(root_ids, annotation_ids, assume_unique=True)
        print(f"Neuron catalog: {n_neurons:,} unique graph IDs")
        print(f"With supplied annotation rows: {int(np.count_nonzero(annotated_mask)):,}")

        row_counts = np.zeros(n_neurons, dtype=np.uint64)
        edge_rows = 0
        eligible_rows = 0
        unmapped_rows = 0
        for pre, post, count in iter_edge_chunks(
            args.edges, args.pre_column, args.post_column, args.weight_column, args.chunk_rows
        ):
            edge_rows += len(count)
            if np.any(count < 0):
                raise ValueError("Connectivity weights contain negative synapse counts")
            src, src_ok = map_ids(root_ids, pre)
            dst, dst_ok = map_ids(root_ids, post)
            keep = src_ok & dst_ok & (count >= args.min_synapses)
            unmapped_rows += int(np.count_nonzero(~(src_ok & dst_ok)))
            eligible_rows += int(np.count_nonzero(keep))
            if np.any(keep):
                row_counts += np.bincount(src[keep], minlength=n_neurons).astype(np.uint64)

        row_ptrs = np.zeros(n_neurons + 1, dtype=np.uint64)
        np.cumsum(row_counts, out=row_ptrs[1:])
        n_edges = int(row_ptrs[-1])
        if n_edges == 0:
            raise ValueError("No edges remain after ID mapping and the requested threshold")
        print(f"Edges retained: {n_edges:,} of {edge_rows:,}")
        if unmapped_rows:
            print(f"Warning: {unmapped_rows:,} source rows include IDs absent from annotations; those rows are excluded")

        targets_path = args.output / "targets.npy"
        counts_path = args.output / "synapse_counts.npy"
        targets = np.lib.format.open_memmap(
            targets_path, mode="w+", dtype=np.int32, shape=(n_edges,)
        )
        synapse_counts = np.lib.format.open_memmap(
            counts_path, mode="w+", dtype=np.uint32, shape=(n_edges,)
        )
        written = np.zeros(n_neurons, dtype=np.uint64)
        edge_rows_second_pass = 0

        for pre, post, count in iter_edge_chunks(
            args.edges, args.pre_column, args.post_column, args.weight_column, args.chunk_rows
        ):
            edge_rows_second_pass += len(count)
            src, src_ok = map_ids(root_ids, pre)
            dst, dst_ok = map_ids(root_ids, post)
            keep = src_ok & dst_ok & (count >= args.min_synapses)
            if not np.any(keep):
                continue
            src = src[keep]
            dst = dst[keep]
            count = count[keep]
            order = np.argsort(src, kind="stable")
            sorted_src = src[order]
            boundaries = np.r_[0, np.flatnonzero(sorted_src[1:] != sorted_src[:-1]) + 1]
            group_sizes = np.diff(np.r_[boundaries, len(sorted_src)])
            group_numbers = np.repeat(np.arange(len(boundaries)), group_sizes)
            within_group = np.arange(len(sorted_src), dtype=np.uint64) - boundaries[group_numbers]
            unique_src = sorted_src[boundaries]
            positions = (row_ptrs[sorted_src] + written[sorted_src] + within_group).astype(np.intp, copy=False)
            targets[positions] = dst[order]
            if np.any(count > np.iinfo(np.uint32).max):
                raise ValueError("A synapse count exceeds uint32 range")
            synapse_counts[positions] = count[order].astype(np.uint32, copy=False)
            written[unique_src] += group_sizes.astype(np.uint64)

        targets.flush()
        synapse_counts.flush()
        del targets
        del synapse_counts
        if edge_rows != edge_rows_second_pass or not np.array_equal(written, row_counts):
            raise RuntimeError("The two data passes disagree; output was not finalized")

        row_ptrs_path = args.output / "row_ptrs.npy"
        root_ids_path = args.output / "root_ids.npy"
        annotated_path = args.output / "annotated_mask.npy"
        np.save(row_ptrs_path, row_ptrs)
        np.save(root_ids_path, root_ids)
        np.save(annotated_path, annotated_mask)
        manifest = {
            "connectome": "MaleCNS",
            "release": "v1.0",
            "dataset_id": "male-cns:v1.0",
            "license": "CC BY; retain official attribution",
            "edge_orientation": "outgoing CSR: row i contains targets reached by a spike from neuron i",
            "weight_semantics": "unsigned anatomical edge weights copied from the official weight table; transmitter sign and model scaling are not applied",
            "neuron_count": n_neurons,
            "annotated_neuron_count": int(np.count_nonzero(annotated_mask)),
            "unannotated_neuron_count": int(n_neurons - np.count_nonzero(annotated_mask)),
            "edge_rows_in_source": edge_rows,
            "edges_retained": n_edges,
            "min_synapses": args.min_synapses,
            "unmapped_edge_rows": unmapped_rows,
            "dense_index_order": "ascending source body ID",
            "files": {
                "row_ptrs": row_ptrs_path.name,
                "root_ids": root_ids_path.name,
                "annotated_mask": annotated_path.name,
                "targets": targets_path.name,
                "synapse_counts": counts_path.name,
            },
            "input_files": {
                "connectivity": args.edges.name,
                "annotations": args.neurons.name,
            },
            "sha256": None if args.skip_hashes else {
                "connectivity": hash_file(args.edges),
                "annotations": hash_file(args.neurons),
            },
            "status": "structural import only; not a simulation-ready signed weight matrix",
        }
        (args.output / "manifest.json").write_text(
            json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
        )
        print(f"CSR files and manifest written to {args.output}")
        return 0
    except Exception as error:
        print(f"Import failed: {error}", file=sys.stderr)
        print("Any partial outputs are confined to the specified output directory.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

