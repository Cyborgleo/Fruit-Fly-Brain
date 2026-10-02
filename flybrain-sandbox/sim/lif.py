"""Small-network current-based LIF reference engine.

This module provides an inspectable simulation kernel for small networks. It
is not yet optimized for the full adult connectome. Connectivity rows are
outgoing: row_ptrs[i]:row_ptrs[i+1] lists targets reached by a spike from i.
Weights are signed current increments in mV/ms and must be prepared using a
versioned, documented modeling policy.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import numpy as np
from numpy.typing import NDArray


FloatArray = NDArray[np.float32]
IndexArray = NDArray[np.int64]


@dataclass(frozen=True)
class LIFConfig:
    """All model choices are explicit; there are no hidden defaults."""

    dt_ms: float
    tau_membrane_ms: float
    tau_synaptic_ms: float
    delay_ms: float
    refractory_ms: float
    v_rest_mv: float
    v_threshold_mv: float
    v_reset_mv: float

    def __post_init__(self) -> None:
        positive = {
            "dt_ms": self.dt_ms,
            "tau_membrane_ms": self.tau_membrane_ms,
            "tau_synaptic_ms": self.tau_synaptic_ms,
        }
        for name, value in positive.items():
            if not np.isfinite(value) or value <= 0:
                raise ValueError(f"{name} must be a finite positive number")
        if not np.isfinite(self.delay_ms) or self.delay_ms < 0:
            raise ValueError("delay_ms must be finite and non-negative")
        if not np.isfinite(self.refractory_ms) or self.refractory_ms < 0:
            raise ValueError("refractory_ms must be finite and non-negative")
        if not all(np.isfinite(v) for v in (self.v_rest_mv, self.v_threshold_mv, self.v_reset_mv)):
            raise ValueError("voltage parameters must be finite")
        if self.v_threshold_mv <= self.v_reset_mv:
            raise ValueError("v_threshold_mv must be greater than v_reset_mv")

    @property
    def delay_steps(self) -> int:
        # Preserve the intended delay while guaranteeing at least one step of
        # separation between a presynaptic spike and its postsynaptic effect.
        return max(1, int(round(self.delay_ms / self.dt_ms)))

    @property
    def refractory_steps(self) -> int:
        if self.refractory_ms == 0:
            return 0
        return max(1, int(np.ceil(self.refractory_ms / self.dt_ms)))


@dataclass(frozen=True)
class CSRConnectome:
    """Sparse outgoing adjacency with one row per dense neuron index."""

    row_ptrs: IndexArray
    targets: NDArray[np.int32]
    weights: FloatArray

    def __post_init__(self) -> None:
        row_ptrs = np.asarray(self.row_ptrs)
        targets = np.asarray(self.targets)
        weights = np.asarray(self.weights)
        if row_ptrs.ndim != 1 or len(row_ptrs) < 1:
            raise ValueError("row_ptrs must be a one-dimensional array of length N + 1")
        if targets.ndim != 1 or weights.ndim != 1 or len(targets) != len(weights):
            raise ValueError("targets and weights must be one-dimensional arrays of equal length")
        if row_ptrs[0] != 0 or row_ptrs[-1] != len(targets):
            raise ValueError("row_ptrs must start at 0 and end at the edge count")
        if np.any(row_ptrs[1:] < row_ptrs[:-1]):
            raise ValueError("row_ptrs must be monotonically non-decreasing")
        if len(targets) and (np.min(targets) < 0 or np.max(targets) >= self.n_neurons):
            raise ValueError("target index is outside the connectome")
        if not np.all(np.isfinite(weights)):
            raise ValueError("weights must be finite")

    @property
    def n_neurons(self) -> int:
        return len(self.row_ptrs) - 1

    @property
    def n_edges(self) -> int:
        return len(self.targets)

    @classmethod
    def load(cls, directory: str | Path, mmap_mode: str | None = "r") -> "CSRConnectome":
        folder = Path(directory)
        row_ptrs = np.load(folder / "row_ptrs.npy", mmap_mode=mmap_mode)
        targets = np.load(folder / "targets.npy", mmap_mode=mmap_mode)
        weights = np.load(folder / "weights.npy", mmap_mode=mmap_mode)
        return cls(row_ptrs=row_ptrs, targets=targets, weights=weights)


@dataclass(frozen=True)
class SpikeBatch:
    """Spikes emitted since the previous step call."""

    times_ms: NDArray[np.float64]
    neuron_indices: NDArray[np.int32]


class LIFNetwork:
    """Deterministic current-based LIF network for reference and small fixtures.

    Synaptic events add signed current increments to a delayed sparse queue.
    Each step decays synaptic current exponentially, integrates membrane
    voltage, applies threshold/reset/refractory behavior, and propagates new
    spikes along outgoing CSR rows.

    The event propagation loop is intentionally straightforward. It is useful
    as a correctness baseline on small subnetworks, not as a full-network
    performance implementation.
    """

    def __init__(self, connectome: CSRConnectome, config: LIFConfig):
        self.connectome = connectome
        self.config = config
        self.n = connectome.n_neurons
        self.v = np.empty(self.n, dtype=np.float32)
        self.i_syn = np.zeros(self.n, dtype=np.float32)
        self.i_external = np.zeros(self.n, dtype=np.float32)
        self.silenced = np.zeros(self.n, dtype=np.bool_)
        self.refractory_left = np.zeros(self.n, dtype=np.int32)
        self._delay_ring = np.zeros(
            (config.delay_steps + 1, self.n), dtype=np.float32
        )
        self._delay_cursor = 0
        self.step_index = 0
        self._recent_spikes: deque[tuple[int, NDArray[np.int32]]] = deque()
        self.reset()

    @property
    def time_ms(self) -> float:
        return self.step_index * self.config.dt_ms

    def reset(self) -> None:
        self.v.fill(self.config.v_rest_mv)
        self.i_syn.fill(0)
        self.i_external.fill(0)
        self.silenced.fill(False)
        self.refractory_left.fill(0)
        self._delay_ring.fill(0)
        self._delay_cursor = 0
        self.step_index = 0
        self._recent_spikes.clear()

    def set_input(self, neuron_indices: Iterable[int], current_mv_per_ms: float | Iterable[float]) -> None:
        indices = np.asarray(list(neuron_indices), dtype=np.int64)
        self._validate_indices(indices)
        values = np.asarray(current_mv_per_ms, dtype=np.float32)
        if values.ndim == 0:
            values = np.full(len(indices), values.item(), dtype=np.float32)
        if values.ndim != 1 or len(values) != len(indices):
            raise ValueError("input current must be a scalar or one value per neuron index")
        if not np.all(np.isfinite(values)):
            raise ValueError("input currents must be finite")
        self.i_external[indices] = values

    def clear_input(self, neuron_indices: Iterable[int] | None = None) -> None:
        if neuron_indices is None:
            self.i_external.fill(0)
            return
        indices = np.asarray(list(neuron_indices), dtype=np.int64)
        self._validate_indices(indices)
        self.i_external[indices] = 0

    def silence(self, neuron_indices: Iterable[int], on: bool = True) -> None:
        indices = np.asarray(list(neuron_indices), dtype=np.int64)
        self._validate_indices(indices)
        self.silenced[indices] = on
        if on:
            self.i_external[indices] = 0
            self.i_syn[indices] = 0
            self.refractory_left[indices] = 0
            self.v[indices] = self.config.v_rest_mv
            self._delay_ring[:, indices] = 0

    def step(self, n_steps: int = 1) -> SpikeBatch:
        if n_steps < 1:
            raise ValueError("n_steps must be at least 1")

        output_times: list[float] = []
        output_indices: list[NDArray[np.int32]] = []
        dt = self.config.dt_ms
        synaptic_decay = np.float32(np.exp(-dt / self.config.tau_synaptic_ms))
        membrane_leak = np.float32(dt / self.config.tau_membrane_ms)
        refractory_steps = self.config.refractory_steps
        delay_slot = self.config.delay_steps

        for _ in range(n_steps):
            due = self._delay_ring[self._delay_cursor].copy()
            self._delay_ring[self._delay_cursor].fill(0)
            self.i_syn *= synaptic_decay
            self.i_syn += due

            was_refractory = self.refractory_left > 0
            self.refractory_left[was_refractory] -= 1
            active = ~was_refractory & ~self.silenced
            self.v[active] += (
                (self.config.v_rest_mv - self.v[active]) * membrane_leak
                + (self.i_syn[active] + self.i_external[active]) * np.float32(dt)
            )

            spikes = np.flatnonzero(active & (self.v >= self.config.v_threshold_mv)).astype(np.int32)
            if len(spikes):
                self.v[spikes] = self.config.v_reset_mv
                self.refractory_left[spikes] = refractory_steps
                delivery_slot = (self._delay_cursor + delay_slot) % len(self._delay_ring)
                for source in spikes:
                    start = int(self.connectome.row_ptrs[source])
                    end = int(self.connectome.row_ptrs[source + 1])
                    if end > start:
                        targets = self.connectome.targets[start:end]
                        weights = self.connectome.weights[start:end]
                        available = ~self.silenced[targets]
                        np.add.at(
                            self._delay_ring[delivery_slot],
                            targets[available],
                            weights[available],
                        )
                output_times.extend([self.time_ms] * len(spikes))
                output_indices.append(spikes)
                self._recent_spikes.append((self.step_index, spikes))

            self.v[self.silenced] = self.config.v_rest_mv
            self.i_syn[self.silenced] = 0
            self._delay_cursor = (self._delay_cursor + 1) % len(self._delay_ring)
            self.step_index += 1

        if output_indices:
            indices = np.concatenate(output_indices).astype(np.int32, copy=False)
        else:
            indices = np.empty(0, dtype=np.int32)
        return SpikeBatch(
            times_ms=np.asarray(output_times, dtype=np.float64),
            neuron_indices=indices,
        )

    def get_rates(self, window_ms: float) -> FloatArray:
        if not np.isfinite(window_ms) or window_ms <= 0:
            raise ValueError("window_ms must be finite and positive")
        window_steps = max(1, int(np.ceil(window_ms / self.config.dt_ms)))
        oldest_step = self.step_index - window_steps
        while self._recent_spikes and self._recent_spikes[0][0] < oldest_step:
            self._recent_spikes.popleft()
        counts = np.zeros(self.n, dtype=np.float32)
        for _, indices in self._recent_spikes:
            np.add.at(counts, indices, 1)
        return counts * np.float32(1000.0 / window_ms)

    def _validate_indices(self, indices: IndexArray) -> None:
        if indices.ndim != 1:
            raise ValueError("neuron indices must be one-dimensional")
        if len(indices) and (np.min(indices) < 0 or np.max(indices) >= self.n):
            raise IndexError("neuron index is outside the network")

