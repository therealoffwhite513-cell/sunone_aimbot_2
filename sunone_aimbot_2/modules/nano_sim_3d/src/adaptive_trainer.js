const DEFAULT_PROFILE = {
  kp: 4.0,
  ki: 0.15,
  kd: 0.08,
  maxSpeed: 900,
  maxAccel: 4200,
  speedScale: 1.0,
  brakeScale: 1.0,
  velocityMatchGain: 0.0,
  velocityPositionGain: 0.08,
  convergeBoostEnabled: false,
  convergeBoostDeadzonePx: 4,
  convergeBoostMinClosingRate: 80,
  convergeBoostGain: 0.45,
  convergeBoostMaxVelocity: 220
};

const PROFILE_LIMITS = {
  kp: [0.2, 12],
  ki: [0, 1],
  kd: [0, 0.8],
  maxSpeed: [80, 2200],
  maxAccel: [600, 12000],
  speedScale: [0.35, 1.8],
  brakeScale: [0.25, 1.0],
  velocityMatchGain: [0, 1.8],
  velocityPositionGain: [0, 0.4],
  convergeBoostDeadzonePx: [0, 24],
  convergeBoostMinClosingRate: [0, 320],
  convergeBoostGain: [0, 2],
  convergeBoostMaxVelocity: [0, 600]
};

const DEFAULT_SCENARIOS = ["stationary", "strafe", "depth", "zigzag", "jump", "sixdof"];

function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

function magnitude(v) {
  return Math.hypot(number(v?.x), number(v?.y));
}

function number(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function boolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value === "true" || value === "1";
  }
  if (Number.isFinite(value)) {
    return value !== 0;
  }
  return fallback;
}

function average(values) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values, p) {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = clamp(Math.ceil(sorted.length * p) - 1, 0, sorted.length - 1);
  return sorted[index];
}

function standardDeviation(values) {
  if (values.length < 2) {
    return 0;
  }
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

function sanitizeProfile(profile = {}) {
  const next = { ...DEFAULT_PROFILE, ...profile };
  for (const [key, [min, max]] of Object.entries(PROFILE_LIMITS)) {
    next[key] = clamp(Number(next[key]), min, max);
  }
  next.convergeBoostEnabled = boolean(next.convergeBoostEnabled);
  return next;
}

function boundedStep(current, factor, key) {
  const [min, max] = PROFILE_LIMITS[key];
  const limitedFactor = clamp(factor, 0.88, 1.12);
  return clamp(current * limitedFactor, min, max);
}

export function classifyDisturbance(sample = {}) {
  const manualDelta = sample.manualDelta ?? {};
  const error = sample.error ?? {};
  const manualDistance = magnitude(manualDelta);
  const threshold = Math.max(0, number(sample.manualThreshold, 2));

  if (manualDistance < threshold) {
    return {
      kind: "none",
      alignment: 1,
      manualSpeed: 0
    };
  }

  const errorDistance = magnitude(error);
  const dt = clamp(number(sample.dt, 1 / 240), 1 / 2000, 0.1);
  const alignment = errorDistance > 1e-6
    ? (number(manualDelta.x) * number(error.x) + number(manualDelta.y) * number(error.y)) /
      Math.max(1e-6, manualDistance * errorDistance)
    : 0;

  return {
    kind: alignment >= 0.35 ? "aligned_manual" : "external_interference",
    alignment,
    manualSpeed: manualDistance / dt
  };
}

export function scoreTrial(samples = []) {
  const valid = samples.filter((sample) => Number.isFinite(sample.errorPx));
  const scored = valid.filter((sample) => sample.disturbanceKind !== "external_interference");
  const usable = scored.length ? scored : valid;
  const sizes = usable.map((sample) => number(sample.targetSizePx, 80)).filter((value) => value > 0);
  const avgTargetSizePx = Math.max(1, average(sizes) || 80);
  const lockRadius = Math.max(4, avgTargetSizePx * 0.08);
  const errors = usable.map((sample) => Math.max(0, number(sample.errorPx)));
  const lockIndex = errors.findIndex((error) => error <= lockRadius);
  const lockedErrors = lockIndex >= 0 ? errors.slice(lockIndex) : errors.slice(Math.max(0, errors.length - 12));
  const avgErrorPx = average(errors);
  const p90ErrorPx = percentile(errors, 0.9);
  const avgLockedErrorPx = average(lockedErrors);
  const jitterPx = standardDeviation(lockedErrors);
  const overshootCount = usable.filter((sample) => Boolean(sample.overshot)).length;
  const steps = usable.map((sample) => Math.max(0, number(sample.controllerStepPx)));
  const stepDelta = steps.slice(1).map((value, index) => Math.abs(value - steps[index]));
  const jerkPx = average(stepDelta);
  const timeToLockRatio = lockIndex >= 0 ? lockIndex / Math.max(1, usable.length) : 1;
  const interferenceRatio = valid.length
    ? valid.filter((sample) => sample.disturbanceKind === "external_interference").length / valid.length
    : 0;

  let classification = "clean";
  if (overshootCount > 0) {
    classification = "overshoot";
  } else if (jitterPx > avgTargetSizePx * 0.12) {
    classification = "jitter";
  } else if (avgLockedErrorPx / avgTargetSizePx > 0.22 || timeToLockRatio > 0.55) {
    classification = "tracking_lag";
  }

  const penalty =
    timeToLockRatio * 22 +
    (avgLockedErrorPx / avgTargetSizePx) * 44 +
    (jitterPx / avgTargetSizePx) * 28 +
    overshootCount * 9 +
    jerkPx * 2 +
    Math.max(0, p90ErrorPx / avgTargetSizePx - 0.85) * 10;

  return {
    classification,
    samples: valid.length,
    scoredSamples: usable.length,
    score: clamp(100 - penalty, 0, 100),
    avgErrorPx,
    p90ErrorPx,
    avgLockedErrorPx,
    avgTargetSizePx,
    normalizedAvgError: avgErrorPx / avgTargetSizePx,
    normalizedLockedError: avgLockedErrorPx / avgTargetSizePx,
    jitterPx,
    overshootCount,
    jerkPx,
    timeToLockRatio,
    interferenceRatio
  };
}

export function suggestAdaptiveProfile(currentProfile = DEFAULT_PROFILE, metrics = {}) {
  const base = sanitizeProfile(currentProfile);
  const profile = { ...base };
  const reasons = [];
  const classification = metrics.classification ?? "clean";

  if (classification === "tracking_lag" || number(metrics.normalizedAvgError) > 0.35) {
    profile.kp = boundedStep(profile.kp, 1.06, "kp");
    profile.maxSpeed = boundedStep(profile.maxSpeed, 1.05, "maxSpeed");
    profile.maxAccel = boundedStep(profile.maxAccel, 1.04, "maxAccel");
    profile.speedScale = boundedStep(profile.speedScale, 1.04, "speedScale");
    profile.velocityMatchGain = clamp(profile.velocityMatchGain + 0.06, ...PROFILE_LIMITS.velocityMatchGain);
    profile.convergeBoostEnabled = true;
    profile.convergeBoostMinClosingRate = boundedStep(
      Math.max(profile.convergeBoostMinClosingRate, 1),
      1.05,
      "convergeBoostMinClosingRate"
    );
    profile.convergeBoostGain = boundedStep(
      Math.max(profile.convergeBoostGain, 0.01),
      1.04,
      "convergeBoostGain"
    );
    profile.convergeBoostMaxVelocity = boundedStep(
      Math.max(profile.convergeBoostMaxVelocity, 1),
      1.04,
      "convergeBoostMaxVelocity"
    );
    reasons.push("tracking_lag");
  }

  if (classification === "overshoot" || number(metrics.overshootCount) > 0) {
    profile.kp = boundedStep(profile.kp, 0.94, "kp");
    profile.ki = boundedStep(Math.max(profile.ki, 0.001), 0.90, "ki");
    profile.kd = boundedStep(Math.max(profile.kd, 0.01), 1.08, "kd");
    profile.brakeScale = boundedStep(profile.brakeScale, 0.90, "brakeScale");
    profile.speedScale = boundedStep(profile.speedScale, 0.94, "speedScale");
    profile.convergeBoostGain = boundedStep(Math.max(profile.convergeBoostGain, 0.01), 0.92, "convergeBoostGain");
    profile.convergeBoostMaxVelocity = boundedStep(
      Math.max(profile.convergeBoostMaxVelocity, 1),
      0.94,
      "convergeBoostMaxVelocity"
    );
    profile.convergeBoostDeadzonePx = boundedStep(
      Math.max(profile.convergeBoostDeadzonePx, 0.5),
      1.05,
      "convergeBoostDeadzonePx"
    );
    reasons.push("overshoot_brake");
  }

  if (classification === "jitter" || number(metrics.jitterPx) > number(metrics.avgTargetSizePx, 80) * 0.12) {
    profile.kp = boundedStep(profile.kp, 0.93, "kp");
    profile.ki = boundedStep(Math.max(profile.ki, 0.001), 0.88, "ki");
    profile.kd = boundedStep(Math.max(profile.kd, 0.01), 1.05, "kd");
    profile.maxAccel = boundedStep(profile.maxAccel, 0.94, "maxAccel");
    profile.speedScale = boundedStep(profile.speedScale, 0.93, "speedScale");
    profile.convergeBoostGain = boundedStep(Math.max(profile.convergeBoostGain, 0.01), 0.94, "convergeBoostGain");
    profile.convergeBoostMaxVelocity = boundedStep(
      Math.max(profile.convergeBoostMaxVelocity, 1),
      0.95,
      "convergeBoostMaxVelocity"
    );
    reasons.push("jitter_smoothing");
  }

  if (!reasons.length && number(metrics.score, 0) > 86) {
    profile.brakeScale = boundedStep(profile.brakeScale, 1.01, "brakeScale");
    profile.velocityMatchGain = clamp(profile.velocityMatchGain + 0.015, ...PROFILE_LIMITS.velocityMatchGain);
    reasons.push("stable_refine");
  }

  return {
    profile: sanitizeProfile(profile),
    reasons
  };
}

export function createAdaptiveTrainerState(options = {}) {
  return {
    enabled: Boolean(options.enabled),
    profile: sanitizeProfile(options.profile),
    scenarios: Array.isArray(options.scenarios) && options.scenarios.length
      ? [...options.scenarios]
      : [...DEFAULT_SCENARIOS],
    currentScenarioIndex: 0,
    currentScenario: (Array.isArray(options.scenarios) && options.scenarios.length ? options.scenarios[0] : DEFAULT_SCENARIOS[0]),
    trialDurationSec: Math.max(0.05, number(options.trialDurationSec, 3)),
    trialStartedAt: null,
    trialSamples: [],
    completedTrials: [],
    latestMetrics: null,
    latestDisturbance: { kind: "none", alignment: 1, manualSpeed: 0 },
    status: "idle"
  };
}

export function updateAdaptiveTrainer(state, sample = {}) {
  if (!state) {
    throw new Error("Adaptive trainer state is required.");
  }

  const time = number(sample.time, 0);
  if (state.trialStartedAt === null) {
    state.trialStartedAt = time;
  }

  const disturbance = classifyDisturbance(sample);
  state.latestDisturbance = disturbance;
  state.trialSamples.push({
    ...sample,
    disturbanceKind: disturbance.kind,
    disturbanceAlignment: disturbance.alignment
  });

  const elapsed = time - state.trialStartedAt;
  if (elapsed >= state.trialDurationSec && state.trialSamples.length > 1) {
    const metrics = scoreTrial(state.trialSamples);
    const suggestion = suggestAdaptiveProfile(state.profile, metrics);
    state.profile = suggestion.profile;
    state.latestMetrics = {
      ...metrics,
      reasons: suggestion.reasons
    };
    state.completedTrials.push({
      scenario: state.currentScenario,
      metrics: state.latestMetrics,
      profile: { ...state.profile }
    });
    state.currentScenarioIndex = (state.currentScenarioIndex + 1) % state.scenarios.length;
    state.currentScenario = state.scenarios[state.currentScenarioIndex];
    state.trialStartedAt = time;
    state.trialSamples = [];
    state.status = `trained:${state.latestMetrics.classification}`;
  } else {
    state.status = state.enabled ? "collecting" : "idle";
  }

  return {
    profile: state.profile,
    status: state.status,
    disturbance,
    metrics: state.latestMetrics,
    scenario: state.currentScenario
  };
}

export function exportAdaptiveProfile(state) {
  const payload = {
    version: 1,
    profile: sanitizeProfile(state?.profile),
    completedTrials: state?.completedTrials?.length ?? 0,
    latestMetrics: state?.latestMetrics ?? null,
    exportedAt: new Date().toISOString()
  };
  return JSON.stringify(payload, null, 2);
}

export function importAdaptiveProfile(json) {
  const payload = typeof json === "string" ? JSON.parse(json) : json;
  return {
    version: 1,
    profile: sanitizeProfile(payload?.profile),
    completedTrials: Math.max(0, Number(payload?.completedTrials) || 0),
    latestMetrics: payload?.latestMetrics ?? null
  };
}
