# NanoSim Debug Harness Design

## Goal

Add a separate diagnostic executable for NanoSim-based convergence testing. The tool should use the project's real configuration and movement math, but keep diagnostics isolated from the production program. It must default to simulation-only movement and only use real selected input devices after an explicit live-path arm action.

## Source Reference

The 0BS reference folder contains `C:\Users\donar\OneDrive\Desktop\0BS\nano_sim_3d`. No `nanosim_2` folder was found. The relevant source is the browser-based Nano Sim 3D harness:

- `src/app.js`: Three.js scene, UI binding, frame loop, monitor API.
- `src/simulation.js`: target scenarios and synthetic detection updates.
- `src/pov_controls.js`: POV camera and pointer-lock mouse movement.
- `src/monitor_analysis.js`: convergence classification.
- `src/logger.js`: CSV telemetry.
- `scripts/monitor_convergence.mjs`: headless monitor runner.

## Product Shape

Create a new optional debug target, tentatively `ai_debug.exe`, alongside the main `ai.exe`. The debug executable is the hub:

- loads the same `config.ini` and game profile settings;
- launches or embeds the trimmed NanoSim 3D browser harness;
- owns diagnostic collection, timing probes, and convergence analysis;
- defaults to simulated movement only;
- provides a separate armed mode that can run the live project movement path against NanoSim.

The production `ai.exe` should not gain persistent debug overhead or new runtime dependencies from this work.

## NanoSim Trimming

Keep:

- Three.js target scene and scenario controls;
- POV mouse/camera movement;
- synthetic detection timing, noise, dropout, and target movement;
- monitor snapshot API;
- CSV/JSON telemetry export;
- convergence scoring and issue classification logic.

Remove or disable as runtime controls:

- internal virtual PID steering as an active movement controller;
- internal crosshair steering as the default path;
- adaptive trainer profile mutation;
- Kp/Ki/Kd/actuator/converge-boost controls from the sim UI unless they are read-only diagnostic fields.

The simulator can still compute diagnostic comparisons, but it must not be another hidden movement controller.

## Movement Modes

### Simulation Mode

This is the default. Movement is routed to a diagnostic simulation sink. No OS mouse injection, HID movement, serial movement, Razer movement, kmbox movement, or fallback method is allowed.

Simulation mode is used for:

- convergence debugging;
- timing visualization;
- issue ranking;
- fuzzy multi-module diagnosis;
- validating config math without touching the real pointer/device.

### Armed Live-Path Mode

This mode is opt-in and visibly armed in the debug UI. It runs the project as intended against the NanoSim 3D environment using the selected `input_method`.

Rules:

- no fallback behavior;
- selected input method must be explicitly available;
- failures are reported as diagnostic issues, not silently recovered;
- disarming immediately stops live movement and clears queued movement.

## Diagnostic Data Model

Each frame or movement step should produce a diagnostic sample with these groups:

- `capture`: frame interval, frame age, late/dropped frames, CPU/GPU copy state when known.
- `detection`: synthetic or live detection age, confidence, box jump, dropout, inference timing.
- `tracking`: selected target id, association score, neural score/blend, reacquire markers.
- `movement`: requested dx/dy, scaled dx/dy, clipped dx/dy, queued moves, delivered movement.
- `controller`: prediction lookahead, Kalman output, wind movement state, PID governor settings.
- `convergence`: error distance, normalized error, closing rate, overshoot count, jitter, time to lock.
- `runtime`: NanoSim FPS, diagnostic UI timing, loop duration, live-path device call timing when armed.

Samples should be exposed to both the UI and export files.

## Fuzzy Issue Ranking

The debug UI should show a dialog or panel named `Convergence Issues`, sorted from most problematic to least. Each issue should include:

- issue name;
- severity score;
- confidence score;
- contributing modules;
- evidence metrics;
- suggested next checks.

Initial issue families:

- movement scaling mismatch;
- detection instability;
- controller overcorrection;
- controller under-response;
- target reacquire delay;
- timing jitter;
- live device latency or unavailable selected method;
- multi-module interaction.

Multi-module interaction is important. The analyzer should be able to rank combined causes higher than any single weak signal when correlated timing windows overlap.

## GUI Layout

Use a separate diagnostic window instead of adding tabs to the production overlay. Suggested tabs:

- `Overview`: current mode, config source, arm state, top issues.
- `NanoSim`: launch/stop, scenario, detection noise/dropout, POV controls.
- `Convergence`: error graph, closing rate, overshoot, time to lock.
- `Timing`: capture/detect/track/move/UI timings.
- `Module Blame`: fuzzy ranking table and evidence details.
- `Live Path`: guarded arming controls and selected input-method status.
- `Export`: save JSON/CSV diagnostic bundles.

The UI should use the project's ImGui styling where practical, but it should not reuse production tabs that depend on live detector and mouse globals.

## Build Integration

Add an optional CMake target and builder flag rather than changing the default production build behavior.

Expected shape:

- `AIMBOT_BUILD_DEBUG_HARNESS` CMake option, default `OFF`.
- target name `ai_debug`.
- optional script or builder switch to build it.
- NanoSim assets copied next to `ai_debug.exe` under `debug/nano_sim_3d` or `training/nano_sim_3d`.

The target may share `Config`, selected movement math modules, ImGui backends, and small diagnostic support code. Avoid linking unnecessary detector/runtime components until live-path testing requires them.

## Testing

Add tests/contracts for:

- NanoSim assets copied for debug builds.
- Default mode cannot call real mouse/device sinks.
- Armed live-path mode requires an explicit state transition.
- No `NANOSIM` entry is added to production `input_method`.
- Convergence analyzer ranks synthetic cases correctly.
- Fuzzy combined-cause ranking handles overlapping module signals.

Existing NanoSim JavaScript tests can be preserved and trimmed to match the new reduced controller scope.

## Non-Goals

- Do not replace the main program's normal GUI.
- Do not add automatic control fallbacks.
- Do not make NanoSim a production input method.
- Do not keep adaptive profile mutation in the first pass.
- Do not add runtime overhead to `ai.exe` when the debug harness is not built or launched.

## First Implementation Slice

The first slice should build the isolated debug harness skeleton, copy the trimmed NanoSim assets, launch the simulator, collect monitor snapshots, and display ranked convergence issues in simulation-only mode. Armed live-path testing can be added after the simulation sink and analyzer are stable.
