# MaleCNS local data

The workspace already contains the official MaleCNS v1.0 Feather data family under `../images and something`. An audit found the weighted connection table, neuron annotations, two body-/T-bar transmitter tables, body statistics, synapse partners, and synapse points. Together with other reference files and unpacked repositories, the folder is about 22.9 GB. See [the asset audit](../docs/ASSET_AUDIT.md).

## Read schemas without loading data

The standard-library-only reader reads a Feather v2 / Arrow IPC footer. It does not scan or load the table body:

    python data/inspect_feather_schema.py "../images and something/connectome-weights-male-cns-v1.0-minconf-0.5.feather"

Use it on the other tables before changing column settings. The observed weighted-connectivity fields are `body_pre`, `body_post`, and `weight`; neuron annotations use `bodyId`.

## Prepare structural connectivity

Install `numpy` and `pyarrow` as listed in `requirements.txt`, then run the importer from the project folder:

    python data/build_malecns_csr.py --edges "../images and something/connectome-weights-male-cns-v1.0-minconf-0.5.feather" --neurons "../images and something/body-annotations-male-cns-v1.0-minconf-0.5.feather" --output "data/processed/malecns-v1.0" --skip-hashes

This streams the weighted-connectivity Feather file to collect every edge endpoint, then writes outgoing CSR arrays plus a manifest and an annotation mask. Nodes absent from the annotation table are retained in the graph and marked unannotated; edges are not discarded just because a neuron lacks a text label. The structural pipeline makes additional sequential passes over the 0.98 GB edge file. Omitting `--skip-hashes` makes another full read of both inputs for SHA-256.

The source `weight` values remain anatomical edge weights; they are not automatically LIF currents and do not provide a validated transmitter sign policy. `synapse_counts.npy` preserves these raw unsigned table weights; `root_ids.npy` maps dense row/target indices back to source body IDs; `annotated_mask.npy` says whether each indexed body had a matching annotation row.

The complete import is a multi-pass operation. Use `--skip-hashes` when a full-file hash has already been recorded; otherwise the hash adds another source read. The generated sparse arrays are local research artifacts and are excluded from version control. Check available storage before starting; the output contains one 32-bit target and one 32-bit weight for every source row.

## Reproducibility and attribution

Record the exact file names, release, confidence threshold, source URLs, download date, hashes, edge orientation, neuron-ID mapping, transmitter annotations and confidence, coordinate spaces, and all modeling assumptions in each dataset manifest. Never mix MaleCNS IDs with FlyWire IDs. The published FlyWire/Shiu model is a distinct female connectome and an appropriate comparison target, not proof that the MaleCNS model is equivalent.

MaleCNS is distributed under CC BY according to Janelia's release documentation. Preserve official attribution in derived/public work and verify the terms for each morphology, image, code, and processed dataset before sharing it.

Raw data and derived arrays are excluded by `.gitignore`; they must not be committed or uploaded to GitHub.
