# Architecture and implementation gates

## Current prototype

The viewer is a dependency-free WebGL page served by a small Node.js static server. It now renders a broad procedural meadow/orchard-edge environment, terrain, plants, a male fly model, and Follow / Orbit / first-person Explore camera modes. The walk, flight, feeding pauses, activity trace, and brain overlay are still illustrative. No connectome is loaded and no simulation API or physics adapter is active.

The local workspace includes MaleCNS v1.0 release tables. A standard-library Arrow footer reader confirms their schemas without loading the multi-gigabyte file bodies. The structural importer has not yet run; its Python dependency PyArrow is missing from the bundled runtime.

## Target data flow

1. Versioned official connectome release and morphology files.
2. Offline preprocessing that validates annotations, normalizes stable source IDs to dense simulation indices, and writes sparse connectivity plus a neuron catalog.
3. A reference spiking model with parameters in versioned configuration.
4. A replaceable sensorimotor bridge between simulated observations, identified neural groups, and the selected body simulator.
5. A session recorder that saves brain activity, body state, stimuli, configuration, seed, and dataset provenance.
6. A viewer that plays recordings smoothly and can optionally subscribe to live state.

## First proposed interfaces

### Neural simulator

- reset from a seed and configuration
- set sensory input for identified neuron indices
- stimulate or silence selected neurons
- step by simulation time
- return spikes, rates, and optional selected voltages
- snapshot and restore for deterministic replay when supported

### Body/world adapter

- observe body state and environmental signals
- apply a documented high-level motor command or neural output
- advance physics
- return renderable root pose, joint state, contacts, and world objects

### Viewer frame

The eventual versioned frame format should include simulation time, body pose and joints, world object state, region/class activity, an optional selected-neuron activity delta, and stimulus/event markers. Stream only subscribed neuron details.

## Gates before scaling

- Reproduce a published FlyWire/Shiu result with its documented model.
- Validate the MaleCNS data import and its own chosen benchmark independently.
- Compare simulator implementations against the reference on fixed inputs.
- Demonstrate one measured sensor-to-neural-to-body behavior with control conditions.
- Benchmark full-network memory, speed, viewer frame rate, and recording seek time on named hardware.
- Choose a live or replay-first release mode from measurements.

