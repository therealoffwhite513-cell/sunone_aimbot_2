export const SCENARIOS = [
  { id: "stationary", label: "Stationary" },
  { id: "strafe", label: "Strafe" },
  { id: "depth", label: "Depth" },
  { id: "zigzag", label: "Zigzag" },
  { id: "jump", label: "Jump" },
  { id: "sixdof", label: "XYZ ABC" }
];

const DEFAULT_TARGET_POSE = { x: 0, y: 1.25, z: 0, a: 0, b: 0, c: 0 };

export function createSimulationState() {
  return {
    time: 0,
    target: { ...DEFAULT_TARGET_POSE },
    previousTarget: { ...DEFAULT_TARGET_POSE },
    targetPose: { ...DEFAULT_TARGET_POSE },
    projectedAnchors: {},
    detection: null,
    lastDetectionTime: -Infinity,
    targetAge: 0,
    jumpIndex: 0
  };
}

export function updateTarget(state, dt, scenario, settings) {
  state.time += dt;
  state.previousTarget = { ...state.target };

  const t = state.time;
  const speed = finiteOr(settings.targetSpeed, 1);
  const depth = finiteOr(settings.depthRange, 4);
  const vertical = finiteOr(settings.verticalRange, 0.7);
  const rotation = finiteOr(settings.rotationSpeed, 1);

  if (scenario === "stationary") {
    state.target = {
      x: Math.sin(t * 0.35) * 0.18,
      y: 1.25 + Math.sin(t * 0.5) * vertical * 0.07,
      z: -0.25 + Math.sin(t * 0.28) * 0.12,
      a: Math.sin(t * 0.42 * rotation) * 0.10,
      b: Math.sin(t * 0.37 * rotation + 0.7) * 0.16,
      c: Math.cos(t * 0.31 * rotation) * 0.08
    };
  } else if (scenario === "strafe") {
    state.target = {
      x: Math.sin(t * speed) * 1.1,
      y: 1.25 + Math.sin(t * 1.7) * vertical * 0.16,
      z: -1.0 + Math.cos(t * 0.6) * 0.22,
      a: Math.sin(t * 0.9 * rotation) * 0.16,
      b: Math.sin(t * 0.7 * rotation + 0.4) * 0.32,
      c: Math.cos(t * 0.55 * rotation) * 0.12
    };
  } else if (scenario === "depth") {
    state.target = {
      x: Math.sin(t * speed * 0.65) * 0.8,
      y: 1.25 + Math.sin(t * 0.8) * vertical * 0.14,
      z: -0.5 - (Math.sin(t * 0.55) * 0.5 + 0.5) * depth * 0.75,
      a: Math.sin(t * 0.65 * rotation + 0.2) * 0.18,
      b: Math.cos(t * 0.85 * rotation) * 0.24,
      c: Math.sin(t * 0.45 * rotation) * 0.10
    };
  } else if (scenario === "zigzag") {
    const phase = ((t * speed * 0.45) % 2) - 1;
    const tri = 1 - 2 * Math.abs(phase);
    state.target = {
      x: tri * 1.15,
      y: 1.25 + Math.sin(t * 2.8) * vertical * 0.20,
      z: -1.0 + Math.sin(t * 1.2) * 0.28,
      a: Math.sin(t * 1.4 * rotation) * 0.20,
      b: tri * 0.34 + Math.sin(t * 0.8 * rotation) * 0.08,
      c: Math.cos(t * 1.1 * rotation) * 0.18
    };
  } else if (scenario === "jump") {
    const jumpWindow = Math.floor(t / 1.6);
    if (jumpWindow !== state.jumpIndex) {
      state.jumpIndex = jumpWindow;
    }
    const side = state.jumpIndex % 2 === 0 ? -1 : 1;
    state.target = {
      x: side * 0.75 + Math.sin(t * speed) * 0.28,
      y: 1.25 + Math.sin(t * 1.1) * vertical * 0.18,
      z: -0.9 + Math.cos(t * 0.8) * 0.22,
      a: side * 0.12 + Math.sin(t * 0.75 * rotation) * 0.12,
      b: side * 0.28 + Math.cos(t * 0.55 * rotation) * 0.10,
      c: Math.sin(t * 1.25 * rotation) * 0.20
    };
  } else if (scenario === "sixdof") {
    state.target = {
      x: Math.sin(t * speed * 0.92) * 0.95 + Math.sin(t * 0.37) * 0.18,
      y: 1.25 + Math.sin(t * 1.35) * vertical * 0.22 + Math.cos(t * 0.51) * vertical * 0.08,
      z: -0.6 - (Math.sin(t * 0.63) * 0.5 + 0.5) * depth * 0.72 + Math.sin(t * 1.1) * 0.16,
      a: Math.sin(t * 0.83 * rotation) * 0.34 + Math.sin(t * 1.7 * rotation) * 0.06,
      b: Math.cos(t * 0.72 * rotation + 0.6) * 0.48,
      c: Math.sin(t * 1.05 * rotation + 1.2) * 0.30
    };
  }

  return state.target;
}

export function maybeUpdateDetection(state, projected, settings) {
  refreshProjectedPose(state, projected);

  const detectionInterval = 1 / Math.max(1, settings.detectionFps);
  if (state.time - state.lastDetectionTime < detectionInterval) {
    state.targetAge = state.time - state.lastDetectionTime;
    if (state.detection) {
      state.detection.targetPose = { ...state.targetPose };
      state.detection.anchors = cloneAnchors(state.projectedAnchors);
    }
    return state.detection;
  }

  state.lastDetectionTime = state.time;
  state.targetAge = 0;

  if (Math.random() < settings.dropout) {
    state.detection = null;
    return null;
  }

  const noise = settings.noisePx;
  const aim = projected.aim ?? projected.center;
  const box = projected.box ?? {
    x: aim.x,
    y: aim.y,
    width: Math.max(1, (projected.size ?? 8) * 2),
    height: Math.max(1, (projected.size ?? 8) * 2)
  };
  const noiseX = (Math.random() * 2 - 1) * noise;
  const noiseY = (Math.random() * 2 - 1) * noise;
  const noisy = {
    aimX: aim.x + noiseX,
    aimY: aim.y + noiseY,
    x: aim.x + noiseX,
    y: aim.y + noiseY,
    boxX: box.x + noiseX,
    boxY: box.y + noiseY,
    boxWidth: box.width,
    boxHeight: box.height,
    size: projected.size ?? Math.max(8, Math.min(box.width, box.height) * 0.5),
    valid: projected.visible,
    confidence: projected.visible ? Math.max(0, 1 - settings.dropout - noise / 80) : 0,
    targetPose: { ...state.targetPose },
    anchors: cloneAnchors(state.projectedAnchors, noiseX, noiseY)
  };

  state.detection = noisy.valid ? noisy : null;
  return state.detection;
}

function refreshProjectedPose(state, projected) {
  const pose = projected.pose ?? projected.targetPose ?? state.target;
  if (pose) {
    state.targetPose = {
      x: finiteOr(pose.x, 0),
      y: finiteOr(pose.y, 0),
      z: finiteOr(pose.z, 0),
      a: finiteOr(pose.a, 0),
      b: finiteOr(pose.b, 0),
      c: finiteOr(pose.c, 0)
    };
  }
  state.projectedAnchors = cloneAnchors(projected.anchors ?? {});
}

function cloneAnchors(anchors, offsetX = 0, offsetY = 0) {
  const cloned = {};
  for (const [name, anchor] of Object.entries(anchors ?? {})) {
    if (!anchor) {
      continue;
    }
    cloned[name] = cloneAnchor(anchor, offsetX, offsetY);
  }
  return cloned;
}

function cloneAnchor(anchor, offsetX, offsetY) {
  const cloned = {
    ...anchor,
    x: Number.isFinite(anchor.x) ? anchor.x + offsetX : anchor.x,
    y: Number.isFinite(anchor.y) ? anchor.y + offsetY : anchor.y
  };
  if (anchor.box) {
    cloned.box = {
      ...anchor.box,
      x: Number.isFinite(anchor.box.x) ? anchor.box.x + offsetX : anchor.box.x,
      y: Number.isFinite(anchor.box.y) ? anchor.box.y + offsetY : anchor.box.y
    };
  }
  if (anchor.world) {
    cloned.world = { ...anchor.world };
  }
  return cloned;
}

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}
