# Local research asset audit

Inventory performed on 3 October 2026 for the workspace folder `images and something`.

## Overview

- 2,470 files across the supplied files and unpacked reference directories.
- Approximately 22.94 GB total on disk.
- Seven MaleCNS v1.0 Feather tables are present; their Arrow IPC schemas were read from the end-of-file metadata only. The multi-gigabyte column data were not loaded into memory.
- The original reference pictures, downloaded archives, and scientific source data remain in the parent workspace. None are copied into this app or committed to GitHub.

## MaleCNS v1.0 data tables

| File | Size (approx.) | Schema / likely role |
| --- | ---: | --- |
| `connectome-weights-male-cns-v1.0-minconf-0.5.feather` | 0.98 GB | `body_pre`, `body_post`, `weight`; neuron-to-neuron weighted connectivity |
| `body-annotations-male-cns-v1.0-minconf-0.5.feather` | 13.8 MB | `bodyId`, cell type, class, side, region and related annotations |
| `body-neurotransmitters-male-cns-v1.0.feather` | 41.3 MB | `body`, predicted / consensus transmitter, prediction confidence |
| `body-stats-male-cns-v1.0-minconf-0.5.feather` | 0.72 GB | `body`, pre/post counts, cell class/type and synaptic statistics |
| `syn-partners-male-cns-v1.0-minconf-0.5.feather` | 6.31 GB | presynaptic and postsynaptic body IDs, coordinates, confidence and contact role |
| `syn-points-male-cns-v1.0-minconf-0.5.feather` | 12.16 GB | individual synapse coordinates, labels, compartments and body IDs |
| `tbar-neurotransmitters-male-cns-v1.0.feather` | 2.47 GB | T-bar point IDs, body IDs, coordinates and per-transmitter probabilities |

The useful first structural import is the weighted connectivity table plus the neuron annotation table. The transmitter tables support later transmitter-aware modeling. Transmitter predictions and anatomical weights are not physiological current values; any sign and scaling rules need explicit model configuration and validation.

## Other supplied files

- Six fly-brain images are available as visual anatomy references. They include central-brain/VNC renderings, an AOTU008 sexually dimorphic neuron illustration, and a CNS overview. They are not mesh or motion-capture data.
- `41467_2023_Article_42931.pdf` is Mehta et al., “Online conversion of reconstructed neural morphologies into standardized SWC format” (Nature Communications, 2023; DOI [10.1038/s41467-023-42931-x](https://doi.org/10.1038/s41467-023-42931-x)). It is relevant to later morphology-file conversion and exchange, but it is not a MaleCNS behavior or connectome-simulation paper.
- `neuroglancer-master.zip` and its unpacked directory are a viewer-code reference, not MaleCNS connectome data.
- `navis-flybrains-main.zip` and its unpacked directory contain navis/flybrain assets and coordinate-template resources. They may help with later morphology display, but they are not a whole-fly body model.
- `flywire_annotations-main` and `flyem-snapshot-master` are reference source directories for other connectome resources. They should not be silently mixed with MaleCNS body IDs.
- `n5-master` is a storage-format library/reference, not a dataset.
- Several zip archives duplicate their unpacked source folders. Keep the originals as they are; avoid re-importing both copies into the simulation workspace.

## Current data boundary

`data/inspect_feather_schema.py` reads only the Arrow IPC footer, so it can inspect a large Feather file without a `pyarrow` install or a full-table scan. The actual chunked importer in `data/build_malecns_csr.py` still requires the project requirements (including PyArrow), processes the source connectivity data, and has not yet been run on the full files. Generated arrays and local raw inputs are excluded from version control.

## Attribution and sharing

Keep Janelia's MaleCNS dataset citation and CC BY attribution with any public outputs. Raw data, user-provided images, and bundled reference repositories are intentionally not included in this project upload; check their individual licenses before redistributing any derived asset.
