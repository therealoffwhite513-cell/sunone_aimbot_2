import * as THREE from "three";

import {
  computeConvergenceScore,
  createControllerState,
  updateController,
  updateManualObserver
} from "./controller.js";
import {
  createAdaptiveTrainerState,
  exportAdaptiveProfile as serializeAdaptiveProfile,
  importAdaptiveProfile as parseAdaptiveProfile,
  updateAdaptiveTrainer
} from "./adaptive_trainer.js";
import { createCsvLogger } from "./logger.js";
import {
  applyControllerPixelsToPov,
  applyMouseLook,
  createPovState,
  movePov,
  resetPovManualDelta
} from "./pov_controls.js";
import {
  SCENARIOS,
  createSimulationState,
  maybeUpdateDetection,
  updateTarget
} from "./simulation.js";
import { SIM_POSE_ANCHORS } from "./yolo_dataset.js";
import {
  createSpeedControlsState,
  toggleSpeedControlsVisibility
} from "./ui_state.js";
import {
  browserCenterToCanvas,
  browserPointToCanvas
} from "./viewport_coordinates.js";
import { rankConvergenceIssues } from "./diagnostic_analysis.js";
import {
  createAimRuntime,
  handleAutoAimHotkey,
  resolveExternalMovementMode,
  shouldApplySimulationAim
} from "./debug_settings.js";

const sceneCanvas = document.getElementById("scene");
const overlayCanvas = document.getElementById("overlay");
const viewportElement = document.querySelector(".viewport");
const overlay = overlayCanvas.getContext("2d");
const logger = createCsvLogger();
const launchParams = new URLSearchParams(window.location.search);
const debugHarnessEnabled = launchParams.get("debugHarness") === "1";
const initialSettingsSnapshot = settingsSnapshotFromLaunchParams(launchParams);

const renderer = new THREE.WebGLRenderer({
  canvas: sceneCanvas,
  antialias: true,
  powerPreference: "high-performance",
  preserveDrawingBuffer: true
});
renderer.setClearColor(0x15181b, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x15181b, 8, 24);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
camera.position.set(0, 1.5, 8);
camera.lookAt(0, 1.25, 0);

const ambient = new THREE.HemisphereLight(0xddeeff, 0x283038, 1.1);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
keyLight.position.set(2.5, 5, 4);
scene.add(keyLight);

const grid = new THREE.GridHelper(18, 18, 0x53606c, 0x2d343b);
grid.position.y = -0.02;
scene.add(grid);

const laneMaterial = new THREE.MeshStandardMaterial({ color: 0x26313a, roughness: 0.8 });
const lane = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.03, 15), laneMaterial);
lane.position.set(0, -0.04, -2.4);
scene.add(lane);

const targetRig = createCartoonTargetRig();
const targetGroup = targetRig.group;
const targetCore = targetRig.core;

for (const anchor of SIM_POSE_ANCHORS) {
  targetGroup.add(createPoseAnchorMesh(anchor));
}
scene.add(targetGroup);

const state = {
  sim: createSimulationState(),
  controller: createControllerState(),
  pov: createPovState(),
  speedControls: createSpeedControlsState(),
  debugHarness: debugHarnessEnabled,
  externalMovement: resolveExternalMovementMode(launchParams),
  settingsSnapshot: initialSettingsSnapshot,
  aimRuntime: createAimRuntime({
    autoAimEnabled: initialSettingsSnapshot.autoAimEnabled,
    pauseBinding: initialSettingsSnapshot.buttonPause
  }),
  crosshair: { x: 0, y: 0 },
  manualDelta: { x: 0, y: 0 },
  keys: new Set(),
  scenario: "strafe",
  lastFrameTime: performance.now(),
  accumulator: 0,
  frameTimes: [],
  overshootCount: 0,
  previousError: null,
  previousDetectionPoint: null,
  previousProjectedAim: null,
  previousTargetVelocity: { x: 0, y: 0 },
  adaptiveTrainer: createAdaptiveTrainerState({ trialDurationSec: 2.5 }),
  adaptiveAppliedTrialCount: 0,
  diagnosticSamples: [],
  monitorCounters: {
    maxDetectionJumpPx: 0,
    maxControllerStepPx: 0
  },
  latest: {
    fps: 0,
    score: 0,
    errorPx: 0,
    mode: "track",
    inputMode: "pov",
    targetAgeMs: 0,
    manualSpeed: 0,
    targetSizePx: 0,
    targetPose: { x: 0, y: 1.25, z: 0, a: 0, b: 0, c: 0 },
    targetAnchors: {},
    targetVelocity: { x: 0, y: 0 },
    targetAcceleration: { x: 0, y: 0 },
    convergeBoost: {
      active: false,
      velocity: { x: 0, y: 0 },
      closingRatePxS: 0,
      distancePx: 0,
      reason: "disabled"
    },
    detectionJumpPx: 0,
    controllerStepPx: 0,
    adaptive: {
      enabled: false,
      status: "idle",
      score: 0,
      classification: "idle",
      disturbanceKind: "none",
      completedTrials: 0
    },
    issues: []
  }
};

const controls = bindControls();
populateScenarioSelect();
populateModelSelect();
applyProjectSettingsToControls();
controls.mainProgramMovement.checked = state.externalMovement;
controls.mainProgramMovement.disabled = state.debugHarness;
controls.controllerSteersView.checked = false;
controls.controllerSteersView.disabled = state.debugHarness;
installMainGuiTabs();
syncReadouts();
resize();
window.addEventListener("resize", resize);
window.addEventListener("keydown", handleKeyDown);
window.addEventListener("keyup", (event) => state.keys.delete(event.code));
overlayCanvas.addEventListener("pointermove", handlePointerMove);
document.addEventListener("mousemove", handlePointerLook);
document.addEventListener("pointerlockchange", handlePointerLockChange);
viewportElement.addEventListener("click", requestPovLock);

addClickHandler("resetButton", reset);
addClickHandler("exportButton", () => logger.download());
addClickHandler("clearLogButton", () => logger.clear());
addClickHandler("lockPovButton", requestPovLock);
addClickHandler("exportAdaptiveProfileButton", exportAdaptiveProfile);
addClickHandler("importAdaptiveProfileButton", importAdaptiveProfile);
addClickHandler("toggleSpeedControlsButton", () => {
  toggleSpeedControlsVisibility(state.speedControls);
  applySpeedControlsVisibility();
});

installMonitorApi();
requestAnimationFrame(frame);

function bindControls() {
  const ids = [
    "targetSpeed",
    "depthRange",
    "verticalRange",
    "rotationSpeed",
    "detectionFps",
    "noisePx",
    "dropout",
    "projectCaptureFps",
    "detectionResolution",
    "confidenceThreshold",
    "nmsThreshold",
    "maxDetections",
    "autoAimToggle",
    "fovX",
    "fovY",
    "circleFovEnabled",
    "circleFovRadius",
    "pidGovernorEnabled",
    "pidGovernorSpeed",
    "pidGovernorBlend",
    "pidGovernorLead",
    "neuralTrackerEnabled",
    "neuralTrackerBlend",
    "actuatorHz",
    "kp",
    "ki",
    "kd",
    "maxSpeed",
    "manualAuthority",
    "povEnabled",
    "controllerSteersView",
    "mouseSensitivity",
    "controllerViewSensitivity",
    "moveSpeed",
    "mainProgramMovement",
    "convergeBoostEnabled",
    "convergeBoostDeadzone",
    "convergeBoostMinClosing",
    "convergeBoostGain",
    "adaptiveTrainerToggle"
  ];
  const map = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
  for (const element of Object.values(map)) {
    if (element) {
      element.addEventListener("input", handleControlInput);
    }
  }
  document.getElementById("modelSelector").addEventListener("change", handleControlInput);
  document.getElementById("scenarioSelect").addEventListener("change", (event) => {
    state.scenario = event.target.value;
    reset(false);
  });
  return map;
}

function installMainGuiTabs() {
  const tabList = document.getElementById("mainGuiTabs");
  if (!tabList) {
    return;
  }

  const buttons = [...tabList.querySelectorAll("[data-target-panel]")];
  const panels = [...document.querySelectorAll(".mirror-panel[data-panel]")];
  const setActive = (panelName) => {
    for (const button of buttons) {
      const active = button.dataset.targetPanel === panelName;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    }
    for (const panel of panels) {
      panel.classList.toggle("active", panel.dataset.panel === panelName);
    }
  };

  for (const button of buttons) {
    button.addEventListener("click", () => setActive(button.dataset.targetPanel));
  }

  setActive(buttons[0]?.dataset.targetPanel ?? "Capture");
}

function populateScenarioSelect() {
  const select = document.getElementById("scenarioSelect");
  for (const scenario of SCENARIOS) {
    const option = document.createElement("option");
    option.value = scenario.id;
    option.textContent = scenario.label;
    select.appendChild(option);
  }
  select.value = state.scenario;
}

function populateModelSelect() {
  const select = document.getElementById("modelSelector");
  if (!select) {
    return;
  }

  const models = state.settingsSnapshot.modelOptions.length
    ? state.settingsSnapshot.modelOptions
    : [state.settingsSnapshot.aiModel];
  for (const model of models) {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model || "No model selected";
    select.appendChild(option);
  }
  select.value = state.settingsSnapshot.aiModel || models[0] || "";
}

function applyProjectSettingsToControls() {
  setControlValue("projectCaptureFps", state.settingsSnapshot.captureFps ?? 60);
  setControlValue("detectionFps", state.settingsSnapshot.captureFps ?? 60);
  setControlValue("actuatorHz", state.settingsSnapshot.captureFps ?? 60);
  setControlValue("detectionResolution", state.settingsSnapshot.detectionResolution ?? 320);
  setControlValue("confidenceThreshold", state.settingsSnapshot.confidenceThreshold ?? 0.1);
  setControlValue("nmsThreshold", state.settingsSnapshot.nmsThreshold ?? 0.5);
  setControlValue("maxDetections", state.settingsSnapshot.maxDetections ?? 100);
  setControlChecked("autoAimToggle", state.settingsSnapshot.autoAimEnabled ?? false);
  setControlValue("fovX", state.settingsSnapshot.fovX ?? 106);
  setControlValue("fovY", state.settingsSnapshot.fovY ?? 74);
  setControlChecked("circleFovEnabled", state.settingsSnapshot.circleFovEnabled ?? true);
  setControlValue("circleFovRadius", state.settingsSnapshot.circleFovRadiusPercent ?? 100);
  setControlChecked("pidGovernorEnabled", state.settingsSnapshot.pidGovernorEnabled ?? false);
  setControlValue("pidGovernorSpeed", state.settingsSnapshot.pidGovernorSpeed ?? 5);
  setControlValue("pidGovernorBlend", state.settingsSnapshot.pidGovernorBlend ?? 50);
  setControlValue("pidGovernorLead", state.settingsSnapshot.pidGovernorLeadPercent ?? 10);
  setControlChecked("neuralTrackerEnabled", state.settingsSnapshot.neuralTrackerEnabled ?? false);
  setControlValue("neuralTrackerBlend", state.settingsSnapshot.neuralTrackerBlend ?? 0.35);
}

function syncReadouts() {
  syncProjectKnobs();
  setText("targetSpeedReadout", number("targetSpeed").toFixed(2));
  setText("depthRangeReadout", number("depthRange").toFixed(1));
  setText("verticalRangeReadout", number("verticalRange").toFixed(2));
  setText("rotationSpeedReadout", number("rotationSpeed").toFixed(2));
  setText("detectionFpsReadout", String(number("detectionFps")));
  setText("noiseReadout", `${number("noisePx").toFixed(1)} px`);
  setText("dropoutReadout", `${Math.round(number("dropout") * 100)}%`);
  setText("actuatorHzReadout", String(number("actuatorHz")));
  setText("kpReadout", number("kp").toFixed(2));
  setText("kiReadout", number("ki").toFixed(2));
  setText("kdReadout", number("kd").toFixed(2));
  setText("maxSpeedReadout", String(number("maxSpeed")));
  setText("manualAuthorityReadout", `${Math.round(number("manualAuthority") * 100)}%`);
  setText("convergeBoostDeadzoneReadout", `${number("convergeBoostDeadzone").toFixed(1)} px`);
  setText("convergeBoostMinClosingReadout", `${number("convergeBoostMinClosing").toFixed(0)} px/s`);
  setText("convergeBoostGainReadout", number("convergeBoostGain").toFixed(2));
  setText("mouseSensitivityReadout", number("mouseSensitivity").toFixed(2));
  setText("controllerViewSensitivityReadout", number("controllerViewSensitivity").toFixed(2));
  setText("moveSpeedReadout", number("moveSpeed").toFixed(1));
  const trainerWasEnabled = state.adaptiveTrainer.enabled;
  state.adaptiveTrainer.enabled = checked("adaptiveTrainerToggle");
  if (state.adaptiveTrainer.enabled && !trainerWasEnabled) {
    state.adaptiveTrainer.profile = profileFromControls();
    state.adaptiveTrainer.status = "collecting";
  }
  if (!state.adaptiveTrainer.enabled) {
    state.adaptiveTrainer.status = "idle";
  }
  if (state.debugHarness) {
    controls.controllerSteersView.checked = false;
  }
  state.externalMovement = checked("mainProgramMovement");
  state.aimRuntime.autoAimEnabled = checked("autoAimToggle");
  state.pov.enabled = checked("povEnabled");
  state.pov.controllerSteersView = !state.externalMovement && state.pov.enabled;
  if (state.pov.enabled) {
    state.crosshair = screenCenter();
    applyCameraFromPov();
  }
  applySpeedControlsVisibility();
  updateAdaptiveReadouts();
}

function syncProjectKnobs() {
  const project = collectProjectKnobSnapshot();
  state.settingsSnapshot = {
    ...state.settingsSnapshot,
    ...project
  };
  state.aimRuntime.autoAimEnabled = project.autoAimEnabled;

  setControlValue("detectionFps", project.captureFps);
  setControlValue("actuatorHz", project.captureFps);

  setText("projectCaptureFpsReadout", String(project.captureFps));
  setText("detectionResolutionReadout", String(project.detectionResolution));
  setText("confidenceThresholdReadout", project.confidenceThreshold.toFixed(2));
  setText("nmsThresholdReadout", project.nmsThreshold.toFixed(2));
  setText("maxDetectionsReadout", String(project.maxDetections));
  setText("fovXReadout", String(project.fovX));
  setText("fovYReadout", String(project.fovY));
  setText("circleFovRadiusReadout", String(project.circleFovRadiusPercent));
  setText("pidGovernorSpeedReadout", String(project.pidGovernorSpeed));
  setText("pidGovernorBlendReadout", String(project.pidGovernorBlend));
  setText("pidGovernorLeadReadout", `${project.pidGovernorLeadPercent}%`);
  setText("neuralTrackerBlendReadout", project.neuralTrackerBlend.toFixed(2));
  setText("aimModeValue", project.autoAimEnabled ? "active" : "paused");
  setText("scenarioValue", state.scenario);

  setText("runtimeBackendValue", state.settingsSnapshot.backend || "unknown");
  setText("runtimeInputValue", state.settingsSnapshot.inputMethod || "unknown");
  setText("runtimeModelValue", project.aiModel || "none");
  setText("runtimeCaptureFpsValue", `${project.captureFps} FPS`);
  setText("runtimeFovValue", `${project.fovX} / ${project.fovY}`);
  setText("runtimeAimValue", project.autoAimEnabled ? "on" : "off");
  setText("buttonPauseValue", state.aimRuntime.pauseBinding);
  setText("buttonPauseMirrorValue", state.aimRuntime.pauseBinding);
  setText("buttonAimMirrorValue", project.autoAimEnabled ? "on" : "off");
  setText("gameOverlayCircleValue", project.circleFovEnabled ? "on" : "off");
  setText(
    "runtimePidValue",
    project.pidGovernorEnabled
      ? `on ${project.pidGovernorSpeed}/${project.pidGovernorBlend} lead ${project.pidGovernorLeadPercent}%`
      : "off"
  );
}

function collectProjectKnobSnapshot() {
  return {
    aiModel: document.getElementById("modelSelector")?.value ?? state.settingsSnapshot.aiModel,
    captureFps: Math.round(clamp(number("projectCaptureFps"), 5, 240)),
    detectionResolution: Math.round(clamp(number("detectionResolution"), 160, 960)),
    confidenceThreshold: clamp(number("confidenceThreshold"), 0.01, 0.99),
    nmsThreshold: clamp(number("nmsThreshold"), 0.01, 0.99),
    maxDetections: Math.round(clamp(number("maxDetections"), 1, 200)),
    autoAimEnabled: checked("autoAimToggle"),
    fovX: Math.round(clamp(number("fovX"), 30, 180)),
    fovY: Math.round(clamp(number("fovY"), 30, 180)),
    circleFovEnabled: checked("circleFovEnabled"),
    circleFovRadiusPercent: Math.round(clamp(number("circleFovRadius"), 1, 100)),
    pidGovernorEnabled: checked("pidGovernorEnabled"),
    pidGovernorSpeed: Math.round(clamp(number("pidGovernorSpeed"), 1, 100)),
    pidGovernorBlend: Math.round(clamp(number("pidGovernorBlend"), 1, 100)),
    pidGovernorLeadPercent: Math.round(clamp(number("pidGovernorLead"), 0, 50)),
    neuralTrackerEnabled: checked("neuralTrackerEnabled"),
    neuralTrackerBlend: clamp(number("neuralTrackerBlend"), 0, 1)
  };
}

function applySpeedControlsVisibility() {
  const panel = document.querySelector(".panel");
  const button = document.getElementById("toggleSpeedControlsButton");
  panel.classList.toggle("speed-controls-hidden", state.speedControls.hidden);
  button.textContent = state.speedControls.buttonLabel;
  button.setAttribute("aria-pressed", state.speedControls.hidden ? "true" : "false");
}

function handleControlInput() {
  syncReadouts();
}

function frame(now) {
  const rawDt = Math.min(0.05, Math.max(0.001, (now - state.lastFrameTime) / 1000));
  state.lastFrameTime = now;
  state.frameTimes.push(rawDt);
  if (state.frameTimes.length > 80) {
    state.frameTimes.shift();
  }
  state.latest.fps = Math.round(1 / average(state.frameTimes));

  updateManualInput(rawDt);
  state.accumulator += rawDt;
  const step = 1 / number("actuatorHz");
  const maxSteps = 32;
  let steps = 0;
  while (state.accumulator >= step && steps < maxSteps) {
    simulateStep(step);
    state.accumulator -= step;
    steps += 1;
  }
  if (steps >= maxSteps) {
    state.accumulator = 0;
  }

  render();
  updateHud();
  requestAnimationFrame(frame);
}

function simulateStep(dt) {
  const simSettings = {
    targetSpeed: number("targetSpeed"),
    depthRange: number("depthRange"),
    verticalRange: number("verticalRange"),
    rotationSpeed: number("rotationSpeed"),
    detectionFps: number("detectionFps"),
    noisePx: number("noisePx"),
    dropout: number("dropout")
  };
  const controllerSettings = {
    kp: number("kp"),
    ki: number("ki"),
    kd: number("kd"),
    maxSpeed: number("maxSpeed"),
    maxAccel: 4200,
    manualThreshold: 0.15,
    manualAuthority: number("manualAuthority"),
    manualHoldMs: 140,
    manualFadeMs: 220,
    sizeReferencePx: 80,
    velocityLeadPercent: state.settingsSnapshot.pidGovernorEnabled
      ? state.settingsSnapshot.pidGovernorLeadPercent
      : 0,
    velocityLeadDeadzonePx: 4,
    convergeBoostEnabled: checked("convergeBoostEnabled"),
    convergeBoostDeadzonePx: number("convergeBoostDeadzone"),
    convergeBoostMinClosingRate: number("convergeBoostMinClosing"),
    convergeBoostGain: number("convergeBoostGain"),
    convergeBoostMaxVelocity: 220
  };
  if (state.adaptiveTrainer.enabled) {
    Object.assign(controllerSettings, state.adaptiveTrainer.profile);
  }

  const target = updateTarget(state.sim, dt, state.scenario, simSettings);
  targetGroup.position.set(target.x, 0, target.z);
  targetGroup.position.y = target.y - 1.25;
  targetGroup.rotation.set(target.a, target.b, target.c, "XYZ");
  animateCartoonTargetRig(targetRig, state.sim.time, target);

  const projected = projectTarget();
  const targetVelocity = state.previousProjectedAim
    ? {
        x: (projected.aim.x - state.previousProjectedAim.x) / Math.max(1e-6, dt),
        y: (projected.aim.y - state.previousProjectedAim.y) / Math.max(1e-6, dt)
      }
    : { x: 0, y: 0 };
  const targetAcceleration = {
    x: (targetVelocity.x - state.previousTargetVelocity.x) / Math.max(1e-6, dt),
    y: (targetVelocity.y - state.previousTargetVelocity.y) / Math.max(1e-6, dt)
  };
  state.previousProjectedAim = { x: projected.aim.x, y: projected.aim.y };
  state.previousTargetVelocity = targetVelocity;
  const detection = maybeUpdateDetection(state.sim, projected, simSettings);
  state.latest.targetPose = { ...state.sim.targetPose };
  state.latest.targetAnchors = cloneAnchors(state.sim.projectedAnchors);
  state.latest.targetSizePx = projected.size;
  const manual = updateManualObserver(state.controller.manual, state.manualDelta, dt, controllerSettings);

  if (detection) {
    const detectionJumpPx = state.previousDetectionPoint
      ? Math.hypot(detection.aimX - state.previousDetectionPoint.x, detection.aimY - state.previousDetectionPoint.y)
      : 0;
    state.monitorCounters.maxDetectionJumpPx = Math.max(state.monitorCounters.maxDetectionJumpPx, detectionJumpPx);
    state.previousDetectionPoint = { x: detection.aimX, y: detection.aimY };

    if (state.pov.enabled) {
      state.crosshair = screenCenter();
    }
    const error = {
      x: detection.x - state.crosshair.x,
      y: detection.y - state.crosshair.y
    };
    const output = updateController(state.controller, {
      error,
      dt,
      targetSizePx: detection.size,
      manual,
      targetVelocity,
      settings: controllerSettings
    });

    const previousSign = state.previousError ? Math.sign(state.previousError.x) : 0;
    const nextSign = Math.sign(error.x);
    const overshot = previousSign !== 0 && nextSign !== 0 && previousSign !== nextSign && Math.abs(error.x) > 1.5;
    if (overshot) {
      state.overshootCount += 1;
    }
    state.previousError = error;

    const simulationAimActive = shouldApplySimulationAim({
      autoAimEnabled: state.aimRuntime.autoAimEnabled,
      externalMovement: state.externalMovement
    });
    const appliedOutput = state.externalMovement
      ? { x: state.manualDelta.x, y: state.manualDelta.y }
      : (simulationAimActive ? output.output : { x: 0, y: 0 });

    if (state.pov.enabled) {
      if (state.pov.controllerSteersView && simulationAimActive) {
        applyControllerPixelsToPov(state.pov, appliedOutput, {
          sensitivity: number("controllerViewSensitivity") * 0.001
        });
        applyCameraFromPov();
      }
      state.crosshair = screenCenter();
    } else if (simulationAimActive) {
      state.crosshair.x += appliedOutput.x;
      state.crosshair.y += appliedOutput.y;
      applyBounds();
    } else {
      applyBounds();
    }

    const errorPx = Math.hypot(detection.x - state.crosshair.x, detection.y - state.crosshair.y);
    const score = computeConvergenceScore(errorPx, detection.size);
    const controllerStepPx = Math.hypot(appliedOutput.x, appliedOutput.y);
    state.monitorCounters.maxControllerStepPx = Math.max(state.monitorCounters.maxControllerStepPx, controllerStepPx);
    const adaptiveUpdate = state.adaptiveTrainer.enabled
      ? updateAdaptiveTrainer(state.adaptiveTrainer, {
          time: state.sim.time,
          dt,
          scenario: state.scenario,
          error: {
            x: detection.x - state.crosshair.x,
            y: detection.y - state.crosshair.y
          },
          errorPx,
          targetSizePx: detection.size,
          controllerOutput: appliedOutput,
          controllerStepPx,
          manualDelta: state.manualDelta,
          targetVelocity,
          targetAcceleration,
          overshot
        })
      : {
          status: "idle",
          disturbance: { kind: "none", alignment: 1, manualSpeed: 0 },
          metrics: state.adaptiveTrainer.latestMetrics,
          scenario: state.scenario
        };

    if (state.adaptiveTrainer.enabled &&
        state.adaptiveAppliedTrialCount !== state.adaptiveTrainer.completedTrials.length) {
      state.adaptiveAppliedTrialCount = state.adaptiveTrainer.completedTrials.length;
      applyAdaptiveProfileToControls(state.adaptiveTrainer.profile);
    }

    state.latest = {
      ...state.latest,
      score,
      errorPx,
      mode: state.externalMovement ? "main_program" : (simulationAimActive ? output.mode : "aim_off"),
      inputMode: state.externalMovement ? "main_program" : (state.pov.enabled ? "pov" : "cursor"),
      targetAgeMs: state.sim.targetAge * 1000,
      manualSpeed: output.manualSpeed,
      targetSizePx: detection.size,
      targetPose: { ...state.sim.targetPose },
      targetAnchors: cloneAnchors(state.sim.projectedAnchors),
      targetVelocity,
      targetAcceleration,
      convergeBoost: output.convergeBoost,
      detectionJumpPx,
      controllerStepPx,
      adaptive: adaptiveSnapshot(adaptiveUpdate)
    };
    pushDiagnosticSample({
      time: state.sim.time,
      scenario: state.scenario,
      fps: state.latest.fps,
      errorPx,
      targetSizePx: detection.size,
      detectionJumpPx,
      controllerStepPx,
      targetAgeMs: state.latest.targetAgeMs,
      manualSpeed: output.manualSpeed,
      score,
      overshootCount: state.overshootCount,
      mode: state.latest.mode,
      inputMode: state.latest.inputMode
    });

    if (document.getElementById("loggingToggle").checked) {
      const profile = state.adaptiveTrainer.profile;
      const metrics = state.adaptiveTrainer.latestMetrics;
      const disturbance = adaptiveUpdate.disturbance;
      logger.add({
        time_s: state.sim.time,
        scenario: state.scenario,
        target_x: target.x,
        target_y: target.y,
        target_z: target.z,
        target_a: target.a,
        target_b: target.b,
        target_c: target.c,
        ...poseLogFields(state.sim.targetPose),
        detection_x: detection.x,
        detection_y: detection.y,
        aim_x: detection.aimX,
        aim_y: detection.aimY,
        box_center_x: detection.boxX,
        box_center_y: detection.boxY,
        box_width: detection.boxWidth,
        box_height: detection.boxHeight,
        ...anchorLogFields(detection.anchors ?? state.sim.projectedAnchors),
        crosshair_x: state.crosshair.x,
        crosshair_y: state.crosshair.y,
        error_x: detection.x - state.crosshair.x,
        error_y: detection.y - state.crosshair.y,
        error_px: errorPx,
        target_size_px: detection.size,
        controller_dx: appliedOutput.x,
        controller_dy: appliedOutput.y,
        manual_dx: state.manualDelta.x,
        manual_dy: state.manualDelta.y,
        authority: output.authority,
        manual_speed: output.manualSpeed,
        camera_x: state.pov.position.x,
        camera_y: state.pov.position.y,
        camera_z: state.pov.position.z,
        camera_yaw: state.pov.yaw,
        camera_pitch: state.pov.pitch,
        pov_locked: state.pov.locked ? 1 : 0,
        input_mode: state.externalMovement ? "main_program" : state.latest.inputMode,
        fps: state.latest.fps,
        mode: state.latest.mode,
        convergence_score: score,
        target_vx_px_s: targetVelocity.x,
        target_vy_px_s: targetVelocity.y,
        target_ax_px_s2: targetAcceleration.x,
        target_ay_px_s2: targetAcceleration.y,
        pid_governor_enabled: state.settingsSnapshot.pidGovernorEnabled ? 1 : 0,
        pid_governor_lead_percent: state.settingsSnapshot.pidGovernorLeadPercent,
        adaptive_enabled: state.adaptiveTrainer.enabled ? 1 : 0,
        adaptive_status: state.adaptiveTrainer.status,
        adaptive_trial: state.adaptiveTrainer.completedTrials.length,
        adaptive_scenario: state.adaptiveTrainer.currentScenario,
        adaptive_score: metrics?.score ?? 0,
        adaptive_classification: metrics?.classification ?? "idle",
        adaptive_kp: profile.kp,
        adaptive_ki: profile.ki,
        adaptive_kd: profile.kd,
        adaptive_max_speed: profile.maxSpeed,
        adaptive_max_accel: profile.maxAccel,
        adaptive_speed_scale: profile.speedScale,
        adaptive_brake_scale: profile.brakeScale,
        adaptive_velocity_match_gain: profile.velocityMatchGain,
        adaptive_velocity_position_gain: profile.velocityPositionGain,
        adaptive_converge_boost_enabled: profile.convergeBoostEnabled ? 1 : 0,
        adaptive_converge_boost_deadzone_px: profile.convergeBoostDeadzonePx,
        adaptive_converge_boost_min_closing_rate: profile.convergeBoostMinClosingRate,
        adaptive_converge_boost_gain: profile.convergeBoostGain,
        adaptive_converge_boost_max_velocity: profile.convergeBoostMaxVelocity,
        converge_boost_active: output.convergeBoost.active ? 1 : 0,
        converge_boost_vx_px_s: output.convergeBoost.velocity.x,
        converge_boost_vy_px_s: output.convergeBoost.velocity.y,
        converge_boost_closing_rate_px_s: output.convergeBoost.closingRatePxS,
        converge_boost_distance_px: output.convergeBoost.distancePx,
        converge_boost_reason: output.convergeBoost.reason,
        disturbance_kind: disturbance.kind,
        disturbance_alignment: disturbance.alignment,
        disturbance_manual_speed: disturbance.manualSpeed
      });
    }

    if (state.adaptiveTrainer.enabled && adaptiveUpdate.scenario !== state.scenario) {
      state.scenario = adaptiveUpdate.scenario;
      document.getElementById("scenarioSelect").value = state.scenario;
      reset(false);
    }
    updateAdaptiveReadouts();
  } else {
    state.latest.targetAgeMs = state.sim.targetAge * 1000;
    state.latest.detectionJumpPx = 0;
    state.previousDetectionPoint = null;
    pushDiagnosticSample({
      time: state.sim.time,
      scenario: state.scenario,
      fps: state.latest.fps,
      errorPx: state.latest.errorPx,
      targetSizePx: state.latest.targetSizePx,
      detectionJumpPx: 0,
      controllerStepPx: 0,
      targetAgeMs: state.latest.targetAgeMs,
      manualSpeed: state.latest.manualSpeed,
      score: state.latest.score,
      overshootCount: state.overshootCount,
      mode: state.latest.mode,
      inputMode: state.latest.inputMode
    });
  }

  state.manualDelta.x = 0;
  state.manualDelta.y = 0;
  resetPovManualDelta(state.pov);
}

function updateManualInput(dt) {
  if (state.externalMovement && !state.pov.enabled) {
    return;
  }

  if (state.pov.enabled) {
    movePov(state.pov, {
      keys: state.keys,
      dt,
      moveSpeed: number("moveSpeed"),
      sprintMultiplier: 2.2
    });
    applyCameraFromPov();
    state.crosshair = screenCenter();
    const angularToMousePixels = 1 / Math.max(0.000001, number("mouseSensitivity") * 0.001);
    state.manualDelta.x += state.pov.manualAngularDelta.x * angularToMousePixels;
    state.manualDelta.y += state.pov.manualAngularDelta.y * angularToMousePixels;
    return;
  }

  const speed = 520;
  let dx = 0;
  let dy = 0;
  if (state.keys.has("ArrowLeft") || state.keys.has("KeyA")) dx -= speed * dt;
  if (state.keys.has("ArrowRight") || state.keys.has("KeyD")) dx += speed * dt;
  if (state.keys.has("ArrowUp") || state.keys.has("KeyW")) dy -= speed * dt;
  if (state.keys.has("ArrowDown") || state.keys.has("KeyS")) dy += speed * dt;
  state.crosshair.x += dx;
  state.crosshair.y += dy;
  state.manualDelta.x += dx;
  state.manualDelta.y += dy;
  applyBounds();
}

function handlePointerMove(event) {
  if (state.pov.enabled || state.externalMovement) {
    return;
  }
  if (event.buttons !== 1) {
    return;
  }
  const rect = overlayCanvas.getBoundingClientRect();
  const next = browserPointToCanvas({
    clientX: event.clientX,
    clientY: event.clientY,
    rect,
    canvasWidth: overlayCanvas.width,
    canvasHeight: overlayCanvas.height
  });
  const dx = next.x - state.crosshair.x;
  const dy = next.y - state.crosshair.y;
  state.crosshair = next;
  state.manualDelta.x += dx;
  state.manualDelta.y += dy;
  applyBounds();
}

function handlePointerLook(event) {
  if (!state.pov.enabled || document.pointerLockElement !== viewportElement) {
    return;
  }
  applyMouseLook(state.pov, event, {
    sensitivity: number("mouseSensitivity") * 0.001
  });
  applyCameraFromPov();
}

function projectTarget() {
  targetGroup.updateMatrixWorld(true);
  const centerWorld = targetCore.getWorldPosition(new THREE.Vector3());
  const edgeWorld = centerWorld.clone().add(new THREE.Vector3(0.32, 0, 0));
  const aim = toScreen(centerWorld);
  const edge = toScreen(edgeWorld);
  const box = projectObjectBox(targetGroup);
  const anchors = projectAnchorBoxes(targetGroup);
  const size = Math.max(8, Math.abs(edge.x - aim.x) * 2.2);
  const marginX = overlayCanvas.width * 0.25;
  const marginY = overlayCanvas.height * 0.25;
  return {
    aim,
    center: aim,
    box,
    anchors,
    pose: { ...state.sim.target },
    size,
    visible:
      aim.z >= -1 &&
      aim.z <= 1 &&
      aim.x >= -marginX &&
      aim.x <= overlayCanvas.width + marginX &&
      aim.y >= -marginY &&
      aim.y <= overlayCanvas.height + marginY
  };
}

function projectObjectBox(object) {
  const worldBox = new THREE.Box3().setFromObject(object);
  const corners = [
    new THREE.Vector3(worldBox.min.x, worldBox.min.y, worldBox.min.z),
    new THREE.Vector3(worldBox.min.x, worldBox.min.y, worldBox.max.z),
    new THREE.Vector3(worldBox.min.x, worldBox.max.y, worldBox.min.z),
    new THREE.Vector3(worldBox.min.x, worldBox.max.y, worldBox.max.z),
    new THREE.Vector3(worldBox.max.x, worldBox.min.y, worldBox.min.z),
    new THREE.Vector3(worldBox.max.x, worldBox.min.y, worldBox.max.z),
    new THREE.Vector3(worldBox.max.x, worldBox.max.y, worldBox.min.z),
    new THREE.Vector3(worldBox.max.x, worldBox.max.y, worldBox.max.z)
  ].map(toScreen);

  const minX = Math.min(...corners.map((corner) => corner.x));
  const minY = Math.min(...corners.map((corner) => corner.y));
  const maxX = Math.max(...corners.map((corner) => corner.x));
  const maxY = Math.max(...corners.map((corner) => corner.y));

  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY)
  };
}

function projectAnchorBoxes(object) {
  const anchors = {};
  for (const definition of SIM_POSE_ANCHORS) {
    anchors[definition.name] = projectAnchorBox(object, definition);
  }
  return anchors;
}

function projectAnchorBox(object, definition) {
  const center = new THREE.Vector3(definition.local.x, definition.local.y, definition.local.z);
  const worldCenter = object.localToWorld(center.clone());
  const screenCenter = toScreen(worldCenter);
  const halfSize = definition.halfSize;
  const corners = [];

  for (const dx of [-halfSize, halfSize]) {
    for (const dy of [-halfSize, halfSize]) {
      for (const dz of [-halfSize, halfSize]) {
        corners.push(toScreen(object.localToWorld(center.clone().add(new THREE.Vector3(dx, dy, dz)))));
      }
    }
  }

  const minX = Math.min(...corners.map((corner) => corner.x));
  const minY = Math.min(...corners.map((corner) => corner.y));
  const maxX = Math.max(...corners.map((corner) => corner.x));
  const maxY = Math.max(...corners.map((corner) => corner.y));
  const padding = Math.max(1, Math.min(overlayCanvas.width, overlayCanvas.height) * 0.004);

  return {
    name: definition.name,
    className: definition.className,
    classId: definition.classId,
    x: screenCenter.x,
    y: screenCenter.y,
    z: screenCenter.z,
    box: {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      width: Math.max(1, maxX - minX + padding * 2),
      height: Math.max(1, maxY - minY + padding * 2)
    },
    world: {
      x: worldCenter.x,
      y: worldCenter.y,
      z: worldCenter.z
    },
    visible: screenCenter.z >= -1 && screenCenter.z <= 1
  };
}

function createCartoonTargetRig() {
  const group = new THREE.Group();
  group.name = "cartoonTarget";

  const skin = new THREE.MeshStandardMaterial({ color: 0xffcf9f, roughness: 0.48 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0x3aa6ff, roughness: 0.42 });
  const vest = new THREE.MeshStandardMaterial({ color: 0xffc857, roughness: 0.5 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x364b63, roughness: 0.58 });
  const shoe = new THREE.MeshStandardMaterial({ color: 0x15191d, roughness: 0.6 });
  const eye = new THREE.MeshStandardMaterial({ color: 0x101418, roughness: 0.3 });
  const coreMaterial = new THREE.MeshStandardMaterial({
    color: 0x49f2a8,
    emissive: 0x124b34,
    emissiveIntensity: 0.65,
    roughness: 0.25
  });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.8, 8, 18), shirt);
  torso.position.y = 0.95;
  torso.scale.set(0.92, 1, 0.72);
  group.add(torso);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16), vest);
  belly.position.set(0, 0.98, 0.04);
  belly.scale.set(0.9, 0.72, 0.42);
  group.add(belly);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.16, 16), skin);
  neck.position.y = 1.42;
  group.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 32, 20), skin);
  head.position.y = 1.67;
  head.scale.set(0.92, 1.06, 0.9);
  group.add(head);

  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.28, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), shoe);
  hair.position.set(0, 1.76, -0.01);
  hair.rotation.x = -0.18;
  group.add(hair);

  const leftEye = createFaceDot(-0.09, 1.69, 0.23, eye);
  const rightEye = createFaceDot(0.09, 1.69, 0.23, eye);
  group.add(leftEye, rightEye);

  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.01, 8, 18, Math.PI), eye);
  smile.position.set(0, 1.59, 0.25);
  smile.rotation.set(Math.PI, 0, 0);
  group.add(smile);

  const leftArm = createLimb({
    x: -0.43,
    y: 1.25,
    material: skin,
    sleeveMaterial: shirt,
    side: -1
  });
  const rightArm = createLimb({
    x: 0.43,
    y: 1.25,
    material: skin,
    sleeveMaterial: shirt,
    side: 1
  });
  group.add(leftArm.group, rightArm.group);

  const leftLeg = createLeg(-0.17, pants, shoe);
  const rightLeg = createLeg(0.17, pants, shoe);
  group.add(leftLeg.group, rightLeg.group);

  const core = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), coreMaterial);
  core.position.y = 1.48;
  group.add(core);

  return {
    group,
    core,
    parts: {
      torso,
      belly,
      head,
      hair,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      leftEye,
      rightEye,
      smile
    }
  };
}

function animateCartoonTargetRig(rig, time, target) {
  if (!rig?.parts) {
    return;
  }

  const sideMotion = Math.min(1, Math.abs(target?.x ?? 0) / 1.1);
  const stride = Math.sin(time * (5.6 + sideMotion * 2.2));
  const counterStride = Math.cos(time * (5.6 + sideMotion * 2.2));
  const bob = Math.sin(time * 4.2) * 0.025 + sideMotion * Math.abs(stride) * 0.025;
  const lean = clamp((target?.x ?? 0) * -0.07 + (target?.c ?? 0) * 0.22, -0.16, 0.16);

  rig.parts.torso.position.y = 0.95 + bob;
  rig.parts.torso.rotation.z = lean;
  rig.parts.belly.position.y = 0.98 + bob * 0.8;
  rig.parts.belly.rotation.z = lean * 0.7;
  rig.parts.head.position.y = 1.67 + bob * 1.2;
  rig.parts.head.rotation.z = lean * 0.45;
  rig.parts.hair.position.y = 1.76 + bob * 1.2;
  rig.parts.hair.rotation.z = lean * 0.45;
  rig.core.position.y = 1.48 + bob;

  rig.parts.leftArm.group.rotation.z = -0.32 + stride * 0.34;
  rig.parts.rightArm.group.rotation.z = 0.32 + stride * 0.34;
  rig.parts.leftArm.forearm.rotation.z = -0.24 + counterStride * 0.18;
  rig.parts.rightArm.forearm.rotation.z = 0.24 + counterStride * 0.18;
  rig.parts.leftLeg.group.rotation.x = stride * 0.34;
  rig.parts.rightLeg.group.rotation.x = -stride * 0.34;
  rig.parts.leftLeg.foot.rotation.x = 0.16 - counterStride * 0.12;
  rig.parts.rightLeg.foot.rotation.x = 0.16 + counterStride * 0.12;
}

function createFaceDot(x, y, z, material) {
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 8), material);
  dot.position.set(x, y, z);
  return dot;
}

function createLimb({ x, y, material, sleeveMaterial, side }) {
  const group = new THREE.Group();
  group.position.set(x, y, 0);
  group.rotation.z = side * 0.32;

  const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.22, 6, 12), sleeveMaterial);
  sleeve.position.y = -0.13;
  group.add(sleeve);

  const forearm = new THREE.Group();
  forearm.position.y = -0.27;
  forearm.rotation.z = side * 0.24;
  const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.28, 6, 12), material);
  lower.position.y = -0.16;
  forearm.add(lower);
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 10), material);
  hand.position.y = -0.34;
  forearm.add(hand);
  group.add(forearm);

  return { group, forearm };
}

function createLeg(x, material, shoeMaterial) {
  const group = new THREE.Group();
  group.position.set(x, 0.58, 0);

  const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.42, 6, 12), material);
  leg.position.y = -0.24;
  group.add(leg);

  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.32), shoeMaterial);
  foot.position.set(0, -0.5, 0.08);
  group.add(foot);

  return { group, foot };
}

function createPoseAnchorMesh(definition) {
  const colors = {
    front: 0x64b6ff,
    top: 0xffffff,
    left: 0xff6b6b,
    right: 0xa8f25a
  };
  const material = new THREE.MeshStandardMaterial({
    color: colors[definition.name] ?? 0x49f2a8,
    emissive: colors[definition.name] ?? 0x49f2a8,
    emissiveIntensity: 0.45,
    roughness: 0.22,
    depthTest: false,
    depthWrite: false
  });
  const size = definition.halfSize * 2.0;
  const marker = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), material);
  marker.position.set(definition.local.x, definition.local.y, definition.local.z);
  marker.name = `pose_anchor_${definition.name}`;
  marker.renderOrder = 5;
  return marker;
}

function toScreen(vector) {
  const projected = vector.clone().project(camera);
  return {
    x: (projected.x * 0.5 + 0.5) * overlayCanvas.width,
    y: (-projected.y * 0.5 + 0.5) * overlayCanvas.height,
    z: projected.z
  };
}

function render() {
  renderer.render(scene, camera);
  drawOverlay();
}

function drawOverlay() {
  const width = overlayCanvas.width;
  const height = overlayCanvas.height;
  overlay.clearRect(0, 0, width, height);

  drawGrid(width, height);
  drawScreenCenter(width, height);

  const detection = state.sim.detection;
  if (detection) {
    overlay.strokeStyle = "#64b6ff";
    overlay.lineWidth = 2;
    overlay.strokeRect(
      detection.boxX - detection.boxWidth / 2,
      detection.boxY - detection.boxHeight / 2,
      detection.boxWidth,
      detection.boxHeight
    );
    drawAnchorOverlay(detection.anchors);

    overlay.fillStyle = "#49f2a8";
    overlay.beginPath();
    overlay.arc(detection.aimX, detection.aimY, 4, 0, Math.PI * 2);
    overlay.fill();

    overlay.strokeStyle = "rgba(255,255,255,0.6)";
    overlay.beginPath();
    overlay.moveTo(state.crosshair.x, state.crosshair.y);
    overlay.lineTo(detection.aimX, detection.aimY);
    overlay.stroke();
  }

  overlay.strokeStyle = "#ff6464";
  overlay.lineWidth = 2;
  overlay.beginPath();
  overlay.moveTo(state.crosshair.x - 12, state.crosshair.y);
  overlay.lineTo(state.crosshair.x + 12, state.crosshair.y);
  overlay.moveTo(state.crosshair.x, state.crosshair.y - 12);
  overlay.lineTo(state.crosshair.x, state.crosshair.y + 12);
  overlay.stroke();
}

function drawAnchorOverlay(anchors) {
  overlay.save();
  overlay.strokeStyle = "rgba(73, 242, 168, 0.85)";
  overlay.fillStyle = "rgba(73, 242, 168, 0.95)";
  overlay.lineWidth = 1.5;
  for (const anchor of Object.values(anchors ?? {})) {
    if (!anchor?.box) {
      continue;
    }
    overlay.strokeRect(
      anchor.box.x - anchor.box.width / 2,
      anchor.box.y - anchor.box.height / 2,
      anchor.box.width,
      anchor.box.height
    );
    overlay.beginPath();
    overlay.arc(anchor.x, anchor.y, 2.5, 0, Math.PI * 2);
    overlay.fill();
  }
  overlay.restore();
}

function drawGrid(width, height) {
  overlay.save();
  overlay.strokeStyle = "rgba(209, 222, 235, 0.09)";
  overlay.lineWidth = 1;
  const spacing = 80;
  for (let x = spacing; x < width; x += spacing) {
    overlay.beginPath();
    overlay.moveTo(x, 0);
    overlay.lineTo(x, height);
    overlay.stroke();
  }
  for (let y = spacing; y < height; y += spacing) {
    overlay.beginPath();
    overlay.moveTo(0, y);
    overlay.lineTo(width, y);
    overlay.stroke();
  }
  overlay.restore();
}

function drawScreenCenter() {
  const center = screenCenter();
  const cx = center.x;
  const cy = center.y;
  overlay.save();
  overlay.strokeStyle = "rgba(255, 255, 255, 0.35)";
  overlay.lineWidth = 1.5;
  overlay.beginPath();
  overlay.moveTo(cx - 18, cy);
  overlay.lineTo(cx + 18, cy);
  overlay.moveTo(cx, cy - 18);
  overlay.lineTo(cx, cy + 18);
  overlay.stroke();
  overlay.restore();
}

function updateHud() {
  setText("fpsValue", String(state.latest.fps));
  setText("scoreValue", state.latest.score.toFixed(0));
  setText("errorValue", `${state.latest.errorPx.toFixed(1)} px`);
  setText("modeValue", state.latest.mode);
  setText(
    "viewValue",
    state.externalMovement
      ? (state.pov.locked ? "main locked" : "main")
      : (state.pov.enabled ? (state.pov.locked ? "POV locked" : "POV") : "cursor")
  );
  setText("actuatorValue", `${number("actuatorHz")} Hz`);
  setText("targetAgeValue", `${state.latest.targetAgeMs.toFixed(0)} ms`);
  setText("overshootValue", String(state.overshootCount));
  setText("manualValue", `${state.latest.manualSpeed.toFixed(0)} px/s`);
  setText("targetPositionValue", formatPosition(state.latest.targetPose));
  setText("targetRotationValue", formatRotation(state.latest.targetPose));
  renderIssueList();
}

function resize() {
  const rect = sceneCanvas.parentElement.getBoundingClientRect();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  const width = Math.max(1, Math.floor(rect.width * pixelRatio));
  const height = Math.max(1, Math.floor(rect.height * pixelRatio));
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(rect.width, rect.height, false);
  overlayCanvas.width = width;
  overlayCanvas.height = height;
  overlayCanvas.style.width = `${rect.width}px`;
  overlayCanvas.style.height = `${rect.height}px`;
  camera.aspect = rect.width / Math.max(1, rect.height);
  camera.updateProjectionMatrix();
  state.crosshair = screenCenter();
  if (state.pov.enabled) {
    applyCameraFromPov();
  }
}

function reset(clearLogs = true) {
  const povEnabled = state.pov.enabled;
  const controllerSteersView = state.pov.controllerSteersView;
  state.sim = createSimulationState();
  state.controller = createControllerState();
  state.pov = createPovState();
  state.pov.enabled = povEnabled;
  state.pov.controllerSteersView = controllerSteersView;
  state.crosshair = screenCenter();
  state.manualDelta = { x: 0, y: 0 };
  state.accumulator = 0;
  state.overshootCount = 0;
  state.previousError = null;
  state.previousDetectionPoint = null;
  state.previousProjectedAim = null;
  state.previousTargetVelocity = { x: 0, y: 0 };
  state.latest.targetPose = { ...state.sim.targetPose };
  state.latest.targetAnchors = {};
  state.latest.issues = [];
  state.diagnosticSamples = [];
  state.monitorCounters = {
    maxDetectionJumpPx: 0,
    maxControllerStepPx: 0
  };
  if (clearLogs) {
    logger.clear();
  }
  state.adaptiveTrainer.trialStartedAt = null;
  state.adaptiveTrainer.trialSamples = [];
  applyCameraFromPov();
  updateAdaptiveReadouts();
}

function installMonitorApi() {
  window.nanoSimGetSnapshot = () => {
    const targetAnchors = cloneAnchors(state.latest.targetAnchors);
    const snapshot = {
      time: state.sim.time,
      scenario: state.scenario,
      errorPx: state.latest.errorPx,
      score: state.latest.score,
      targetSizePx: state.latest.targetSizePx,
      detectionJumpPx: Math.max(state.latest.detectionJumpPx, state.monitorCounters.maxDetectionJumpPx),
      controllerStepPx: Math.max(state.latest.controllerStepPx, state.monitorCounters.maxControllerStepPx),
      mode: state.latest.mode,
      targetAgeMs: state.latest.targetAgeMs,
      manualSpeed: state.latest.manualSpeed,
      targetPose: { ...state.latest.targetPose },
      pose: { ...state.latest.targetPose },
      targetAnchors,
      anchors: cloneAnchors(targetAnchors),
      targetVelocity: { ...state.latest.targetVelocity },
      targetAcceleration: { ...state.latest.targetAcceleration },
      convergeBoost: {
        ...state.latest.convergeBoost,
        velocity: { ...state.latest.convergeBoost.velocity }
      },
      fps: state.latest.fps,
      overshootCount: state.overshootCount,
      adaptive: state.latest.adaptive,
      issues: state.latest.issues.map(cloneIssue),
      settings: { ...state.settingsSnapshot },
      debugHarness: state.debugHarness,
      autoAimActive: state.aimRuntime.autoAimEnabled,
      externalMovement: state.externalMovement,
      camera: {
        x: state.pov.position.x,
        y: state.pov.position.y,
        z: state.pov.position.z,
        yaw: state.pov.yaw,
        pitch: state.pov.pitch
      },
      detection: state.sim.detection ? {
        aimX: state.sim.detection.aimX,
        aimY: state.sim.detection.aimY,
        boxX: state.sim.detection.boxX,
        boxY: state.sim.detection.boxY,
        boxWidth: state.sim.detection.boxWidth,
        boxHeight: state.sim.detection.boxHeight,
        confidence: state.sim.detection.confidence,
        targetPose: { ...state.sim.detection.targetPose },
        pose: { ...state.sim.detection.targetPose },
        anchors: cloneAnchors(state.sim.detection.anchors)
      } : null,
      crosshair: { ...state.crosshair },
      inputMode: state.latest.inputMode
    };
    state.monitorCounters.maxDetectionJumpPx = 0;
    state.monitorCounters.maxControllerStepPx = 0;
    return snapshot;
  };

  window.nanoSimApplyMovement = (dxOrVector, dy = 0) => {
    const dx = Number(typeof dxOrVector === "object" ? dxOrVector?.x : dxOrVector);
    const resolvedDy = Number(typeof dxOrVector === "object" ? dxOrVector?.y : dy);
    if (!Number.isFinite(dx) || !Number.isFinite(resolvedDy)) {
      return false;
    }
    state.manualDelta.x += dx;
    state.manualDelta.y += resolvedDy;
    if (!state.pov.enabled) {
      state.crosshair.x += dx;
      state.crosshair.y += resolvedDy;
      applyBounds();
    }
    return true;
  };

  window.nanoSimSetScenario = (scenario) => {
    if (!SCENARIOS.some((item) => item.id === scenario)) {
      return false;
    }
    state.scenario = scenario;
    const select = document.getElementById("scenarioSelect");
    select.value = scenario;
    reset(false);
    return true;
  };
}

function pushDiagnosticSample(sample) {
  state.diagnosticSamples.push(sample);
  if (state.diagnosticSamples.length > 240) {
    state.diagnosticSamples.splice(0, state.diagnosticSamples.length - 240);
  }
  state.latest.issues = rankConvergenceIssues(state.diagnosticSamples).slice(0, 8);
}

function renderIssueList() {
  const issueList = document.getElementById("issueList");
  if (!issueList) {
    return;
  }

  issueList.replaceChildren();
  if (!state.latest.issues.length) {
    const clean = document.createElement("div");
    clean.className = "issue-row clean";
    clean.textContent = "No convergence issue detected in the active sample window.";
    issueList.appendChild(clean);
    return;
  }

  for (const issue of state.latest.issues) {
    const row = document.createElement("div");
    row.className = "issue-row";

    const header = document.createElement("div");
    header.className = "issue-header";

    const title = document.createElement("strong");
    title.textContent = issue.title;

    const score = document.createElement("span");
    score.textContent = `${Math.round(issue.score * 100)}%`;

    header.append(title, score);

    const modules = document.createElement("small");
    modules.textContent = issue.modules.join(" + ");

    const evidence = document.createElement("p");
    evidence.textContent = issue.evidence.slice(0, 2).join("; ");

    row.append(header, modules, evidence);
    issueList.appendChild(row);
  }
}

function cloneIssue(issue) {
  return {
    ...issue,
    modules: [...issue.modules],
    evidence: [...issue.evidence]
  };
}

function settingsSnapshotFromLaunchParams(params) {
  const aiModel = params.get("ai_model") ?? "unknown";
  return {
    backend: params.get("backend") ?? "unknown",
    aiModel,
    modelOptions: parseListParam(params.get("model_options"), aiModel),
    captureFps: numericParam(params, "capture_fps"),
    detectionResolution: numericParam(params, "detection_resolution"),
    confidenceThreshold: numericParam(params, "confidence_threshold"),
    nmsThreshold: numericParam(params, "nms_threshold"),
    maxDetections: numericParam(params, "max_detections"),
    autoAimEnabled: boolParam(params, "auto_aim", false),
    buttonPause: params.get("button_pause") ?? "F3",
    fovX: numericParam(params, "fov_x"),
    fovY: numericParam(params, "fov_y"),
    circleFovEnabled: boolParam(params, "circle_fov_enabled", true),
    circleFovRadiusPercent: numericParam(params, "circle_fov_radius_percent"),
    pidGovernorEnabled: params.get("pid_governor_enabled") === "1",
    pidGovernorSpeed: numericParam(params, "pid_governor_speed"),
    pidGovernorBlend: numericParam(params, "pid_governor_blend"),
    pidGovernorLeadPercent: numericParam(params, "pid_governor_lead_percent"),
    neuralTrackerEnabled: params.get("neural_tracker_enabled") === "1",
    neuralTrackerBlend: numericParam(params, "neural_tracker_blend"),
    inputMethod: params.get("input_method") ?? "unknown"
  };
}

function parseListParam(value, fallback) {
  const items = (value ?? "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
  if (fallback && !items.includes(fallback)) {
    items.unshift(fallback);
  }
  return [...new Set(items)];
}

function numericParam(params, key) {
  const value = Number(params.get(key));
  return Number.isFinite(value) ? value : null;
}

function boolParam(params, key, fallback) {
  const value = params.get(key);
  if (value === null) {
    return fallback;
  }
  return value === "1" || value === "true";
}

function cloneAnchors(anchors) {
  const cloned = {};
  for (const [name, anchor] of Object.entries(anchors ?? {})) {
    if (!anchor) {
      continue;
    }
    cloned[name] = {
      ...anchor,
      box: anchor.box ? { ...anchor.box } : undefined,
      world: anchor.world ? { ...anchor.world } : undefined
    };
  }
  return cloned;
}

function poseLogFields(pose) {
  return {
    pose_x: pose.x,
    pose_y: pose.y,
    pose_z: pose.z,
    pose_a: pose.a,
    pose_b: pose.b,
    pose_c: pose.c
  };
}

function anchorLogFields(anchors) {
  const fields = {};
  for (const definition of SIM_POSE_ANCHORS) {
    const anchor = anchors?.[definition.name];
    const prefix = `anchor_${definition.name}`;
    fields[`${prefix}_x`] = anchor?.x;
    fields[`${prefix}_y`] = anchor?.y;
    fields[`${prefix}_z`] = anchor?.z;
    fields[`${prefix}_box_x`] = anchor?.box?.x;
    fields[`${prefix}_box_y`] = anchor?.box?.y;
    fields[`${prefix}_box_width`] = anchor?.box?.width;
    fields[`${prefix}_box_height`] = anchor?.box?.height;
    fields[`${prefix}_world_x`] = anchor?.world?.x;
    fields[`${prefix}_world_y`] = anchor?.world?.y;
    fields[`${prefix}_world_z`] = anchor?.world?.z;
  }
  return fields;
}

function adaptiveSnapshot(update) {
  const metrics = update?.metrics ?? state.adaptiveTrainer.latestMetrics;
  const disturbance = update?.disturbance ?? state.adaptiveTrainer.latestDisturbance;
  return {
    enabled: state.adaptiveTrainer.enabled,
    status: state.adaptiveTrainer.status,
    currentScenario: state.adaptiveTrainer.currentScenario,
    completedTrials: state.adaptiveTrainer.completedTrials.length,
    score: metrics?.score ?? 0,
    classification: metrics?.classification ?? "idle",
    disturbanceKind: disturbance?.kind ?? "none",
    disturbanceAlignment: disturbance?.alignment ?? 1,
    profile: { ...state.adaptiveTrainer.profile }
  };
}

function profileFromControls() {
  return {
    kp: number("kp"),
    ki: number("ki"),
    kd: number("kd"),
    maxSpeed: number("maxSpeed"),
    maxAccel: 4200,
    speedScale: 1,
    brakeScale: 1,
    velocityMatchGain: 0,
    velocityPositionGain: 0.08,
    velocityLeadPercent: state.settingsSnapshot.pidGovernorEnabled
      ? state.settingsSnapshot.pidGovernorLeadPercent
      : 0,
    velocityLeadDeadzonePx: 4,
    convergeBoostEnabled: checked("convergeBoostEnabled"),
    convergeBoostDeadzonePx: number("convergeBoostDeadzone"),
    convergeBoostMinClosingRate: number("convergeBoostMinClosing"),
    convergeBoostGain: number("convergeBoostGain"),
    convergeBoostMaxVelocity: 220
  };
}

function applyAdaptiveProfileToControls(profile) {
  const fields = {
    kp: "kp",
    ki: "ki",
    kd: "kd",
    maxSpeed: "maxSpeed",
    convergeBoostDeadzonePx: "convergeBoostDeadzone",
    convergeBoostMinClosingRate: "convergeBoostMinClosing",
    convergeBoostGain: "convergeBoostGain"
  };
  for (const [key, id] of Object.entries(fields)) {
    if (Number.isFinite(profile[key]) && controls[id]) {
      controls[id].value = String(profile[key]);
    }
  }
  if (typeof profile.convergeBoostEnabled === "boolean" && controls.convergeBoostEnabled) {
    controls.convergeBoostEnabled.checked = profile.convergeBoostEnabled;
  }
  syncReadouts();
}

function updateAdaptiveReadouts() {
  const metrics = state.adaptiveTrainer.latestMetrics;
  const disturbance = state.adaptiveTrainer.latestDisturbance;
  const boost = state.latest.convergeBoost;
  const boostEnabled = checked("convergeBoostEnabled") ||
    (state.adaptiveTrainer.enabled && Boolean(state.adaptiveTrainer.profile.convergeBoostEnabled));
  setText("adaptiveStatusValue", state.adaptiveTrainer.enabled ? state.adaptiveTrainer.status : "idle");
  setText("adaptiveTrialsValue", String(state.adaptiveTrainer.completedTrials.length));
  setText("adaptiveScoreValue", String(Math.round(metrics?.score ?? 0)));
  setText("adaptiveClassValue", metrics?.classification ?? "idle");
  setText("adaptiveDisturbanceValue", disturbance?.kind ?? "none");
  setText("convergeBoostStateValue", boostEnabled ? (boost.active ? "boosting" : boost.reason) : "off");
}

function exportAdaptiveProfile() {
  const blob = new Blob([serializeAdaptiveProfile(state.adaptiveTrainer)], {
    type: "application/json;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "nano_sim_3d_adaptive_profile.json";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function importAdaptiveProfile() {
  const json = window.prompt("Paste adaptive profile JSON");
  if (!json) {
    return;
  }
  try {
    const imported = parseAdaptiveProfile(json);
    state.adaptiveTrainer.profile = imported.profile;
    state.adaptiveTrainer.latestMetrics = imported.latestMetrics;
    state.adaptiveTrainer.status = "imported";
    applyAdaptiveProfileToControls(imported.profile);
    updateAdaptiveReadouts();
  } catch (error) {
    state.adaptiveTrainer.status = "import_error";
    updateAdaptiveReadouts();
    console.error(error);
  }
}

function applyBounds() {
  state.crosshair.x = Math.max(0, Math.min(overlayCanvas.width, state.crosshair.x));
  state.crosshair.y = Math.max(0, Math.min(overlayCanvas.height, state.crosshair.y));
}

function formatPosition(pose) {
  return `${pose.x.toFixed(2)} ${pose.y.toFixed(2)} ${pose.z.toFixed(2)}`;
}

function formatRotation(pose) {
  return `${radiansToDegrees(pose.a).toFixed(0)} ${radiansToDegrees(pose.b).toFixed(0)} ${radiansToDegrees(pose.c).toFixed(0)}`;
}

function radiansToDegrees(value) {
  return value * 180 / Math.PI;
}

function average(values) {
  if (values.length === 0) {
    return 1 / 60;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function requestPovLock() {
  if (!state.pov.enabled || document.pointerLockElement === viewportElement) {
    return;
  }
  viewportElement.requestPointerLock();
}

function handlePointerLockChange() {
  state.pov.locked = document.pointerLockElement === viewportElement;
}

function handleKeyDown(event) {
  if (handleAutoAimHotkey(state.aimRuntime, event)) {
    setControlChecked("autoAimToggle", state.aimRuntime.autoAimEnabled);
    syncReadouts();
    event.preventDefault();
    return;
  }

  state.keys.add(event.code);
  if (event.code === "Escape" && document.pointerLockElement === viewportElement) {
    document.exitPointerLock();
  }
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
    event.preventDefault();
  }
}

function applyCameraFromPov() {
  camera.position.set(state.pov.position.x, state.pov.position.y, state.pov.position.z);
  camera.rotation.order = "YXZ";
  camera.rotation.y = state.pov.yaw;
  camera.rotation.x = state.pov.pitch;
  camera.rotation.z = 0;
}

function screenCenter() {
  const rect = overlayCanvas.getBoundingClientRect();
  return browserCenterToCanvas({
    rect,
    canvasWidth: overlayCanvas.width,
    canvasHeight: overlayCanvas.height,
    windowWidth: window.innerWidth,
    windowHeight: window.innerHeight
  });
}

function number(id) {
  return Number(controls[id]?.value ?? 0);
}

function checked(id) {
  return Boolean(controls[id]?.checked);
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function setControlValue(id, value) {
  const control = controls[id];
  if (!control || value === null || value === undefined || !Number.isFinite(Number(value))) {
    return;
  }
  const min = Number(control.min);
  const max = Number(control.max);
  const next = Number.isFinite(min) && Number.isFinite(max)
    ? clamp(Number(value), min, max)
    : Number(value);
  control.value = String(next);
}

function setControlChecked(id, checkedValue) {
  const control = controls[id];
  if (control) {
    control.checked = Boolean(checkedValue);
  }
}

function addClickHandler(id, handler) {
  const element = document.getElementById(id);
  if (element) {
    element.addEventListener("click", handler);
  }
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}
