# PRD: FlyBrain Sandbox — A Connectome-Driven Drosophila Simulation You Can Watch

**Version:** 0.1 (draft) | **Owner:** Lerin Liju | **Date:** 3 Oct 2026

---

## 1. Summary

Build an interactive simulation in which a virtual *Drosophila melanogaster* (fruit fly) is controlled by a spiking model of its **real, complete brain wiring diagram**, placed inside a 3D physics sandbox, and viewable by a spectator who can watch the fly live, scrub through time, and look inside the brain as neurons fire.

"4D" in this document means **3D space + time**: a 3D fly body and brain, with a timeline you can play, pause, rewind and replay.

## 2. Background and a Key Clarification

The complete adult fly brain map is the **FlyWire connectome** (released 2023–2024; published in *Nature*, October 2024): about **139,000 neurons** and **over 50 million synapses**, with neuron types, neurotransmitter predictions and 3D neuron shapes. It was produced by the FlyWire consortium (Princeton, Cambridge, and many volunteers/proofreaders) using electron-microscopy data and **Google's AI segmentation tools**. Janelia's *hemibrain* (about 25,000 neurons, a partial brain) is a separate, older dataset. Use **FlyWire**, not hemibrain, for the "complete" brain.

**What the connectome is and isn't.** It tells us *who connects to whom* and roughly how strongly. It does **not** directly give synaptic weights in physical units, ion-channel dynamics, neuromodulation, or learning rules. So this project is a *connectome-constrained approximation* of a fly brain, not an exact digital copy. This must be stated clearly in the product so nobody mistakes it for a literal upload of a fly.

**Related work to build on (not reinvent):**

- Shiu et al. (2024), a leaky integrate-and-fire brain model built on FlyWire that predicted sensorimotor circuits (open-source code).
- **NeuroMechFly / flygym** (EPFL), a MuJoCo-based biomechanical fly body with walking controllers.
- **flybody** (Google DeepMind / HHMI Janelia), a MuJoCo fly body model capable of walking and flying.
- **Brian2** or custom GPU code for spiking simulation.

## 3. Goals

1. Load the full FlyWire connectome (about 139k neurons) into a runnable spiking neural simulation.
2. Place a physically simulated fly body in a 3D sandbox and close the loop: **world → senses → brain → motor output → body → world**.
3. Provide a **spectator mode**: free camera, follow-cam, brain X-ray view with firing neurons highlighted, time scrubbing and replay.
4. Let users run **experiments**: stimulate a neuron or group, silence it, or change the environment, and see the behavioral effect.
5. Be reproducible and open: anyone can re-run a saved scenario.

## 4. Non-Goals (v1)

- Claiming biological exactness or "consciousness".
- Learning/plasticity (the connectome is static in v1).
- Full sensory realism (a proper visual system with all \~77k optic lobe neurons driven by rendered vision is a stretch goal).
- Multi-fly or social behavior.
- Mobile/VR support.

## 5. Target Users

| User | Need |
| --- | --- |
| **Spectator / curious learner** | Watch a fly and see what its brain is doing, no setup |
| **Student / hobbyist neuroscientist** | Poke circuits (e.g., "silence this neuron, what happens?") |
| **Researcher / developer** | Scriptable API to run experiments and export data |

Primary user for v1: the spectator and the student.

## 6. User Stories

- As a spectator, I open the app and see a fly walking in a small arena, with a toggle to reveal its brain glowing as neurons fire.
- As a spectator, I can pause, rewind 30 seconds, change camera angle and replay.
- As a student, I click a neuron type (e.g., a descending neuron) and stimulate it to see the fly react.
- As a student, I search for a neuron by name or type and see its shape and its upstream/downstream partners.
- As a researcher, I run a headless experiment via a Python script and export spike data and body trajectories.

## 7. Functional Requirements

### 7.1 Data layer

- **FR-1:** Ingest FlyWire connectivity, neuron annotations (type, neurotransmitter, region) and neuron meshes/skeletons from the official public releases. Pin a dataset version (e.g., a specific FlyWire materialization).
- **FR-2:** Store connectivity as a sparse matrix; precompute and cache simulation-ready artifacts.
- **FR-3:** Map neuron IDs to a human-readable catalog (searchable).

### 7.2 Brain simulation

- **FR-4:** Simulate the whole brain as spiking neurons (start with leaky integrate-and-fire, following published connectome-based models). Synaptic sign comes from predicted neurotransmitter (excitatory vs. inhibitory); weight scales with synapse count.
- **FR-5:** Run at a defined fixed time step (e.g., 0.1–1 ms) with a target of **near real-time on a single consumer GPU**; offline (slower than real-time) mode is acceptable for v1 on CPU.
- **FR-6:** Allow external input current to any neuron or neuron group at runtime.
- **FR-7:** Record spikes and optionally membrane potentials for replay and export.

### 7.3 Body and physics

- **FR-8:** Integrate an existing fly body model (NeuroMechFly/flygym or flybody in MuJoCo) rather than building one from scratch.
- **FR-9:** **Sensory mapping:** translate body/world signals (e.g., sugar/odor concentration, mechanosensation, simple visual cues, leg contact) into input currents to specific sensory neuron groups.
- **FR-10:** **Motor mapping:** translate activity of descending neurons into body commands (walking speed, turning, grooming, flight initiation). Start with a documented, simple mapping and a fallback to an existing locomotion controller modulated by brain output.
- **FR-11:** Provide a small set of environments: empty arena, arena with food source, arena with odor gradient.

### 7.4 Viewer / spectator

- **FR-12:** Real-time 3D rendering of the fly body and arena in-browser (WebGL/Three.js) or desktop (Unity/Godot), driven by streamed simulation state.
- **FR-13:** **Brain view:** render neuron meshes with color/brightness by firing rate; filter by brain region or neuron class.
- **FR-14:** **Timeline:** pause, play, speed control, scrub, and replay recorded sessions.
- **FR-15:** Camera modes: free orbit, follow-fly, first-person (fly's eye view).
- **FR-16:** Inspector panel: click a neuron to see ID, type, neurotransmitter, partners, and recent activity.

### 7.5 Experiments and tooling

- **FR-17:** UI controls to stimulate/silence neurons or groups.
- **FR-18:** Save and load scenarios (JSON config: seed, stimulation, environment).
- **FR-19:** Python API and headless CLI for batch runs; export spikes (Parquet/HDF5) and trajectories (CSV).

## 8. Non-Functional Requirements

| Area | Requirement |
| --- | --- |
| Performance | Viewer at 60 FPS on a mid-range laptop for playback; live sim near real-time on a single GPU (stretch), offline otherwise |
| Reproducibility | Deterministic runs given seed and dataset version |
| Scientific honesty | In-app "About this model" page listing assumptions and limits |
| Licensing | Respect FlyWire/Codex data licenses (check terms; cite required papers) |
| Portability | Runs on Linux/Windows/macOS; Docker image for headless mode |
| Cost | Develop on free/low-cost resources (local GPU, free cloud tiers, Colab/Kaggle for prototyping) |

## 9. Suggested Architecture

```
FlyWire data ──► Data prep (Python) ──► sparse connectivity + neuron catalog
                                              │
World/body (MuJoCo + flygym/flybody) ◄──► Sensorimotor bridge ◄──► Brain sim (Brian2 / PyTorch / CUDA)
                     │                                                    │
                     └──────────── State stream (WebSocket) ──────────────┘
                                              │
                                  Viewer (Three.js / WebGL)
                              body view · brain view · timeline · inspector
```

**Suggested stack (matches a full-stack/Python background):** Python for data, simulation and bridge; FastAPI + WebSockets for streaming; React + Three.js for the viewer; PostgreSQL or Parquet files for catalogs and recordings.

## 10. Milestones

| Phase | Deliverable | Rough effort |
| --- | --- | --- |
| **M0 – Research & setup** | Read FlyWire paper and Shiu et al.; run existing open-source brain model and flygym demos; confirm data access and licenses | 2–3 weeks |
| **M1 – Brain only** | Load full connectome, run spiking sim, stimulate sugar/mechanosensory neurons, reproduce a published result | 3–4 weeks |
| **M2 – Viewer v0** | Browser viewer showing neuron meshes lit by activity, with timeline | 3–4 weeks |
| **M3 – Body in the loop** | Fly body walking in MuJoCo with brain-driven commands (simple mapping) | 4–6 weeks |
| **M4 – Spectator polish** | Camera modes, replays, inspector, scenarios, shareable demo | 3–4 weeks |
| **M5 – Experiments & release** | Python API, docs, "About this model" page, public repo and demo video | 2–3 weeks |

(Effort assumes one student working part-time; adjust as needed.)

## 11. Success Metrics

- Full \~139k-neuron network loads and runs without crashing.
- Reproduces at least one published connectome-model finding (e.g., sugar-sensing → feeding-related neuron activation) within reasonable agreement.
- Fly performs at least one brain-driven behavior in the sandbox (e.g., orienting toward/walking to an odor or food source).
- Viewer sustains 60 FPS in playback; a new user can start spectating in under 2 minutes.
- Public repo with a working demo and documentation.

## 12. Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Connectome ≠ full biology (weights, dynamics unknown) | Behavior may not look "natural" | Be transparent; use published parameterizations; hybrid with existing locomotion controllers |
| Sensory/motor mapping is an open research problem | Fly may not move meaningfully | Start with narrow behaviors and well-characterized neurons; stub the rest |
| Compute requirements | Slow simulation | Sparse GPU implementation, smaller time steps only where needed, offline-then-replay mode |
| Large data and mesh sizes | Slow viewer | Level-of-detail meshes, region/type filtering, stream only visible neurons |
| Scope creep | Never ships | Strict v1 non-goals; milestone gates |
| Overclaiming ("we uploaded a fly brain") | Credibility | Clear labeling; cite sources |

## 13. Open Questions

1. Platform: browser-only, or desktop app (Unity/Godot) for better rendering?
2. Which first behavior to target: walking toward odor, feeding, grooming, or flight?
3. Real-time live brain sim, or precompute-and-replay for v1?
4. Hardware budget: local GPU available, or cloud only?
5. Open-source from day one?

## 14. Immediate Next Steps

1. Download FlyWire connectivity and annotations; verify license terms.
2. Run the open-source Shiu et al. brain model locally.
3. Run flygym or flybody demos to confirm the body-physics path.
4. Prototype a minimal viewer showing 100 neuron meshes colored by fake activity.
5. Decide the first target behavior and write its sensorimotor mapping spec.