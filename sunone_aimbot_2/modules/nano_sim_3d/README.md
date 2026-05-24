# NanoSim 3D Debug Harness

NanoSim 3D is the browser simulator used by the optional `ai_debug.exe` diagnostic harness. It renders synthetic 3D targets, produces screen-space detections, records timing/error telemetry, and ranks convergence issues without sending mouse input to Windows or any physical control device.

The project copy lives at:

```text
sunone_aimbot_2\modules\nano_sim_3d
```

When `AIMBOT_BUILD_DEBUG_HARNESS=ON`, CMake copies it beside `ai_debug.exe` as:

```text
debug\nano_sim_3d
```

## Run Through ai_debug

Build a backend with the debug harness enabled:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\BUILDER.ps1 -Backend DML -BuildDebugHarness
```

Then run:

```text
build\dml\Release\ai_debug.exe
```

`ai_debug.exe` loads the same `config.ini`, starts the local NanoSim server, and opens the simulator in diagnostic mode. The normal `ai.exe` runtime is not changed.

## Run Directly

From this folder:

```powershell
.\start_sim.ps1
```

Or with Node:

```powershell
node .\server.mjs
```

Then open:

```text
http://127.0.0.1:5177/?debugHarness=1&movement=simulation
```

## Diagnostic Mode Behavior

- POV mouse/camera movement remains available.
- The Main GUI Mirror matches the main overlay tab layout and carries key settings from `config.ini`.
- `F3`, or the configured pause binding passed by `ai_debug.exe`, toggles simulation Auto Aim.
- Auto Aim moves only the NanoSim crosshair unless the page is explicitly launched with `movement=main`.
- The target is a procedural cartoon 3D character with pose anchors, idle motion, and stride/lean animation.
- Simulated movement can be injected through `window.nanoSimApplyMovement(dx, dy)`.
- Telemetry snapshots are available through `window.nanoSimGetSnapshot()`.
- The Convergence Issues panel ranks the active issues from most problematic to least.

Issue families include detection instability, movement scaling mismatch, controller overcorrection, controller under-response, reacquire delay, timing jitter, live device latency, and multi-module interaction.

## Tests

```powershell
node --test tests/*.test.mjs
```

If regular `node` is not installed in the shell, use the bundled Codex runtime Node path when available.
