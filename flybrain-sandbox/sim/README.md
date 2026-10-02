# Simulation code

The small-network NumPy LIF reference kernel is in lif.py. It is an inspectable foundation, not a validated model or full-connectome implementation. The physics adapter is not implemented yet. The browser viewer is not connected to the kernel and must not be treated as a neural simulator.

Implementation order:

1. Reproduce the published FlyWire/Shiu LIF model as the correctness reference.
2. Convert structurally imported MaleCNS counts into a signed, model-scaled matrix under a documented configuration, then validate independently.
3. Define a common simulator interface before adding a faster CPU or GPU implementation.
4. Connect one documented sensory pathway and one body command at a time.
5. Record all coupling intervals, parameters, and controller contributions in the session manifest.

Do not silently guess omitted parameters from library defaults. Mark every assumption in configuration and the model card.
