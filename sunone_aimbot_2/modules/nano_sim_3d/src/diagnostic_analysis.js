const ISSUE_DEFINITIONS = {
  movement_scaling_mismatch: {
    title: "Movement scaling mismatch",
    modules: ["movement", "controller"],
    suggestion: "Check FOV, sensitivity, pitch/yaw conversion, and whether simulated movement units match runtime mouse counts."
  },
  detection_instability: {
    title: "Detection instability",
    modules: ["detection", "tracking"],
    suggestion: "Inspect detection noise, target dropout, NMS/class filtering, and whether stale boxes are being reused."
  },
  controller_overcorrection: {
    title: "Controller overcorrection",
    modules: ["controller", "movement"],
    suggestion: "Lower proportional/boost response or increase damping when error sign flips repeatedly."
  },
  controller_under_response: {
    title: "Controller under-response",
    modules: ["controller", "movement"],
    suggestion: "Increase controller authority, max speed, or prediction/feed-forward for sustained tracking lag."
  },
  reacquire_delay: {
    title: "Reacquire delay",
    modules: ["detection", "tracking", "controller"],
    suggestion: "Add or tune a reacquire mode that resets stale velocity/integral state after large detection jumps."
  },
  timing_jitter: {
    title: "Timing jitter",
    modules: ["runtime", "capture"],
    suggestion: "Compare frame time variance, capture FPS, and actuator tick timing before tuning controller gains."
  },
  live_device_latency: {
    title: "Live device latency",
    modules: ["controls", "runtime"],
    suggestion: "Measure selected device round-trip latency in armed live-path tests; avoid falling back to another device."
  },
  multi_module_interaction: {
    title: "Multi-module interaction",
    modules: ["detection", "tracking", "controller", "runtime"],
    suggestion: "Treat this as an interaction problem first: reduce one module at a time and compare the issue ranking."
  }
};

export function rankConvergenceIssues(samples, options = {}) {
  const windowSize = options.windowSize ?? 180;
  const valid = samples
    .filter((sample) => Number.isFinite(sample?.errorPx))
    .slice(-windowSize);

  if (!valid.length) {
    return [];
  }

  const metrics = computeMetrics(valid);
  const issues = [
    scoreMovementScalingMismatch(metrics),
    scoreDetectionInstability(metrics),
    scoreControllerOvercorrection(metrics),
    scoreControllerUnderResponse(metrics),
    scoreReacquireDelay(metrics),
    scoreTimingJitter(metrics),
    scoreLiveDeviceLatency(metrics)
  ].filter((issue) => issue.severity >= 0.08);

  const strongIssues = issues.filter((issue) => issue.severity >= 0.42);
  if (strongIssues.length >= 2) {
    const severity = clamp01(average(strongIssues.map((issue) => issue.severity)) + 0.12);
    issues.push(makeIssue("multi_module_interaction", severity, 0.64 + Math.min(0.3, strongIssues.length * 0.08), [
      `${strongIssues.length} issue families are active in the same sample window`,
      `top modules: ${[...new Set(strongIssues.flatMap((issue) => issue.modules))].slice(0, 4).join(", ")}`
    ]));
  }

  return issues
    .map((issue) => ({
      ...issue,
      severity: round(issue.severity),
      confidence: round(clamp01(issue.confidence)),
      score: round(issue.severity * issue.confidence)
    }))
    .sort((a, b) => b.score - a.score || b.severity - a.severity);
}

export function formatIssue(issue) {
  return `${issue.title}: severity=${issue.severity.toFixed(2)} confidence=${issue.confidence.toFixed(2)}`;
}

function computeMetrics(samples) {
  const errors = samples.map((sample) => sample.errorPx);
  const sizes = samples
    .map((sample) => sample.targetSizePx)
    .filter((value) => Number.isFinite(value) && value > 0);
  const jumps = samples.map((sample) => finiteOrZero(sample.detectionJumpPx));
  const steps = samples.map((sample) => finiteOrZero(sample.controllerStepPx));
  const scores = samples.map((sample) => finiteOrZero(sample.score));
  const targetAges = samples.map((sample) => finiteOrZero(sample.targetAgeMs));
  const fpsValues = samples.map((sample) => finiteOrZero(sample.fps)).filter((value) => value > 0);
  const manualSpeeds = samples.map((sample) => finiteOrZero(sample.manualSpeed));
  const liveLatencies = samples.map((sample) => finiteOrZero(sample.liveDeviceLatencyMs));
  const overshoots = samples.map((sample) => finiteOrZero(sample.overshootCount));
  const modes = samples.map((sample) => sample.mode ?? sample.inputMode ?? "");

  const avgSize = Math.max(1, average(sizes));
  const avgError = average(errors);
  const p90Error = percentile(errors, 0.9);
  const maxError = Math.max(...errors);
  const avgStep = average(steps);
  const p90Step = percentile(steps, 0.9);
  const maxJump = Math.max(...jumps);
  const p90Jump = percentile(jumps, 0.9);
  const avgScore = average(scores);
  const maxAge = Math.max(...targetAges);
  const fpsJitter = coefficientOfVariation(fpsValues);
  const ageJitter = coefficientOfVariation(targetAges.filter((value) => value > 0));
  const overshootDelta = Math.max(...overshoots) - Math.min(...overshoots);

  return {
    sampleCount: samples.length,
    avgSize,
    avgError,
    p90Error,
    maxError,
    normalizedAvgError: avgError / avgSize,
    normalizedP90Error: p90Error / avgSize,
    normalizedMaxError: maxError / avgSize,
    avgStep,
    p90Step,
    normalizedAvgStep: avgStep / avgSize,
    normalizedP90Step: p90Step / avgSize,
    maxJump,
    p90Jump,
    normalizedMaxJump: maxJump / avgSize,
    normalizedP90Jump: p90Jump / avgSize,
    avgScore,
    maxAge,
    fpsJitter,
    ageJitter,
    overshootDelta,
    avgManualSpeed: average(manualSpeeds),
    maxLiveLatency: Math.max(0, ...liveLatencies),
    modes
  };
}

function scoreMovementScalingMismatch(metrics) {
  const errorPressure = smoothstep(0.35, 1.4, metrics.normalizedP90Error);
  const weakMotion = 1 - smoothstep(0.08, 0.55, metrics.normalizedP90Step);
  const stableDetection = 1 - smoothstep(0.35, 1.25, metrics.normalizedP90Jump);
  const severity = errorPressure * (0.45 + weakMotion * 0.35 + stableDetection * 0.2);
  return makeIssue("movement_scaling_mismatch", severity, 0.55 + stableDetection * 0.25, [
    `p90 error is ${metrics.p90Error.toFixed(1)} px (${metrics.normalizedP90Error.toFixed(2)}x target size)`,
    `p90 controller step is ${metrics.p90Step.toFixed(1)} px`
  ]);
}

function scoreDetectionInstability(metrics) {
  const jumpPressure = smoothstep(0.45, 2.5, Math.max(metrics.normalizedP90Jump, metrics.normalizedMaxJump * 0.65));
  const agePressure = smoothstep(120, 500, metrics.maxAge);
  const severity = clamp01(jumpPressure * 0.75 + agePressure * 0.25);
  return makeIssue("detection_instability", severity, 0.58 + jumpPressure * 0.27, [
    `max detection jump is ${metrics.maxJump.toFixed(1)} px`,
    `max target age is ${metrics.maxAge.toFixed(0)} ms`
  ]);
}

function scoreControllerOvercorrection(metrics) {
  const overshootPressure = smoothstep(2, 12, metrics.overshootDelta);
  const highStep = smoothstep(0.25, 1.4, metrics.normalizedP90Step);
  const severity = clamp01(overshootPressure * 0.7 + highStep * smoothstep(0.25, 0.9, metrics.normalizedP90Error) * 0.3);
  return makeIssue("controller_overcorrection", severity, 0.56 + overshootPressure * 0.3, [
    `overshoot count changed by ${metrics.overshootDelta.toFixed(0)} in the active window`,
    `p90 controller step is ${metrics.p90Step.toFixed(1)} px`
  ]);
}

function scoreControllerUnderResponse(metrics) {
  const errorPressure = smoothstep(0.45, 1.6, metrics.normalizedAvgError);
  const lowStep = 1 - smoothstep(0.18, 0.85, metrics.normalizedAvgStep);
  const lowScore = 1 - smoothstep(35, 85, metrics.avgScore);
  const severity = clamp01(errorPressure * (0.45 + lowStep * 0.35 + lowScore * 0.2));
  return makeIssue("controller_under_response", severity, 0.52 + lowStep * 0.32, [
    `average error is ${metrics.avgError.toFixed(1)} px`,
    `average controller step is ${metrics.avgStep.toFixed(1)} px`
  ]);
}

function scoreReacquireDelay(metrics) {
  const jumpPressure = smoothstep(1.3, 4.2, metrics.normalizedMaxJump);
  const lingeringError = smoothstep(0.8, 2.0, metrics.normalizedP90Error);
  const agePressure = smoothstep(100, 420, metrics.maxAge);
  const severity = clamp01(jumpPressure * 0.5 + lingeringError * 0.35 + agePressure * 0.15);
  return makeIssue("reacquire_delay", severity, 0.5 + jumpPressure * 0.35, [
    `large jump ratio is ${metrics.normalizedMaxJump.toFixed(2)}x target size`,
    `p90 error after updates is ${metrics.p90Error.toFixed(1)} px`
  ]);
}

function scoreTimingJitter(metrics) {
  const fpsPressure = smoothstep(0.08, 0.38, metrics.fpsJitter);
  const agePressure = smoothstep(0.2, 0.8, metrics.ageJitter);
  const severity = clamp01(fpsPressure * 0.65 + agePressure * 0.35);
  return makeIssue("timing_jitter", severity, 0.48 + Math.max(fpsPressure, agePressure) * 0.34, [
    `fps jitter coefficient is ${metrics.fpsJitter.toFixed(2)}`,
    `target-age jitter coefficient is ${metrics.ageJitter.toFixed(2)}`
  ]);
}

function scoreLiveDeviceLatency(metrics) {
  const latencyPressure = smoothstep(4, 24, metrics.maxLiveLatency);
  const armedMode = metrics.modes.some((mode) => String(mode).includes("live") || String(mode).includes("device"));
  const severity = latencyPressure * (armedMode ? 1 : 0.55);
  return makeIssue("live_device_latency", severity, armedMode ? 0.82 : 0.48, [
    `max live device latency is ${metrics.maxLiveLatency.toFixed(1)} ms`,
    armedMode ? "live-path timing is active" : "no armed live-path timing is active"
  ]);
}

function makeIssue(id, severity, confidence, evidence) {
  const definition = ISSUE_DEFINITIONS[id];
  return {
    id,
    title: definition.title,
    severity: clamp01(severity),
    confidence: clamp01(confidence),
    modules: definition.modules,
    evidence,
    suggestion: definition.suggestion
  };
}

function finiteOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}

function average(values) {
  const valid = values.filter(Number.isFinite);
  if (!valid.length) {
    return 0;
  }
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function percentile(values, p) {
  const valid = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!valid.length) {
    return 0;
  }
  const index = Math.min(valid.length - 1, Math.max(0, Math.ceil(valid.length * p) - 1));
  return valid[index];
}

function coefficientOfVariation(values) {
  const valid = values.filter((value) => Number.isFinite(value) && value >= 0);
  if (valid.length < 4) {
    return 0;
  }
  const mean = average(valid);
  if (mean <= 0) {
    return 0;
  }
  const variance = average(valid.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance) / mean;
}

function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) {
    return value >= edge1 ? 1 : 0;
  }
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
