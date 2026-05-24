# Sunone Aimbot 2

Sunone Aimbot 2 is a Windows C++ computer-vision project with two supported runtime families:

- **DirectML (DML)** for broad Windows GPU compatibility.
- **CUDA + TensorRT (TRT)** for NVIDIA-focused performance.

The project includes screen capture, inference, target tracking, configurable mouse/control output, overlays, optional depth support, optional neural tracking assets, and build tooling for both DML and CUDA releases.

This repository is intended for research, experimentation, and learning. Use it only in environments where you have permission.

## Ready Builds

| Build | Use this when | Notes |
|---|---|---|
| **DML** | You want the simplest Windows GPU path or do not have NVIDIA CUDA/TensorRT installed. | Uses ONNX models. Good compatibility, lower setup burden. |
| **CUDA + TensorRT** | You have a supported NVIDIA GPU and want the fastest backend. | Uses TensorRT engines and CUDA acceleration. Setup is heavier but faster when configured correctly. |

Release packages are published here:

- [Latest releases](https://github.com/SunOner/sunone_aimbot_2/releases/latest)

## First Run

1. Download either the **DML** or **CUDA** release.
2. Extract the archive to a normal folder, not inside the ZIP.
3. Run the included executable.
4. Open the GUI or overlay to adjust capture, model, aiming, and control settings.
5. Save settings from the GUI when possible. Manual config edits are supported, but the GUI helps avoid invalid values.

The first generated config uses conservative defaults. You can tune capture FPS, model confidence, target offsets, control method, overlay behavior, and tracking settings after launch.

## Current Highlights

### Capture and Inference

- Desktop Duplication API capture is the normal capture path.
- CUDA builds can use TensorRT with CUDA memory paths.
- DML builds use ONNX models through DirectML.
- The preview/debug window can intentionally force CPU copies because it needs pixels available on the CPU.

### Circle FOV

The current recommended FOV limiter is **Circle FOV**, which is configured by radius and can be shown in the GUI preview or game overlay. The old `circle_mask` pixel mask remains available as a legacy option, but it is off by default because it can add CPU work and interfere with fast CUDA capture paths.

Detailed setup is in [docs/config.md](docs/config.md) and [docs/guides.md](docs/guides.md).

### Control Methods

Supported control outputs include:

- `WIN32`
- `GHUB`
- `RAZER`
- `ARDUINO`
- `RP2350`
- `TEENSY41_HID`
- `KMBOX_NET`
- `KMBOX_A`
- `MAKCU`

Razer and Teensy support are explicit control paths. If one of those is selected and the matching device, DLL, or HID endpoint is not available, the project does **not** silently fall back to another control method.

### Razer and Teensy

- Razer support loads `chroma_lighting.dll` dynamically from the runtime or module paths.
- Teensy support targets `TEENSY41_HID` only and uses a RawHID-style packet interface.
- Setup details are in [docs/config.md](docs/config.md) and [docs/guides.md](docs/guides.md).

### Neural Tracker and PID Governor

The Neural tab includes optional neural tracker settings and PID governor controls. The neural tracker can load a model from the packaged `training/models` folder when available. PID governor settings are currently exposed in config/UI/training assets so they can be tuned and carried with builds; runtime mouse-governor inference is still a project integration area.

### NanoSim Debug Harness

An optional `ai_debug.exe` target launches a separate NanoSim 3D diagnostic environment. It reads the same `config.ini`, starts in simulation-only mode, keeps hardware output out of the loop, and ranks convergence issues from simulator telemetry so controller, detection, timing, and tracking problems can be compared without changing the normal `ai.exe` runtime.

NanoSim now presents a Main GUI Mirror with the same high-level tabs as the app overlay. It mirrors the selected model and key knobs, including Auto Aim, confidence, NMS, FOV, Circle FOV, neural tracker blend, and PID governor speed/blend. In NanoSim, `F3` toggles simulation Auto Aim on/off, and the target is a procedural cartoon 3D character so model motion, pose, and convergence are easier to inspect visually.

## Build From Source

For most local development, use:

```powershell
.\BUILDER.bat
```

or:

```powershell
powershell -ExecutionPolicy Bypass -File .\BUILDER.ps1
```

There is also a faster local rebuild helper for already-prepared environments:

```powershell
.\build_no-options.bat
```

Build details, prerequisites, output folders, and troubleshooting are in [docs/build.md](docs/build.md).

## Documentation

- [Build Guide](docs/build.md) - how to build DML, CUDA, and no-options local rebuilds.
- [Configuration Guide](docs/config.md) - current config sections, defaults, and valid values.
- [Usage and Troubleshooting Guides](docs/guides.md) - practical setup recipes and diagnostics.
- [Implemented Changelog](CHANGELOG.md) - recent implementation details for controls, circle FOV, neural tracking, training assets, and builders.

## License

This project follows the license included in the repository.

## Credits

Sunone Aimbot 2 builds on a broad open-source ecosystem, including OpenCV, ONNX Runtime, DirectML, CUDA, TensorRT, Dear ImGui, hidapi, and other libraries listed in the source and build files.
