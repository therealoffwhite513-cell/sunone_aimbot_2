const DEFAULTS = {
  sensitivity: 0.0016,
  moveSpeed: 3.0,
  sprintMultiplier: 2.2,
  pitchLimit: 1.45
};

export function createPovState() {
  return {
    enabled: true,
    locked: false,
    controllerSteersView: true,
    position: { x: 0, y: 1.5, z: 8 },
    yaw: 0,
    pitch: 0,
    manualAngularDelta: { x: 0, y: 0 }
  };
}

export function applyMouseLook(pov, delta, options = {}) {
  const sensitivity = finiteOr(options.sensitivity, DEFAULTS.sensitivity);
  const movementX = finiteOr(delta?.movementX, 0);
  const movementY = finiteOr(delta?.movementY, 0);

  pov.yaw -= movementX * sensitivity;
  pov.pitch = clamp(
    pov.pitch - movementY * sensitivity,
    -DEFAULTS.pitchLimit,
    DEFAULTS.pitchLimit
  );
  pov.manualAngularDelta.x += movementX * sensitivity;
  pov.manualAngularDelta.y -= movementY * sensitivity;
  return pov;
}

export function applyControllerPixelsToPov(pov, pixels, options = {}) {
  const sensitivity = finiteOr(options.sensitivity, 0.0008);
  const x = finiteOr(pixels?.x, 0);
  const y = finiteOr(pixels?.y, 0);

  pov.yaw -= x * sensitivity;
  pov.pitch = clamp(pov.pitch - y * sensitivity, -DEFAULTS.pitchLimit, DEFAULTS.pitchLimit);
  return pov;
}

export function movePov(pov, options = {}) {
  const keys = options.keys ?? new Set();
  const dt = clamp(finiteOr(options.dt, 1 / 60), 0, 1.0);
  const moveSpeed = finiteOr(options.moveSpeed, DEFAULTS.moveSpeed);
  const sprintMultiplier = finiteOr(options.sprintMultiplier, DEFAULTS.sprintMultiplier);
  const speed = moveSpeed * (keys.has("ShiftLeft") || keys.has("ShiftRight") ? sprintMultiplier : 1);

  let forwardAmount = 0;
  let rightAmount = 0;
  let upAmount = 0;
  if (keys.has("KeyW")) forwardAmount += 1;
  if (keys.has("KeyS")) forwardAmount -= 1;
  if (keys.has("KeyD")) rightAmount += 1;
  if (keys.has("KeyA")) rightAmount -= 1;
  if (keys.has("Space")) upAmount += 1;
  if (keys.has("KeyQ") || keys.has("ControlLeft") || keys.has("ControlRight")) upAmount -= 1;

  const forward = getForwardVector(pov);
  const right = { x: Math.cos(pov.yaw), z: -Math.sin(pov.yaw) };
  const horizontalLength = Math.hypot(forwardAmount, rightAmount) || 1;
  const scale = (speed * dt) / horizontalLength;

  pov.position.x += (forward.x * forwardAmount + right.x * rightAmount) * scale;
  pov.position.z += (forward.z * forwardAmount + right.z * rightAmount) * scale;
  pov.position.y = clamp(pov.position.y + upAmount * speed * dt, 0.5, 4.0);
  return pov;
}

export function getForwardVector(pov) {
  return {
    x: -Math.sin(pov.yaw),
    y: Math.sin(pov.pitch),
    z: -Math.cos(pov.yaw)
  };
}

export function resetPovManualDelta(pov) {
  pov.manualAngularDelta.x = 0;
  pov.manualAngularDelta.y = 0;
}

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
