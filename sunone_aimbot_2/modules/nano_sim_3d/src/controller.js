const DEFAULT_SETTINGS = {
  kp: 4.0,
  ki: 0.15,
  kd: 0.08,
  maxSpeed: 900,
  maxAccel: 4200,
  speedScale: 1,
  brakeScale: 1,
  brakeRadiusScale: 0.16,
  velocityLeadPercent: 0,
  velocityLeadDeadzonePx: 4,
  velocityMatchGain: 0,
  velocityPositionGain: 0,
  velocityMatchRadiusScale: 0.6,
  convergeBoostEnabled: false,
  convergeBoostDeadzonePx: 4,
  convergeBoostMinClosingRate: 80,
  convergeBoostGain: 0.45,
  convergeBoostMaxVelocity: 220,
  manualThreshold: 2,
  manualAuthority: 0.15,
  manualHoldMs: 140,
  manualFadeMs: 220,
  sizeReferencePx: 80
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function magnitude(v) {
  return Math.hypot(v.x, v.y);
}

function clampVector(v, maxLength) {
  const len = magnitude(v);
  if (len <= maxLength || len < 1e-6) {
    return { x: v.x, y: v.y };
  }
  const scale = maxLength / len;
  return { x: v.x * scale, y: v.y * scale };
}

function mergeSettings(settings = {}) {
  return { ...DEFAULT_SETTINGS, ...settings };
}

export function converge_boost(input = {}) {
  const error = {
    x: Number.isFinite(input.error?.x) ? input.error.x : 0,
    y: Number.isFinite(input.error?.y) ? input.error.y : 0
  };
  const previousError = {
    x: Number.isFinite(input.previousError?.x) ? input.previousError.x : error.x,
    y: Number.isFinite(input.previousError?.y) ? input.previousError.y : error.y
  };
  const safeDt = clamp(Number.isFinite(input.dt) ? input.dt : 1 / 240, 1 / 2000, 0.1);
  const deadzonePx = Math.max(0, Number.isFinite(input.deadzonePx) ? input.deadzonePx : 4);
  const minClosingRatePxS = Math.max(
    0,
    Number.isFinite(input.minClosingRatePxS) ? input.minClosingRatePxS : 80
  );
  const gain = Math.max(0, Number.isFinite(input.gain) ? input.gain : 0.45);
  const maxBoostPxS = Math.max(0, Number.isFinite(input.maxBoostPxS) ? input.maxBoostPxS : 220);
  const distance = magnitude(error);
  const previousDistance = magnitude(previousError);
  const closingRatePxS = (previousDistance - distance) / safeDt;

  if (distance <= deadzonePx) {
    return {
      active: false,
      velocity: { x: 0, y: 0 },
      closingRatePxS,
      distancePx: distance,
      reason: "deadzone"
    };
  }

  const closingDeficit = minClosingRatePxS - closingRatePxS;
  const boostSpeed = clamp(closingDeficit * gain, 0, maxBoostPxS);
  if (boostSpeed <= 0) {
    return {
      active: false,
      velocity: { x: 0, y: 0 },
      closingRatePxS,
      distancePx: distance,
      reason: "catching_up"
    };
  }

  return {
    active: true,
    velocity: {
      x: (error.x / distance) * boostSpeed,
      y: (error.y / distance) * boostSpeed
    },
    closingRatePxS,
    distancePx: distance,
    reason: "boost"
  };
}

export function createManualObserverState() {
  return {
    active: false,
    magnitude: 0,
    cooldownSec: 0,
    lastDelta: { x: 0, y: 0 }
  };
}

export function createControllerState() {
  return {
    integral: { x: 0, y: 0 },
    previousError: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    authority: 1,
    manual: createManualObserverState()
  };
}

export function updateManualObserver(manualState, manualDelta, dt, settings = {}) {
  const cfg = mergeSettings(settings);
  const observer = manualState ?? createManualObserverState();
  const safeDt = clamp(Number.isFinite(dt) ? dt : 1 / 240, 1 / 2000, 0.1);
  const delta = {
    x: Number.isFinite(manualDelta?.x) ? manualDelta.x : 0,
    y: Number.isFinite(manualDelta?.y) ? manualDelta.y : 0
  };
  const movement = magnitude(delta);
  const active = movement >= cfg.manualThreshold;

  observer.active = active;
  observer.magnitude = movement / safeDt;
  observer.lastDelta = delta;

  if (active) {
    observer.cooldownSec = cfg.manualHoldMs / 1000;
  } else {
    observer.cooldownSec = Math.max(0, observer.cooldownSec - safeDt);
  }

  return observer;
}

export function updateController(state, input) {
  const cfg = mergeSettings(input.settings);
  const safeDt = clamp(Number.isFinite(input.dt) ? input.dt : 1 / 240, 1 / 2000, 0.1);
  const error = {
    x: Number.isFinite(input.error?.x) ? input.error.x : 0,
    y: Number.isFinite(input.error?.y) ? input.error.y : 0
  };
  const manual = input.manual ?? state.manual ?? createManualObserverState();
  state.manual = manual;

  const underManualControl = manual.active || manual.cooldownSec > 0;
  if (underManualControl) {
    state.authority = Math.min(state.authority, cfg.manualAuthority);
    const bleed = Math.exp(-safeDt * 28);
    state.integral.x *= bleed;
    state.integral.y *= bleed;
  } else {
    const fadeSec = Math.max(0.001, cfg.manualFadeMs / 1000);
    const recoverAlpha = 1 - Math.exp(-safeDt / (fadeSec * 0.25));
    state.authority += (1 - state.authority) * recoverAlpha;
    state.integral.x = clamp(state.integral.x + error.x * safeDt, -500, 500);
    state.integral.y = clamp(state.integral.y + error.y * safeDt, -500, 500);
  }

  const targetSizePx = Math.max(1, Number.isFinite(input.targetSizePx) ? input.targetSizePx : cfg.sizeReferencePx);
  const sizeScale = clamp(Math.sqrt(cfg.sizeReferencePx / targetSizePx), 0.35, 1.8);
  const targetVelocity = {
    x: Number.isFinite(input.targetVelocity?.x) ? input.targetVelocity.x : 0,
    y: Number.isFinite(input.targetVelocity?.y) ? input.targetVelocity.y : 0
  };
  const derivative = {
    x: (error.x - state.previousError.x) / safeDt,
    y: (error.y - state.previousError.y) / safeDt
  };

  let desiredVelocity = {
    x: (cfg.kp * error.x + cfg.ki * state.integral.x + cfg.kd * derivative.x) * state.authority * sizeScale,
    y: (cfg.kp * error.y + cfg.ki * state.integral.y + cfg.kd * derivative.y) * state.authority * sizeScale
  };

  const errorDistance = magnitude(error);
  const velocityLeadPercent = clamp(Number.isFinite(cfg.velocityLeadPercent) ? cfg.velocityLeadPercent : 0, 0, 50);
  const velocityLeadDeadzonePx = Math.max(0, Number.isFinite(cfg.velocityLeadDeadzonePx) ? cfg.velocityLeadDeadzonePx : 4);
  if (velocityLeadPercent > 0 && errorDistance > velocityLeadDeadzonePx && !underManualControl) {
    const targetLeadScale = 1 + velocityLeadPercent / 100;
    desiredVelocity.x += targetVelocity.x * targetLeadScale * state.authority;
    desiredVelocity.y += targetVelocity.y * targetLeadScale * state.authority;
  }

  const convergeBoost = cfg.convergeBoostEnabled && !underManualControl
    ? converge_boost({
        error,
        previousError: state.previousError,
        dt: safeDt,
        deadzonePx: cfg.convergeBoostDeadzonePx,
        minClosingRatePxS: cfg.convergeBoostMinClosingRate,
        gain: cfg.convergeBoostGain,
        maxBoostPxS: cfg.convergeBoostMaxVelocity
      })
    : {
        active: false,
        velocity: { x: 0, y: 0 },
        closingRatePxS: 0,
        distancePx: errorDistance,
        reason: underManualControl ? "manual" : "disabled"
      };
  if (convergeBoost.active) {
    desiredVelocity.x += convergeBoost.velocity.x * state.authority * sizeScale;
    desiredVelocity.y += convergeBoost.velocity.y * state.authority * sizeScale;
  }

  const velocityMatchRadius = Math.max(2, targetSizePx * cfg.velocityMatchRadiusScale);
  if (cfg.velocityMatchGain > 0 && errorDistance <= velocityMatchRadius) {
    desiredVelocity.x += targetVelocity.x * cfg.velocityMatchGain;
    desiredVelocity.y += targetVelocity.y * cfg.velocityMatchGain;
    if (cfg.velocityPositionGain > 0) {
      desiredVelocity.x += (error.x * cfg.velocityPositionGain) / safeDt;
      desiredVelocity.y += (error.y * cfg.velocityPositionGain) / safeDt;
    }
  }

  const brakeRadius = Math.max(2, targetSizePx * cfg.brakeRadiusScale);
  if (cfg.brakeScale < 1 && errorDistance <= brakeRadius) {
    const brake = clamp(cfg.brakeScale, 0.05, 1);
    desiredVelocity.x *= brake;
    desiredVelocity.y *= brake;
  }

  const speedScale = clamp(cfg.speedScale, 0.05, 4);
  desiredVelocity = clampVector(desiredVelocity, cfg.maxSpeed * speedScale * state.authority);

  const accelLimit = Math.max(1, cfg.maxAccel * speedScale * Math.max(0.05, state.authority));
  const allowedDelta = accelLimit * safeDt;
  const velocityDelta = clampVector({
    x: desiredVelocity.x - state.velocity.x,
    y: desiredVelocity.y - state.velocity.y
  }, allowedDelta);

  state.velocity.x += velocityDelta.x;
  state.velocity.y += velocityDelta.y;
  state.previousError = error;

  const output = {
    x: state.velocity.x * safeDt,
    y: state.velocity.y * safeDt
  };

  return {
    output,
    velocity: { ...state.velocity },
    authority: state.authority,
    manualSpeed: manual.magnitude,
    targetVelocity,
    convergeBoost,
    mode: underManualControl ? "manual" : "track"
  };
}

export function computeConvergenceScore(errorPx, targetSizePx) {
  const size = Math.max(1, targetSizePx);
  const normalized = Math.max(0, errorPx) / size;
  return clamp(100 * Math.exp(-normalized * 5), 0, 100);
}
