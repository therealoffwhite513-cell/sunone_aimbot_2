import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyDisturbance,
  createAdaptiveTrainerState,
  exportAdaptiveProfile,
  importAdaptiveProfile,
  scoreTrial,
  suggestAdaptiveProfile,
  updateAdaptiveTrainer
} from "../src/adaptive_trainer.js";

test("disturbance classifier separates aligned movement from outside interference", () => {
  const aligned = classifyDisturbance({
    error: { x: 120, y: 0 },
    manualDelta: { x: 10, y: 1 },
    dt: 1 / 240,
    manualThreshold: 2
  });
  const outside = classifyDisturbance({
    error: { x: 120, y: 0 },
    manualDelta: { x: -8, y: 12 },
    dt: 1 / 240,
    manualThreshold: 2
  });

  assert.equal(aligned.kind, "aligned_manual");
  assert.equal(outside.kind, "external_interference");
  assert.ok(outside.alignment < 0.35);
});

test("trial scoring rewards smooth lock and discounts external interference frames", () => {
  const smoothSamples = Array.from({ length: 90 }, (_, index) => ({
    time: index / 240,
    errorPx: index < 25 ? 80 - index * 3 : 3,
    targetSizePx: 80,
    controllerStepPx: index < 25 ? 1.4 : 0.12,
    overshot: false,
    disturbanceKind: "none"
  }));
  const noisySamples = smoothSamples.map((sample, index) => ({
    ...sample,
    errorPx: index > 35 ? 22 + Math.sin(index) * 8 : sample.errorPx,
    controllerStepPx: index > 35 ? 5.5 : sample.controllerStepPx,
    overshot: index === 45 || index === 70,
    disturbanceKind: index % 9 === 0 ? "external_interference" : "none"
  }));

  const smooth = scoreTrial(smoothSamples);
  const noisy = scoreTrial(noisySamples);

  assert.ok(smooth.score > 80);
  assert.ok(noisy.score < smooth.score);
  assert.ok(noisy.interferenceRatio > 0);
});

test("profile suggestions stay bounded and respond to lag, overshoot, and jitter", () => {
  const base = {
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

  const lag = suggestAdaptiveProfile(base, {
    classification: "tracking_lag",
    score: 45,
    overshootCount: 0,
    jitterPx: 1,
    normalizedAvgError: 0.8
  });
  const overshoot = suggestAdaptiveProfile(base, {
    classification: "overshoot",
    score: 40,
    overshootCount: 4,
    jitterPx: 2,
    normalizedAvgError: 0.25
  });
  const jitter = suggestAdaptiveProfile(base, {
    classification: "jitter",
    score: 55,
    overshootCount: 0,
    jitterPx: 14,
    normalizedAvgError: 0.2
  });

  assert.ok(lag.profile.kp > base.kp);
  assert.ok(lag.profile.velocityMatchGain > base.velocityMatchGain);
  assert.equal(lag.profile.convergeBoostEnabled, true);
  assert.ok(lag.profile.convergeBoostGain > base.convergeBoostGain);
  assert.ok(overshoot.profile.brakeScale < base.brakeScale);
  assert.ok(overshoot.profile.kd > base.kd);
  assert.ok(overshoot.profile.convergeBoostGain < base.convergeBoostGain);
  assert.ok(jitter.profile.kp < base.kp);
  assert.ok(Math.abs(lag.profile.kp - base.kp) <= base.kp * 0.12);
});

test("adaptive trainer cycles trials and exports/imports a stable profile", () => {
  const trainer = createAdaptiveTrainerState({
    trialDurationSec: 0.1,
    scenarios: ["stationary", "strafe"]
  });

  let update = null;
  for (let i = 0; i < 40; i += 1) {
    update = updateAdaptiveTrainer(trainer, {
      time: i / 240,
      dt: 1 / 240,
      scenario: trainer.currentScenario,
      error: { x: Math.max(0, 80 - i * 4), y: 0 },
      errorPx: Math.max(2, 80 - i * 4),
      targetSizePx: 80,
      controllerOutput: { x: 1, y: 0 },
      manualDelta: { x: 0, y: 0 },
      targetVelocity: { x: 40, y: 0 },
      controllerStepPx: 1,
      overshot: false
    });
  }

  assert.ok(trainer.completedTrials.length >= 1);
  assert.equal(update.profile, trainer.profile);

  const json = exportAdaptiveProfile(trainer);
  const imported = importAdaptiveProfile(json);

  assert.equal(imported.version, 1);
  assert.equal(imported.profile.kp, trainer.profile.kp);
  assert.ok(imported.completedTrials >= 1);
});
