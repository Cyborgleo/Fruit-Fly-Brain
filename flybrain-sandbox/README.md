# FlyBrain Sandbox

FlyBrain Sandbox is a local-first 3D-plus-time field simulation for observing a male fruit fly in a daylight meadow and orchard-edge habitat. The viewer now has a first-person Explore camera, free orbit, close Follow view, a large procedural landscape, a more detailed fly model, and a playback timeline.

## Open the viewer

Requires Node.js 20 or newer. From this folder, run:

    node server.mjs

Then open [http://localhost:4173](http://localhost:4173). The static viewer uses browser WebGL and does not need an npm install.

Choose **Explore** for first-person WASD movement and mouse look, **Orbit** to inspect the habitat, or **Follow** to see the fly at macro scale. Fullscreen expands the simulation panel. Use the timeline to pause, scrub, and replay the illustrative behavior.

## Current biological status

The `images and something` folder contains the MaleCNS v1.0 tables: neuron annotations, neuron-level transmitter predictions, body statistics, weighted connections, synapse partners, synapse points, and transmitter predictions at T-bars. The total folder is about 22.9 GB. Their Feather schemas were read from the small Arrow file footers without loading the table bodies. See [docs/ASSET_AUDIT.md](docs/ASSET_AUDIT.md) for the full inventory summary.

The viewer does **not yet load or run this connectome**. Its wandering, short flights, and feeding pauses are procedural demonstrations; the brain-shaped overlay and activity line are illustrative. The imported MaleCNS connectivity must still be prepared as a sparse network, assigned a documented dynamics model, connected to sensory and motor pathways, and compared with evidence. This project does not claim the simulated fly has feelings or consciousness.

The network data and images stay in the workspace and are excluded from version control. For schemas, use the small footer-only reader:

    python data/inspect_feather_schema.py "path/to/*.feather"

For chunked structural connectivity import, install the listed Python requirements and see `data/README.md`. The importer prepares outgoing sparse connectivity; it does not make an empirically validated neuron model by itself.

## Project areas

- `viewer/` — interactive 3D habitat and spectator controls.
- `data/` — dataset schema and chunked MaleCNS preprocessing.
- `sim/` — small-network leaky integrate-and-fire reference kernel.
- `docs/` — model limitations, architecture, and local asset audit.
- `configs/` — versioned experiment configuration area.

The complete build checklist is in [docs/TODO_FlyBrain_Sandbox.md](docs/TODO_FlyBrain_Sandbox.md).
