# FlyBrain Sandbox Project

This repository contains the FlyBrain Sandbox viewer, its source documents, and the project plan. The project is an early research prototype for exploring a fruit fly in a large natural 3D habitat and for building toward a connectome-informed simulation.

## Run the current viewer

Install Node.js 20 or newer, open a terminal in `flybrain-sandbox`, and run:

```powershell
node server.mjs
```

Open <http://localhost:4173>. The current browser viewer is a procedural habitat and behavior preview. Its movement and visual neural activity are not yet driven by the MaleCNS connectome.

## Project files

- `flybrain-sandbox/` — viewer, data tooling, simulation notes, and architecture.
- `Docs by ai's/` — original PRD, TRD, research notes, and consolidated todo.
- `flybrain-sandbox/docs/TODO_FlyBrain_Sandbox.md` — implementation checklist.

## Data folder excluded from this repository

The complete `images and something/` folder is intentionally excluded from Git. It contains about 22.9 GB of source datasets, reference images, and downloaded tools. Re-download any needed MaleCNS files from the official sources listed in the project documentation after restoring this repository.

Large processed arrays, recordings, local package installations, and raw-data formats are also ignored. They should be regenerated locally from the documented source files.

## Scientific status

Structural connectivity alone is not a validated whole-animal brain simulation. The importer preserves anatomical edge counts; transmitter signs, synaptic dynamics, sensory pathways, motor control, body mechanics, and behavioral validation remain future work. The project does not claim to model subjective feelings or consciousness.
