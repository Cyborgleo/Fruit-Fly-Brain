# TRD: FlyBrain Sandbox — Technical Requirements Document

**Version:** 0.1 (draft) | **Owner:** Lerin Liju | **Date:** 3 Oct 2026 **Companion to:** FlyBrain Sandbox PRD v0.1

> Numeric model parameters, dataset version numbers and API details below are starting points taken from memory of the published literature and tools. **Verify each against the original papers, the FlyWire Codex documentation and the library docs before locking them in.**

---

## 1. Purpose and Scope

This document specifies *how* to build the system described in the PRD: a spiking simulation of the full FlyWire fruit fly connectome, coupled to a physically simulated fly body, streamed to a browser viewer with spectator tooling (live view, brain X-ray, timeline/replay, experiments).

In scope for v1: data pipeline, brain simulator, body/physics integration, sensorimotor bridge, streaming backend, viewer, recording/replay, Python API. Out of scope for v1: plasticity/learning, full rendered-vision pipeline, multi-fly, VR/mobile.

## 2. System Overview

```
                    ┌─────────────────────────────┐
                    │  FlyWire releases (offline) │
                    │  connections · annotations  │
                    │  meshes · skeletons         │
                    └──────────────┬──────────────┘
                                   │  (one-time ETL)
                                   ▼
                    ┌─────────────────────────────┐
                    │   Data store (Parquet/Zarr │
                    │   + .npz sparse matrices)   │
                    └───────┬─────────────┬───────┘
                            │             │
                ┌───────────▼───┐   ┌─────▼─────────────┐
                │  Brain Sim    │◄─►│ Sensorimotor Bridge│◄─►┌──────────────┐
                │ (spiking SNN) │   │ (encoders/decoders)│   │ Body + World │
                └───────┬───────┘   └────────────────────┘   │ (MuJoCo)     │
                        │                                      └──────┬───────┘
                        └──────────────┬──────────────────────────────┘
                                       ▼
                         ┌──────────────────────────┐
                         │ Session Orchestrator     │
                         │ (FastAPI, WebSocket,     │
                         │  recorder, scenario mgr) │
                         └─────────────┬────────────┘
                                       ▼
                         ┌──────────────────────────┐
                         │ Viewer (React + Three.js)│
                         └──────────────────────────┘
```

**Two execution modes**

| Mode | Description | v1 priority |
| --- | --- | --- |
| **Live** | Sim runs while the viewer watches; interactive stimulation | Best effort (near real-time) |
| **Record → Replay** | Sim runs headless or slower than real-time, writes a recording; viewer plays it with full scrubbing | **Must have** |

Replay mode is the safe baseline: it decouples simulation speed from viewer smoothness and makes scrubbing trivial.

## 3. Technology Stack

| Layer | Choice | Reason / alternative |
| --- | --- | --- |
| Language (core) | Python 3.11+ | Ecosystem for neuroscience and MuJoCo |
| Data access | `pandas`, `pyarrow`, `scipy.sparse`, FlyWire Codex downloads; `caveclient` / `cloud-volume` for meshes | Official tooling for FlyWire |
| Brain sim (baseline) | **Brian2** | Used by the published FlyWire LIF model; good for validation |
| Brain sim (fast) | **PyTorch** (GPU) or custom event-driven CPU/Numba/C++ kernel | Needed for speed; Brian2 is the correctness reference |
| Body / physics | **MuJoCo** via `flygym` (NeuroMechFly) and/or `flybody` | Existing validated fly bodies |
| Backend API | **FastAPI** + WebSockets | Matches existing full-stack skills |
| Serialization | MessagePack or FlatBuffers (binary) for streaming; JSON for control messages | Bandwidth |
| Recording storage | **Zarr** or HDF5 (state arrays), Parquet (spikes) | Chunked, scrubbing-friendly |
| Viewer | **React + Three.js** (`@react-three/fiber`) | WebGL in browser |
| Packaging | Docker (headless sim), `uv`/`pip` + lockfile | Reproducibility |
| CI | GitHub Actions (CPU tests, small-network integration tests) |  |
| Dev compute | Local machine for development; Colab/Kaggle/cloud GPU for full-scale runs | Budget friendly |

## 4. Data Pipeline (ETL)

### 4.1 Inputs

- **Connectivity table:** presynaptic neuron ID, postsynaptic neuron ID, neuropil/region, synapse count, predicted neurotransmitter (and confidence).
- **Neuron annotations:** cell class/type, super class, side, neuropil, flow (afferent/intrinsic/efferent), etc.
- **Geometry:** neuron meshes (large) and/or skeletons (SWC-like, much lighter), neuropil meshes.
- Pin **one release snapshot** (FlyWire "materialization" version used for the 2024 public release) and record it in a `dataset.lock` file with hashes.

### 4.2 Transforms

1. **ID normalization:** map the 64-bit root IDs to dense integer indices `0..N-1`; store the mapping.
2. **Connectivity matrix:** build a sparse matrix `W` (CSR, `float32`) of shape `N×N`: `W[post, pre] = sign(neurotransmitter) × synapse_count × w_scale`
   - Excitatory: acetylcholine. Inhibitory: GABA, glutamate (treated as inhibitory in published fly-brain models, since glutamate is often inhibitory in fly via GluCl; flag as a modeling assumption). Others/unknown: documented default.
   - Optionally drop connections below a synapse-count threshold (the published model uses one) to remove noise; keep the threshold configurable.
3. **Neuron table:** a dense Parquet table indexed by the integer index with class, type, neuropil, neurotransmitter, and flags for `sensory`, `descending`, `motor`, `ascending`.
4. **Geometry preprocessing:** simplify meshes (e.g., quadric decimation) to several levels of detail; export skeletons as binary line-segment buffers per neuron; export 78-ish neuropil meshes for the region-level view.
5. **Validation checks:** neuron count, total synapse count, no NaNs, matrix density, per-class counts compared with the paper's reported numbers.

### 4.3 Outputs

`/data/{release}/connectivity.npz`, `neurons.parquet`, `neuropils/*.glb`, `skeletons/*.bin`, `meshes_lod{0,1,2}/`, `dataset.lock`.

## 5. Brain Simulation Requirements

### 5.1 Neuron model (v1)

Leaky integrate-and-fire, one point neuron per FlyWire neuron:

```
dv/dt = (v_rest − v)/τ_m + I_syn(t) + I_ext(t)
spike when v ≥ v_thresh → v ← v_reset, refractory for t_ref
synaptic input: instantaneous or exponential-decay jump of (W · spikes_delayed)
```

Use the **published parameter set** from the connectome LIF model (membrane time constant on the order of 20 ms, synaptic time constant a few ms, small per-synapse weight in mV, \~2 ms refractory period, \~2 ms synaptic delay). Keep every parameter in a versioned YAML config. **Do not hard-code magic numbers.**

### 5.2 Numerical requirements

- Fixed time step `dt` configurable, default **0.1 ms**; support 1 ms for fast previews.
- Exact reproducibility given `(seed, dataset version, config)`.
- Float32 state; spike delivery via delay ring buffer (delay of \~2 ms means \~20 buffered steps at 0.1 ms).

### 5.3 Performance design

- At typical average firing rates (single digits of Hz), only a **tiny fraction of neurons spike per step**. An **event-driven** update (for each spiking neuron, add its outgoing weights into targets' input buffers) costs far less than a dense or full sparse matrix-vector multiply every step.
- Two implementations behind one interface `BrainSim`:
  1. `Brian2Sim` — reference, slow, used to validate.
  2. `FastSim` — PyTorch GPU (scatter-add of spiking rows) or Numba CPU; must match the reference within tolerance on a fixed test stimulus (spike-count correlation per neuron and population rate curves).
- Memory estimate: connectivity of tens of millions of non-zeros in CSR fits comfortably in a few hundred MB; state vectors are negligible. Target: **16 GB RAM minimum**, GPU with **8 GB+ VRAM** recommended but optional.

### 5.4 Interface

```python
class BrainSim(Protocol):
    def reset(self, seed: int) -> None: ...
    def set_input(self, neuron_idx: np.ndarray, current: np.ndarray) -> None: ...   # external drive
    def silence(self, neuron_idx: np.ndarray, on: bool) -> None: ...                # ablation/clamp
    def step(self, n_steps: int) -> StepResult: ...                                 # advance
    def get_spikes(self) -> SpikeBatch: ...                                         # since last call
    def get_rates(self, window_ms: float) -> np.ndarray: ...                        # per-neuron rates
    def snapshot(self) -> bytes: ...  # save state for exact resume
    def restore(self, blob: bytes) -> None: ...
```

## 6. Body and World Requirements

- Use **flygym (NeuroMechFly v2)** as the primary body: MuJoCo model with legs, joints, adhesion, and existing walking controllers. Evaluate **flybody** if flight is desired later.
- Physics time step as defined by the library (order of 0.1 ms); control/coupling at a slower interval (see §7).
- Arenas: flat floor, food patch, odor gradient field (analytic scalar field sampled at the antenna position), optional obstacles.
- Expose a `World` interface: `observe() -> Observation`, `apply(motor_command)`, `step(dt)`, `get_render_state()`.
- **Render state** sent to the viewer: body root pose + joint angles (`qpos`), contact flags, arena object poses. The viewer owns a static fly mesh rigged to those joints (derived from the MuJoCo model's geometry/meshes) so no per-frame mesh data is streamed.

## 7. Sensorimotor Bridge

This is the highest-risk component; design it as a replaceable, well-documented layer.

### 7.1 Coupling loop

```
every Δt_couple (default 5–10 ms of sim time):
    obs   = world.observe()
    I_ext = encoder(obs)                 # → input currents on sensory neuron groups
    brain.set_input(sensory_idx, I_ext)
    brain.step(Δt_couple / dt)
    rates = brain.get_rates(window)      # descending-neuron population rates
    cmd   = decoder(rates)               # → motor command
    world.apply(cmd); world.step(Δt_couple)
```

### 7.2 Encoders (sense → neurons)

| Modality | Source in world | Target neurons | v1 status |
| --- | --- | --- | --- |
| Gustatory (sugar/bitter) | Contact with food / substrate chemistry | Gustatory receptor neuron groups | **v1** |
| Olfactory | Odor concentration at left/right antenna | Olfactory receptor neuron groups by glomerulus (left/right separate for steering) | **v1** |
| Mechanosensory | Antennal/leg touch, wind | Johnston's organ / mechanosensory neurons | v1 (simple) |
| Proprioception / contact | Joint angles, leg contact | Leg sensory neurons (nerve cord is not in the brain-only dataset) | Stretch |
| Vision | Rendered or abstract luminance/looming | Photoreceptor/early optic lobe inputs | Stretch (v2) |

Encoders are small, documented functions (e.g., concentration → current via a saturating nonlinearity) with tunable gains.

### 7.3 Decoders (neurons → action)

- **Important constraint:** the FlyWire dataset is a *brain* connectome. The ventral nerve cord (motor circuitry for legs/wings) is a separate dataset. Therefore, for v1 the brain's output is the activity of **descending neurons** (the brain→body pathway), and a **decoder** converts that into high-level commands.
- Decoder v1: map identified descending neuron groups to command channels — e.g., forward-walking drive, left/right turning bias, backward walking, stop/groom/feeding triggers — using neuron types with published behavioral roles (e.g., steering and backward-walking descending neurons). Combine as weighted rate differences (left vs. right) to produce a turn command.
- The body executes the command through an existing locomotion controller (e.g., flygym's CPG-based or learned walking controller), parameterized by speed and turning.
- Keep decoders in config (`decoder.yaml`: neuron group → channel → gain) so they can be swapped and ablated.
- Optional later: incorporate the male adult nerve cord (MANC) connectome for a fully connectome-based body controller.

## 8. Streaming and API

### 8.1 Orchestrator (FastAPI)

- `POST /sessions` — create from a scenario config → `session_id`.
- `POST /sessions/{id}/control` — pause/resume, speed, stimulate/silence, reset.
- `GET /sessions/{id}/recording` — metadata, available time range.
- `WS /sessions/{id}/stream` — binary frames (live or replay playhead).
- `GET /neurons?query=` — search the neuron catalog; `GET /neurons/{id}` — details + partners.
- `GET /assets/...` — meshes, skeletons, neuropils (static, cacheable, served with HTTP compression/CDN-friendly headers).

### 8.2 Frame format (binary, \~30 Hz to the viewer)

| Field | Content | Size notes |
| --- | --- | --- |
| `t` | sim time (ms) | 8 B |
| `body` | root pose + joint angles | \~0.5 KB |
| `world` | dynamic object poses | small |
| `region_rates` | firing rate per neuropil/class (\~100–200 floats) | \~1 KB |
| `neuron_delta` | per-neuron activity **only for the viewer's current subscription** (visible/filtered subset), as `(index, uint8 intensity)` pairs | variable |
| `events` | stimulus on/off, markers | small |

The viewer sends a **subscription** (set of neuron indices or a filter such as "class = descending") so the server never streams all \~139k neurons by default (naively that is hundreds of KB per frame).

### 8.3 Recording format

- Spikes: Parquet (`t_ms`, `neuron_idx`), partitioned by time chunk.
- Body/world state: Zarr arrays at a fixed sample rate with chunking along time.
- Keyframes (full sim snapshots) every N seconds so replay seek is fast and "branching" from a past moment (what-if experiment) is possible.
- Manifest (`session.json`) containing scenario config, dataset lock hash, code git SHA and seed.

## 9. Viewer Requirements

- **Rendering:** Three.js, instanced rendering for neurons. Levels: (L0) neuropil shells colored by region rate; (L1) skeleton line segments for a selected subset (a class, region, or search result); (L2) full meshes for a few neurons on selection.
- **Budget:** keep draw calls low; use `LineSegments2`/instanced buffers; worker threads for decoding frames; target 60 FPS on integrated GPUs for L0/L1 with up to tens of thousands of visible skeleton segments per frame batch, degrading LOD automatically otherwise.
- **Fly body:** rigged mesh driven by streamed joint angles.
- **Timeline UI:** play/pause, speed (0.1×–10×), scrub bar with markers for stimulus events, jump-to-event.
- **Brain panel:** region/class filters, neuron search, click-to-inspect (ID, type, neurotransmitter, top upstream/downstream partners).
- **Camera:** orbit, follow, fly-eye first person.
- **Experiment panel:** choose neurons/groups, set stimulus amplitude/duration, silence toggle, run or branch from the current time.
- Accessibility: keyboard shortcuts, color-blind-safe activity colormap.

## 10. Repository Layout

```
flybrain-sandbox/
├─ data/                 # gitignored; dataset.lock tracked
├─ etl/                  # download, normalize, build matrices, mesh LOD
├─ sim/
│  ├─ brain/             # BrainSim protocol, brian2_ref.py, fast_sim.py
│  ├─ body/              # flygym/flybody adapters, World interface
│  ├─ bridge/            # encoders, decoders, configs (yaml)
│  └─ recorder/
├─ server/               # FastAPI app, WS streaming, scenario manager
├─ viewer/               # React + Three.js app
├─ scenarios/            # example JSON/YAML scenarios
├─ tests/                # unit, regression, integration
├─ docs/                 # model card, assumptions, how-to
└─ docker/
```

## 11. Testing and Validation

| Level | What | How |
| --- | --- | --- |
| Unit | ETL transforms, ID mapping, sign assignment, encoders/decoders | pytest on small fixtures |
| Numerical | `FastSim` vs `Brian2Sim` | Same seed/stimulus on the full or sub-network; compare per-neuron spike counts and population rates within tolerance |
| Scientific regression | Reproduce a published result, e.g., stimulating sugar-sensing neurons activates the feeding-related motor neurons reported in the paper; silencing an upstream node reduces it | Stored expected-result tests |
| Determinism | Same inputs → identical spike trains | Hash comparison in CI |
| Integration | Headless 10-second session with a toy body | CI on a small subnetwork |
| Performance | Steps/sec, memory, frame latency, viewer FPS | Benchmark scripts logged per commit |
| Behavioral | Fly turns toward the odor side more than chance across N seeds | Statistical test, not a single video |

## 12. Performance Budgets (targets)

| Metric | Target |
| --- | --- |
| Full-network sim speed (GPU, event-driven) | ≥ 1× real time (stretch); ≥ 0.1× acceptable for v1 |
| Full-network sim speed (CPU, offline) | Any, but a 10 s recording completes in reasonable time (minutes) |
| Bridge round-trip per couple step | \< 5 ms overhead |
| Viewer playback | 60 FPS (L0/L1) |
| Stream bandwidth | \< 2 MB/s per viewer typical |
| Seek in a recording | \< 1 s |
| Cold start to first frame (replay) | \< 5 s with assets cached |

## 13. Deployment

- **Local dev:** `docker compose up` (server + viewer); GPU optional.
- **Demo hosting:** precomputed recordings + static viewer on a free static host/CDN (replay needs no live GPU — the cheapest way to share publicly). Live mode behind an opt-in GPU backend.
- **Config management:** all runs defined by a scenario file; experiments are shareable by sending the file plus the dataset lock hash.

## 14. Security, Licensing and Ethics

- Check and respect FlyWire/Codex data terms and required citations; include attributions in the viewer and README.
- No user accounts in v1; if live sessions are public, rate-limit session creation and cap per-session compute.
- Sanitize scenario files (bounded neuron indices, amplitudes, durations) to prevent abuse.
- Clear in-app "Model card": what is simulated, what is assumed (neurotransmitter→sign, uniform weights, no neuromodulation, LIF dynamics), and what the model cannot do.

## 15. Risks and Technical Mitigations

| Risk | Mitigation |
| --- | --- |
| Sensorimotor mapping yields unnatural behavior | Narrow first behavior; keep decoder configurable; fall back to a controller modulated by a few brain-derived signals |
| Brain-only dataset lacks nerve cord | Use descending-neuron decoder in v1; evaluate MANC integration later |
| Viewer overwhelmed by geometry | LOD, subscriptions, region-level default view, skeleton instead of mesh |
| Simulation too slow | Event-driven kernel, larger `dt` for preview, record-and-replay baseline |
| Model fidelity doubts | Reference-vs-fast validation; reproduce published results; model card |
| Library/API drift (FlyWire, flygym, MuJoCo) | Pin versions; lockfiles; Docker image; adapter layer around each dependency |
| Solo-developer scope | Milestone gating; replay-first architecture; cut live mode if necessary |

## 16. Implementation Plan (aligned with PRD milestones)

| Milestone | Technical deliverable | Exit criteria |
| --- | --- | --- |
| **M0** | Environment, data downloaded, reference model and flygym demos running | Reproduce reference outputs locally |
| **M1** | ETL + `Brian2Sim` + `FastSim` with validation tests | Fast vs. reference agreement; one published result reproduced |
| **M2** | Recorder + replay server + viewer v0 (neuropil view, timeline) | Replay a recorded stimulus session in browser |
| **M3** | Body adapter, encoders/decoders v1, closed loop | Fly shows a brain-modulated behavior in the arena |
| **M4** | Viewer v1: skeleton LOD, inspector, camera modes, experiment panel, branching | A new user runs an experiment end-to-end |
| **M5** | Python API/CLI, docs, model card, Docker, public demo | Reproducible release |

## 17. Open Technical Decisions

1. GPU framework: PyTorch scatter-add vs. custom CUDA/Triton vs. CPU Numba event-driven (benchmark all three early on a sub-network).
2. Which body library first: flygym (more mature locomotion tooling) or flybody (flight capability).
3. Neuron geometry source/format for the browser (skeleton binary vs. glTF meshes) after measuring load times.
4. Whether to include the male adult nerve cord dataset in v1.5.
5. Live-mode hosting strategy (local-only vs. cloud GPU).

## 18. Reference Starting Points

- FlyWire connectome papers (Dorkenwald et al.; Schlegel et al., *Nature*, 2024) and the FlyWire Codex data portal.
- Shiu et al., connectome-based whole-brain LIF model of the fly (open-source code).
- NeuroMechFly v2 / `flygym` (EPFL) and `flybody` (DeepMind / Janelia) documentation.
- Brian2, MuJoCo, Three.js, FastAPI documentation.