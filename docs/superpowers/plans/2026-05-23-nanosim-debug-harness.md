# NanoSim Debug Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an isolated `ai_debug.exe` NanoSim diagnostic harness that uses project settings, defaults to simulation-only movement, and ranks convergence issues from NanoSim telemetry.

**Architecture:** Add a separate CMake target and small C++ launcher/hub. Deploy a trimmed NanoSim 3D browser harness under `modules/nano_sim_3d`, add JavaScript diagnostic analysis that runs in-browser/headless, and keep the production `ai.exe` runtime untouched unless a future armed live-path phase is explicitly added.

**Tech Stack:** CMake/Ninja, C++17/Win32 process launching, PowerShell launch scripts, Node.js static server, browser JavaScript/Three.js NanoSim, existing project `Config`.

---

### Task 1: Copy And Trim NanoSim Assets

**Files:**
- Create: `sunone_aimbot_2/modules/nano_sim_3d/*`
- Modify: `sunone_aimbot_2/modules/nano_sim_3d/src/app.js`
- Modify: `sunone_aimbot_2/modules/nano_sim_3d/index.html`
- Modify: `sunone_aimbot_2/modules/nano_sim_3d/README.md`

- [ ] **Step 1: Copy only deployable NanoSim source**

Copy these paths from `C:\Users\donar\OneDrive\Desktop\0BS\nano_sim_3d`:

```text
index.html
package.json
server.mjs
start_sim.ps1
monitor_convergence.cmd
src\*.js
src\styles.css
scripts\monitor_convergence.mjs
tests\*.test.mjs
README.md
```

Do not copy `training`, `results`, generated run folders, or YOLO image datasets.

- [ ] **Step 2: Remove internal controller as an active movement option**

In `src/app.js`, force `state.externalMovement = true` at startup and remove UI writes that let the browser controller steer the crosshair or camera. Keep POV mouse/camera movement.

Expected behavior:

```js
state.externalMovement = true;
controls.mainProgramMovement.checked = true;
controls.mainProgramMovement.disabled = true;
controls.controllerSteersView.checked = false;
controls.controllerSteersView.disabled = true;
```

- [ ] **Step 3: Keep diagnostics, not hidden steering**

Retain `nanoSimGetSnapshot`, convergence scoring, logger export, and monitor script compatibility. The simulator may calculate diagnostic fields, but it must not apply `updateController` output to the simulated crosshair in default mode.

- [ ] **Step 4: Run NanoSim JS tests**

Run:

```powershell
& "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test sunone_aimbot_2\modules\nano_sim_3d\tests\*.test.mjs
```

Expected: tests pass or only tests for removed internal steering fail and are updated in Task 2.

### Task 2: Add Diagnostic Issue Analyzer

**Files:**
- Create: `sunone_aimbot_2/modules/nano_sim_3d/src/diagnostic_analysis.js`
- Create: `sunone_aimbot_2/modules/nano_sim_3d/tests/diagnostic_analysis.test.mjs`
- Modify: `sunone_aimbot_2/modules/nano_sim_3d/src/app.js`

- [ ] **Step 1: Write analyzer tests**

Create tests for ranking:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { rankConvergenceIssues } from "../src/diagnostic_analysis.js";

test("ranks movement scaling mismatch above clean signals", () => {
  const issues = rankConvergenceIssues([{ errorPx: 80, targetSizePx: 80, controllerStepPx: 0.2, detectionJumpPx: 0, targetAgeMs: 8, overshootCount: 0 }]);
  assert.equal(issues[0].id, "movement_scaling_mismatch");
  assert.ok(issues[0].severity > 0.5);
});

test("detects combined module interaction", () => {
  const issues = rankConvergenceIssues([{ errorPx: 70, targetSizePx: 70, controllerStepPx: 9, detectionJumpPx: 180, targetAgeMs: 45, overshootCount: 2 }]);
  assert.ok(issues.some((issue) => issue.id === "multi_module_interaction"));
});
```

- [ ] **Step 2: Implement `rankConvergenceIssues(samples)`**

The function returns sorted issue cards:

```js
{
  id: "movement_scaling_mismatch",
  title: "Movement scaling mismatch",
  severity: 0.0,
  confidence: 0.0,
  modules: ["movement", "config"],
  evidence: ["..."],
  suggestion: "..."
}
```

Issue families:

```text
movement_scaling_mismatch
detection_instability
controller_overcorrection
controller_under_response
reacquire_delay
timing_jitter
live_device_latency
multi_module_interaction
```

- [ ] **Step 3: Expose analyzer through NanoSim monitor API**

Add `issues` to `window.nanoSimGetSnapshot()` using recent samples kept in a bounded in-memory ring buffer.

- [ ] **Step 4: Verify analyzer tests**

Run the Node tests and confirm `diagnostic_analysis.test.mjs` passes.

### Task 3: Add `ai_debug.exe` Target

**Files:**
- Create: `sunone_aimbot_2/debug_harness/debug_main.cpp`
- Modify: `CMakeLists.txt`

- [ ] **Step 1: Add CMake option**

Add:

```cmake
option(AIMBOT_BUILD_DEBUG_HARNESS "Build the isolated NanoSim diagnostic harness" OFF)
```

- [ ] **Step 2: Add target**

When enabled, build:

```cmake
add_executable(ai_debug
    "${SRC_DIR}/debug_harness/debug_main.cpp"
    "${SRC_DIR}/config/config.cpp"
)
target_include_directories(ai_debug PRIVATE "${SRC_DIR}" "${SRC_DIR}/config" "${SRC_DIR}/modules")
set_target_properties(ai_debug PROPERTIES OUTPUT_NAME "ai_debug")
```

- [ ] **Step 3: Implement launcher**

`debug_main.cpp` should:

```text
1. set the working directory to the executable directory;
2. load config.ini through Config;
3. print selected config summary;
4. find bundled Node runtime or PATH node;
5. start NanoSim server script in simulation mode;
6. open the local browser URL;
7. never call MouseThread, SendInput, Razer, Teensy, kmbox, Arduino, or GHub.
```

- [ ] **Step 4: Copy NanoSim assets after build**

Add a CMake copy command that deploys:

```text
sunone_aimbot_2/modules/nano_sim_3d -> $<TARGET_FILE_DIR:ai_debug>/debug/nano_sim_3d
```

### Task 4: Add Build Script Support

**Files:**
- Modify: `build_no-options.ps1`
- Modify: `build_no-options.bat`
- Modify: `tools/build_dml.ps1`
- Modify: `tools/build_cuda.ps1`

- [ ] **Step 1: Add debug harness switch**

Add `-DebugHarness` to `build_no-options.ps1`. When present, build target `ai_debug`; otherwise build target `ai`.

- [ ] **Step 2: Pass CMake option in configure scripts**

Add a non-default switch to the full builders:

```powershell
[switch]$BuildDebugHarness
```

When true, add:

```powershell
"-DAIMBOT_BUILD_DEBUG_HARNESS=ON"
```

- [ ] **Step 3: Preserve default behavior**

Confirm normal DML/CUDA builds still only target `ai` unless the switch is supplied.

### Task 5: Add Regression Contracts

**Files:**
- Modify: `tools/regression_checks.ps1`
- Modify: `docs/build.md`
- Modify: `docs/guides.md`

- [ ] **Step 1: Add regression checks**

Assert:

```powershell
Assert-Contains (Read-Source 'CMakeLists.txt') 'AIMBOT_BUILD_DEBUG_HARNESS'
Assert-Contains (Read-Source 'CMakeLists.txt') 'add_executable\\(ai_debug'
Assert-NotContains (Read-Source 'sunone_aimbot_2/overlay/draw_mouse.cpp') 'NANOSIM'
Assert-Contains (Read-Source 'sunone_aimbot_2/modules/nano_sim_3d/src/diagnostic_analysis.js') 'multi_module_interaction'
```

- [ ] **Step 2: Document debug harness**

Add concise docs explaining:

```text
ai_debug.exe is separate from ai.exe.
Simulation mode is default.
Live-path testing is future/armed-only.
No fallback controls are introduced.
```

- [ ] **Step 3: Verify project checks**

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\regression_checks.ps1
```

Expected: `Regression checks passed.`

### Task 6: Build Verification

**Files:**
- No source edits unless verification exposes issues.

- [ ] **Step 1: Configure debug harness**

Run the existing builder configure path with debug harness enabled for DML first.

- [ ] **Step 2: Build target**

Run:

```powershell
cmake --build build\dml --config Release --target ai_debug --parallel
```

Expected: `ai_debug.exe` is produced and `debug\nano_sim_3d` is copied next to it.

- [ ] **Step 3: Verify production target still builds**

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\build_no-options.ps1 -Backend DML
```

Expected: main `ai` target builds without requiring debug harness.
