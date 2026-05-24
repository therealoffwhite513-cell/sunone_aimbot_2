# Codex Handoff Notes

These notes describe the current local project state compared with
`SunOner/sunone_aimbot_2`. They are meant for future Codex/GitHub agents so
they do not accidentally undo local work while trying to apply upstream fixes.

## Comparison Baseline

Last checked: 2026-05-24.

- Upstream repo: `https://github.com/SunOner/sunone_aimbot_2`
- Local repo root: `C:\Users\donar\sunone_aimbot_2`
- Upstream main at last check: `bdfb4a95 Add frame-age latency compensation for aim and overlay`
- Local HEAD at last check: `620a08ee bug fix`
- Merge base between local HEAD and upstream main: `21e6bc2d Add RP2350 input method and build helper scripts`

The local project is ahead of upstream and has a broad update stack that did
not land upstream. Treat upstream as a reference for ideas, not as a patch
source to apply wholesale.

Important upstream commits after the merge base:

- `d388eda6 Add IMouseInput backends and Teensy/Razer input support`
- `c6d7124a Stabilize kmboxNet connection handling`
- `bdfb4a95 Add frame-age latency compensation for aim and overlay`

The local tree already implements overlapping ideas from those commits, but
with different architecture. Do not cherry-pick those commits without manually
reconciling the differences below.

## Golden Rules

- Preserve `DetectionBuffer` confidences. Neural tracking and diagnostics need
  one confidence per detection.
- Preserve explicit input routing. The selected `input_method` must not fall
  back to another backend when the selected device is unavailable.
- Preserve TensorRT GPU fast-path preprocessing. `processFrameGpu` must keep
  `cv::cuda::GpuMat` frames on device and must not download them before
  preprocessing.
- Preserve Circle FOV as detection filtering. Do not make the legacy pixel mask
  the default circular behavior again.
- Preserve NanoSim as a debug harness. Do not add NanoSim as a production
  physical control backend.
- Preserve the local build automation. The PowerShell/Ninja scripts and
  no-download builder are part of the project update.
- Run `tools/regression_checks.ps1` after integration work. It is the fastest
  way to catch accidental upstream-style regressions.

## Why This Fork Differs From Upstream

The local project was updated to support diagnosis, repeatable builds, new
control methods, model/training workflows, and a debug simulator. Several
upstream ideas were useful, but the local project has stricter constraints:

- Controls must be explicit and deterministic.
- CUDA/TensorRT should keep direct GPU frames on device whenever possible.
- Detection metadata now includes confidences, timestamps, and neural tracker
  debug information.
- Circle masking should not rewrite the captured frame unless the user
  explicitly enables the legacy pixel mask.
- Debug tooling should not change production behavior.

## Major Local Systems Not Present Upstream

### Build Automation

Added or heavily reworked:

- `BUILDER.ps1`
- `BUILDER.bat`
- `RUN_BUILDER.bat`
- `build_no-options.ps1`
- `build_no-options.bat`
- `tools/build_common.ps1`
- `tools/build_dml.ps1`
- `tools/build_cuda.ps1`
- `tools/build_opencv_cuda.ps1`
- `tools/setup_opencv_dml.ps1`

Current behavior:

- DML and CUDA builds use PowerShell wrappers around CMake/Ninja.
- Build scripts can prompt for backend, OpenCV state, and dependency downloads.
- `build_no-options.ps1` intentionally does not download, restore, update, or
  configure dependencies. It only builds an existing `build\dml` or
  `build\cuda` tree.
- CUDA OpenCV builds are separated from DML OpenCV builds.
- OpenCV world libraries are detected dynamically.
- CUDA all-arch preset covers:
  `7.5;8.0;8.6;8.7;8.8;8.9;9.0;10.0;10.3;11.0;12.0;12.1`
- cuDNN/OpenCV DNN CUDA is disabled for the OpenCV helper because current
  inference uses TensorRT, not OpenCV DNN.

Do not replace this with the older `.bat`/Visual Studio-only upstream flow.

### Circle FOV Versus Legacy Circle Mask

Current local intent:

- `circle_mask` is the legacy CPU pixel mask.
- `circle_fov_enabled` is the lightweight circular target filter.
- `circle_fov_radius_percent` controls the circular FOV radius.
- `game_overlay_draw_circle_fov` draws the circle guide.

Why:

- The old pixel mask forced CUDA/TensorRT off the direct GPU capture path.
- The new Circle FOV keeps frames rectangular and unmodified.
- Circular filtering happens after detections by testing target points against
  the configured circle.

Do not reintroduce per-frame circle pixel masking as the default behavior.

### TensorRT GPU Fast Path

Current local intent:

- `TrtDetector::preProcess(const cv::Mat&)` handles CPU-submitted frames.
- `TrtDetector::preProcess(const cv::cuda::GpuMat&)` handles direct GPU frames.
- GPU frames use CUDA conversion/resize/normalization and
  `launch_hwc_to_chw_norm`.
- `processFrameGpu` must not call `frame.download(...)`.

Why:

- Downloading GPU frames creates a GPU to CPU to GPU round trip.
- That defeats the CUDA/TRT fast path and can create latency and utilization
  spikes.

Regression check:

- `tools/regression_checks.ps1` asserts that `frame.download(cpuDownloadedFrame)`
  is absent from `trt_detector.cpp`.

### Capture Diagnostics And Recovery

Current local additions:

- DDA and UDP capture expose initialization status.
- Capture creation returns `nullptr` for failed backends so retry logic works.
- CUDA capture diagnostics log direct GPU attempts, fallback counts, map/copy
  failures, CPU submissions, GPU submissions, and DML submissions.
- Capture clear paths use `DetectionBuffer::clear()` so boxes, classes,
  confidences, and timestamps clear together.

Preserve the diagnostic counters and null-capture retry behavior.

### Frame-Age / Motion Latency Compensation

Upstream commit `bdfb4a95` added a simpler version. Local implementation is
adapted because the local source is ahead.

Current local behavior:

- Capture records `frameTimestamp` immediately after successful GPU or CPU
  capture, before preprocessing/masking/depth work.
- DML and TensorRT queue that timestamp with the frame.
- `DetectionBuffer` publishes:
  - boxes
  - classes
  - confidences
  - source frame timestamp
  - detection publish timestamp
- `MultiTargetTracker` accepts `observationTime` so velocity and track aging are
  tied to the original capture time.
- `MouseThread` records successful submitted movement in screen-pixel terms.
- Aim movement subtracts mouse movement recorded after the source frame time.
- Game overlay projection can shift boxes/icons using frame age, track
  velocity, and recorded mouse movement.
- Config/UI key: `game_overlay_compensate_latency`.

Important local difference from upstream:

- Upstream `DetectionBuffer` does not have confidence vectors.
- Local `DetectionBuffer` must keep confidences and timestamps together.
- Do not replace it with upstream's simpler buffer.

Key files:

- `sunone_aimbot_2/detector/detection_buffer.h`
- `sunone_aimbot_2/capture/capture.cpp`
- `sunone_aimbot_2/detector/dml_detector.cpp`
- `sunone_aimbot_2/detector/trt_detector.cpp`
- `sunone_aimbot_2/mouse/AimbotTarget.cpp`
- `sunone_aimbot_2/mouse/mouse.cpp`
- `sunone_aimbot_2/runtime/mouse_thread_loop.cpp`
- `sunone_aimbot_2/runtime/game_overlay_loop.cpp`
- `sunone_aimbot_2/overlay/draw_game_overlay.cpp`
- `sunone_aimbot_2/config/config.cpp`
- `docs/guides.md`

### Controls: Razer And Teensy

Current local control policy:

- The selected `config.input_method` is authoritative.
- Movement, click, and side-button reads must not fall back to another backend.
- Win32 movement only runs when `input_method == "WIN32"`.

Current local Razer behavior:

- Runtime wrapper: `sunone_aimbot_2/mouse/rzctl.cpp`
- Header: `sunone_aimbot_2/mouse/rzctl.h`
- DLL runtime name: `chroma_lighting.dll`
- Expected module path:
  `sunone_aimbot_2/modules/razer-controls/x64/Release/chroma_lighting.dll`
- The wrapper loads the DLL dynamically with `LoadLibraryW`.
- It prefers status-returning movement exports when available.

Current local Teensy behavior:

- Runtime wrapper: `sunone_aimbot_2/mouse/Teensy41RawHid.cpp`
- Header: `sunone_aimbot_2/mouse/Teensy41RawHid.h`
- Only `TEENSY41_HID` is supported for the Teensy path.
- RawHID packets are report-id-prefixed 64-byte packets.
- Physical side-button events update global aiming/shooting/zooming state.

Important upstream difference:

- Upstream added an `IMouseInput` style abstraction.
- Local code intentionally does not use a generic fallback chain.
- Do not restore `MouseInput.cpp` / `MouseInput.h` or route through a generic
  fallback interface unless the user explicitly changes the no-fallback rule.

### Neural Tracker Association

Current local additions:

- `sunone_aimbot_2/neural/NeuralTracker.h`
- `sunone_aimbot_2/neural/NeuralTracker.cpp`
- `sunone_aimbot_2/overlay/draw_neural.cpp`
- neural config keys in `config.cpp` / `config.h`
- tracker debug labels in the overlay
- optional CSV association logging

The neural tracker is an association scorer layered into
`MultiTargetTracker`. It should not replace classical matching completely.

Important contract:

- `NeuralTrackerFeatureCount` stays at 16.
- Runtime options are `CPU` and `CUDA`.
- Missing models should leave the classical tracker active instead of failing
  startup.
- `DetectionBuffer` confidences feed into association features.

### PID Governor

Current local additions:

- Config/UI keys:
  - `pid_governor_enabled`
  - `pid_governor_speed`
  - `pid_governor_blend`
  - `pid_governor_lead_percent`
- Training scripts and base model support under `modules/training`.
- NanoSim/project GUI mirrors these knobs for diagnosis.

The default is disabled. Keep the defaults conservative.

### Training Modules

Current local path:

```text
sunone_aimbot_2/modules/training
```

Build packaging copies selected essential scripts and available base ONNX
models into runtime output folders. It should not package full training data or
YOLO workspace data into runtime folders.

Expected model outputs:

```text
training/models/pid_governor.onnx
training/models/neural_tracker.onnx
```

If missing during a full build, the builder can generate synthetic data, train,
and export a base ONNX model.

Note: this project copy currently includes training module files and some
tracked generated artifacts from the project copy. Do not clean or delete them
unless the user explicitly asks for a cleanup pass.

### NanoSim Debug Harness

Current local additions:

- `sunone_aimbot_2/debug_harness/debug_main.cpp`
- `sunone_aimbot_2/modules/nano_sim_3d`
- CMake option: `AIMBOT_BUILD_DEBUG_HARNESS`
- optional target: `ai_debug`

Intent:

- `ai_debug` loads the normal project config.
- NanoSim mirrors the main GUI knobs for diagnostics.
- NanoSim movement is simulation-only by default.
- F3-style pause/activate behavior is supported inside the simulator.
- NanoSim can rank convergence issues and expose timing/diagnostic snapshots.

Important boundary:

- NanoSim is not a production control method.
- Do not add `NANOSIM` as a physical `input_method`.
- Production overlay tabs should not depend on NanoSim.

### Overlay And GUI

Current local additions/fixes:

- Game overlay honors configured monitor and recomputes monitor bounds inside
  the render loop.
- Overlay config changes force-save on hide/shutdown.
- Game overlay can draw:
  - boxes
  - future positions
  - WindMouse tail
  - capture frame
  - Circle FOV guide
  - optional icons
  - target correction demo
  - aim simulation panel
- Overlay boxes/icons can use latency compensation.

Do not move monitor selection back to a one-time snapshot before the render
loop.

### Shutdown, Lifetime, And Thread Safety

Current local fixes:

- `TrtDetector::requestStop()` exists.
- Main shutdown requests TRT stop before joining the TRT thread.
- Game overlay stops before deleting the DML detector.
- Arduino button flags are atomic.
- Arduino listener thread joins before serial close.
- kmboxNet monitor state and packet access are safer.
- kmboxNet socket receives use timeouts.

Do not replace these with older upstream lifetime behavior.

## How To Compare With Upstream Safely

Fetch first:

```powershell
git fetch upstream main --prune
git log --oneline --decorate -5 upstream/main
git merge-base HEAD upstream/main
```

Review conceptually, not mechanically:

```powershell
git diff --name-status upstream/main..HEAD
git diff upstream/main -- sunone_aimbot_2/detector/detection_buffer.h
git diff upstream/main -- sunone_aimbot_2/mouse/mouse.cpp
git diff upstream/main -- sunone_aimbot_2/runtime/game_overlay_loop.cpp
```

When inspecting upstream fixes, ask:

- Does the upstream file know about local confidences?
- Does it know about no-fallback input routing?
- Does it keep TRT GPU frames on device?
- Does it preserve Circle FOV detection filtering?
- Does it preserve NanoSim as debug-only?
- Does it preserve training asset packaging rules?

If the answer is no, port the idea by hand.

## Verification Commands

Always run after integration work:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\regression_checks.ps1
```

Compile validation when build trees already exist:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\build_no-options.ps1 -Backend DML -NonInteractive
powershell -NoProfile -ExecutionPolicy Bypass -File .\build_no-options.ps1 -Backend CUDA -NonInteractive
```

Use full builders only when dependency setup or reconfiguration is needed:

```powershell
.\BUILDER.bat
```

## Regression Checks Are Source Contracts

`tools/regression_checks.ps1` intentionally checks for strings and file
presence that represent local architecture contracts. If a check fails, do not
delete the check first. Understand which local guarantee it protects.

Examples of protected guarantees:

- no TensorRT GPU-frame download in `processFrameGpu`
- Circle FOV remains post-detection filtering
- Razer DLL remains `chroma_lighting.dll`
- Teensy remains `TEENSY41_HID`
- selected control backend does not fall through
- detection confidences reach the tracker
- frame timestamps reach detector, tracker, mouse, and overlay
- NanoSim stays debug-only
- training data is not packaged into runtime output

## Known Good Verification From This Update

The frame-age/motion latency compensation adaptation was verified with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\regression_checks.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\build_no-options.ps1 -Backend DML -NonInteractive
powershell -NoProfile -ExecutionPolicy Bypass -File .\build_no-options.ps1 -Backend CUDA -NonInteractive
```

Both DML and CUDA no-download app builds completed successfully. CUDA emitted
only existing `nvinf.cpp` C4244 conversion warnings during that verification.

## File Map For Future Work

Build and dependency automation:

- `BUILDER.ps1`
- `build_no-options.ps1`
- `tools/build_common.ps1`
- `tools/build_dml.ps1`
- `tools/build_cuda.ps1`
- `tools/build_opencv_cuda.ps1`
- `tools/setup_opencv_dml.ps1`

Capture and detector flow:

- `sunone_aimbot_2/capture/capture.cpp`
- `sunone_aimbot_2/capture/duplication_api_capture.*`
- `sunone_aimbot_2/capture/udp_capture.*`
- `sunone_aimbot_2/capture/circle_fov.h`
- `sunone_aimbot_2/detector/detection_buffer.h`
- `sunone_aimbot_2/detector/dml_detector.*`
- `sunone_aimbot_2/detector/trt_detector.*`
- `sunone_aimbot_2/detector/cuda_preprocess.cu`

Mouse/control flow:

- `sunone_aimbot_2/mouse/mouse.*`
- `sunone_aimbot_2/runtime/mouse_thread_loop.cpp`
- `sunone_aimbot_2/mouse/rzctl.*`
- `sunone_aimbot_2/mouse/Teensy41RawHid.*`
- `sunone_aimbot_2/keyboard/keyboard_listener.cpp`

Tracking/neural/PID:

- `sunone_aimbot_2/mouse/AimbotTarget.*`
- `sunone_aimbot_2/neural/NeuralTracker.*`
- `sunone_aimbot_2/overlay/draw_neural.cpp`
- `sunone_aimbot_2/modules/training`

Overlay/debug:

- `sunone_aimbot_2/runtime/game_overlay_loop.cpp`
- `sunone_aimbot_2/overlay/draw_game_overlay.cpp`
- `sunone_aimbot_2/overlay/overlay.cpp`
- `sunone_aimbot_2/debug_harness/debug_main.cpp`
- `sunone_aimbot_2/modules/nano_sim_3d`

Docs and contracts:

- `CHANGELOG.md`
- `README.md`
- `docs/build.md`
- `docs/config.md`
- `docs/guides.md`
- `tools/regression_checks.ps1`

