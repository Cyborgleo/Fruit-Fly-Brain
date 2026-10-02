# TODO: FlyBrain Sandbox

**Status:** Active build — viewer/environment increment implemented; MaleCNS data inventoried; connectome processing and closed-loop biology remain  
**Created:** 3 October 2026  
**Goal:** Build a biologically grounded 3D-plus-time simulation of a fruit fly that a user can watch, follow, inspect, and eventually interact with. “4D” means 3D space changing over time.

This checklist consolidates the PRD, TRD, and two research notes in this folder. The notes contain useful design proposals, but several figures and implementation claims still need checking against primary sources and working prototypes.

## Build progress

- [x] Create a local project scaffold and no-build browser viewer.
- [x] Replace the grid arena with a large, daylight meadow/orchard-edge world: procedural uneven terrain, distant hills, grove trees, shrubs, grass, rocks, and flowers.
- [x] Add Follow, Orbit, and first-person Explore cameras; mouse look, WASD movement, run speed, custom reticle, and full-screen viewing.
- [x] Improve the procedural fly with a male fruit-fly silhouette, compound-eye facets, legs, halteres, wings, antennae, and exploratory walking/short-flight/feeding animation.
- [x] Label placeholder movement and neural activity clearly; no connectome or body physics is claimed as active.
- [x] Add a generic small-network NumPy LIF reference kernel, footer-only Arrow/Feather schema reader, and chunked MaleCNS structural CSR importer.
- [x] Inventory all 2,470 files in `images and something` (about 22.94 GB) and identify seven MaleCNS v1.0 Feather tables with their real column schemas.
- [x] Keep large source tables and reference images out of the application and Git tracking.
- [ ] Run the structural importer against the local MaleCNS tables. The full tables are present, but PyArrow is not installed in the available Python runtime and no import has been run.
- [ ] Apply validated neurotransmitter signs/model weights, validate the neural model against a published result, and connect it to a physics-based fly body.

See `flybrain-sandbox/docs/ASSET_AUDIT.md` for the detailed folder inventory. The current fly movement, brain overlay, and activity trace remain illustrative; no neuron is driving the body yet.

## Scientific and scope notes

- A connectome is a wiring diagram, not a complete recording of a living brain. Synapse counts, predicted transmitter signs, and simplified neuron models do not supply all biological weights, ion channels, modulation, learning, or internal state. Describe the project as a **connectome-driven model**, and state its limits in the app.
- The documents name two different connectomes. FlyWire v783 is the adult female brain dataset used by the published Shiu et al. LIF model. MaleCNS v1.0 is the newer complete adult male central nervous system, including brain and ventral nerve cord (VNC). They are different specimens and data products; do not combine their neuron IDs or silently treat one model’s validation as proof for the other.
- **Working recommendation:** assess MaleCNS first for the intended brain-to-body loop because it includes the brain and VNC in one connectome. Keep FlyWire plus Shiu’s published model as a reference benchmark. Confirm data access, model assumptions, compute needs, and a first behavior before locking this choice.
- Existing fly body simulators provide a detailed articulated body and physics; they do not by themselves make the connectome control that body. Keep the sensory mapping, neural model, and motor interface visible and documented.
- Treat browser-side WebGPU, full-network live operation, fixed edge-pruning targets, “zero-copy” neural rendering, and 60 FPS neural computation as hypotheses to benchmark. A 60 FPS viewer for recorded playback is a separate and more tractable target.

## P0 — Decide the first build

- [ ] Write a one-page v1 scope: fly sex/model, desktop or browser, supported hardware, first environment, first behavior, and what “realistic” means for this release.
- [ ] Choose the first behavior based on available evidence and data. Compare walking/turning, odor or food seeking, feeding, and grooming; select one measurable behavior for the first end-to-end demonstration.
- [ ] Compare MaleCNS v1.0 and FlyWire v783 for that behavior: coverage, annotations, model support, data volume, access steps, and licensing/attribution.
- [ ] Record the connectome decision and version in a short decision note. Proposed path: MaleCNS for the integrated CNS experiment; FlyWire/Shiu for a reproducible published-model reference.
- [ ] Compare NeuroMechFly v2 (FlyGym) and FlyBody against the behavior and desired body detail. Check operating system support, control interface, sensory support, GPU/CPU needs, and licenses before choosing one.
- [ ] Inspect the actual development computer: CPU, RAM, GPU/VRAM, operating system, and preferred target browser. Use this to set performance goals rather than assuming a “consumer GPU.”
- [ ] Choose a staged run mode: recorded simulation and smooth replay first; live simulation after timing the neural model and physics loop.
- [ ] Create a model card outline that names the connectome, body model, dynamics, sensor and motor mappings, unsupported biology, and known limitations.

## P1 — Verify research, data, and feasibility

- [ ] Check every numerical claim carried forward from the four source notes against the cited paper or official data page. Resolve neuron/synapse counts, data versions, neuron-model parameters, and pruning numbers.
- [ ] Read the MaleCNS v1.0 release documentation and peer-reviewed connectome paper. Confirm access requirements, bulk-file sizes, available annotations/morphologies, coordinate units, and CC-BY attribution requirements.
- [ ] Read Shiu et al. (2024) and run its released FlyWire model using the documented configuration. Save the code version, dataset version, parameters, and a known output as a baseline.
- [ ] Review current MaleCNS brain/VNC modeling and walking-circuit results. Decide which published outputs can validate a MaleCNS implementation and which remain open assumptions.
- [ ] Review the public Eon embodied-fly technical description as an integration case study. Separate the reported connectome-derived signals from its body controllers and imitation components; do not treat a visual demo as biological validation.
- [ ] Download only a small official data sample first. Verify schema, stable neuron-ID mapping, missing values, coordinate transforms, neurotransmitter confidence, and annotations before attempting a full dataset download.
- [ ] Measure data preparation time and memory for a sample, then estimate full-data storage, RAM, GPU memory, and download needs. Keep raw data outside version control.
- [ ] Define a connectivity policy: transmitter-to-sign assumptions, treatment of unknown transmitters, connection thresholds, and whether/how to prune. Compare pruned and unpruned behavior on a named benchmark before selecting a threshold.
- [ ] Define the first scientific benchmark and control conditions. Include a real-connectome run, an appropriate ablation or shuffled-network comparison, and a measurable behavior/output where the literature supports one.

## P2 — Build a small, inspectable vertical slice

- [ ] Set up the repository, environment lockfiles, ignored data/recording directories, dataset manifest, and source/credit file.
- [ ] Build a tiny data pipeline that maps source IDs to dense indices, emits sparse connectivity and a searchable neuron catalog, and records source hashes and transforms.
- [ ] Add data integrity checks for duplicate/unknown IDs, edge orientation, sign assignment, counts, non-finite values, and coordinate units.
- [ ] Implement a simple, transparent reference spiking simulator behind a stable interface. Keep every neuron and synapse parameter in versioned configuration; do not infer missing values from library defaults without labeling them.
- [ ] Reproduce one result from the published FlyWire/Shiu model before adapting the model to another connectome.
- [ ] Implement a toy sensor-to-neuron-to-output loop with one documented stimulus and a few identified neurons/groups. Make it possible to stimulate and silence selected cells.
- [ ] Load the selected fly body in its native simulator and demonstrate stable walking with its established controller, without connectome coupling.
- [ ] Couple the toy neural output to one high-level body control channel and send body/sensor state back into the simulation. Record what is neural output and what is supplied by the body controller.
- [ ] Save a short deterministic recording with the scenario, seed, dataset/config versions, neural activity, body state, and stimulus events.

## P3 — Make the spectator experience

- [ ] Build a 3D scene with a detailed fly body, a simple arena, lighting, scale cues, and readable controls.
- [ ] Add spectator camera modes: free/orbit, smooth follow, and fly-eye view. Keep camera movement independent of simulation state.
- [ ] Show brain activity at multiple detail levels: neuropil/region overview, selected neuron skeletons, and detailed morphology for selected cells. Avoid drawing every neuron as a full mesh by default.
- [ ] Align brain morphologies, neuropils, and the body view to documented coordinate transforms; let users select a neuron and inspect its name/ID, type, region, transmitter prediction, partners, and recent activity.
- [ ] Add timeline playback controls: play, pause, speed, scrub, jump to stimulus/event, and replay from a saved recording.
- [ ] Add filters for brain region and cell class, plus a color-blind-safe activity scale and a low-activity baseline that remains visually legible.
- [ ] Measure viewer frame rate, startup time, geometry memory, and seek delay on the target machine. Use level of detail and visibility filtering where measurements require it.

## P4 — Scale and validate the simulation

- [ ] Run the chosen reference model on the full selected dataset and record neurons/edges included, time step, throughput, memory, spike rates, and deviations from published results.
- [ ] Benchmark CPU and available GPU approaches on representative data. Compare event-driven propagation with sparse matrix-vector approaches; retain only methods that match the reference within declared tolerances.
- [ ] If testing WebGPU, verify device limits, buffer formats, synchronization between compute passes, race-free synaptic accumulation, browser support, and neural-state/rendering data sharing. Report unsupported devices clearly.
- [ ] Add refractory state, synaptic delays/currents, external inputs, reset/silence controls, snapshots, and deterministic resume only as supported by the chosen reference model.
- [ ] Implement the first sensory encoder from a validated circuit and environment signal. Document units, gain, nonlinearity, left/right mapping, and unsupported sensory detail.
- [ ] Implement the first motor decoder from identified downstream pathways. Compare neural activity with the body command and retain any CPG/learned body controller as a clearly named downstream component.
- [ ] Run repeated behavior trials with fixed seeds and chosen controls. Compare trajectories or event rates against a stated behavioral measure, and record failure cases as well as successes.
- [ ] Only after the validated offline loop works, profile a live closed-loop run and decide whether real-time, slower-than-real-time, or replay is the right v1 experience.

## P5 — Experiments, reproducibility, and release

- [ ] Add scenario files for the first behavior, arena, seed, stimuli, connectome release, model parameters, and decoder configuration.
- [ ] Add experiment controls to stimulate/silence a neuron group, change a simple environmental stimulus, and branch from a recorded point when snapshots permit.
- [ ] Export spikes and body trajectories in documented formats; include the manifest and all model assumptions with each recording.
- [ ] Verify deterministic replay for a fixed scenario and document any nondeterminism from GPU kernels or physics.
- [ ] Complete the model card, setup guide, data credits, licenses, citations, and a short demonstration showing the actual loop and its limits.
- [ ] Package and publish only after data redistribution terms and asset licenses have been checked for the chosen hosting method.

## v1 completion checklist

- [ ] The selected connectome version and included neuron/edge counts are documented and reproducible.
- [ ] At least one defined sensory stimulus travels through the model and produces a measurable body response through a documented interface.
- [ ] The behavior passes a stated comparison with its benchmark and controls; visual plausibility alone does not count as validation.
- [ ] A user can watch a saved run, change camera, inspect activity, and scrub/replay the timeline.
- [ ] Viewer performance and simulation speed are reported separately on named hardware.
- [ ] The app identifies the model as an approximation and explains what the connectome and simulator leave out.

## Primary references to verify and use

- [MaleCNS v1.0 official download and data documentation](https://male-cns.janelia.org/download/) — release files, formats, coordinate spaces, and license.
- [Berg et al., complete male central nervous system connectome (Cell, 2026)](https://doi.org/10.1016/j.cell.2026.08.015) — MaleCNS scale and brain-to-VNC coverage.
- [FlyWire adult brain connectome (Nature, 2024)](https://doi.org/10.1038/s41586-024-07558-y) — 139,255-neuron female brain dataset.
- [Shiu et al., computational Drosophila brain model (Nature, 2024)](https://doi.org/10.1038/s41586-024-07763-9) — published LIF model and sensorimotor findings.
- [NeuroMechFly v2 (Nature Methods, 2024)](https://doi.org/10.1038/s41592-024-02497-y) — articulated fly body, sensing, and MuJoCo-based simulation framework.
- [FlyBody whole-body physics model (Nature, 2025)](https://doi.org/10.1038/s41586-025-09029-4) and [official repository](https://github.com/TuragaLab/flybody) — alternative body model and locomotion tasks.
- [Eon’s technical description of its embodied-fly prototype](https://eon.systems/updates/embodied-brain-emulation) — useful integration reference; the page describes ongoing work and explicit interface/controller simplifications.

## Source documents consolidated

- `PRD_ FlyBrain Sandbox.md`
- `TRD_ FlyBrain Sandbox.md`
- `Virtual Fly Brain Simulation Research.md`
- `Virtual Fruit Fly Simulation.md`
