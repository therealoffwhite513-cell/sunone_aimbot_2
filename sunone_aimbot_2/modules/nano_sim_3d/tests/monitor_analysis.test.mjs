import test from "node:test";
import assert from "node:assert/strict";

import { analyzeSamples } from "../src/monitor_analysis.js";

test("monitor analysis identifies clean convergence", () => {
  const samples = Array.from({ length: 20 }, (_, index) => ({
    time: index / 20,
    errorPx: 2,
    targetSizePx: 80,
    detectionJumpPx: 0,
    controllerStepPx: 0.2,
    score: 90
  }));

  const result = analyzeSamples("stationary", samples);

  assert.equal(result.classification, "clean");
  assert.equal(result.recommendations.length, 0);
});

test("monitor analysis identifies lateral lag without detection jumps", () => {
  const samples = Array.from({ length: 60 }, (_, index) => ({
    time: index / 20,
    errorPx: 42 + Math.sin(index) * 3,
    targetSizePx: 70,
    detectionJumpPx: 4,
    controllerStepPx: 8,
    score: 15
  }));

  const result = analyzeSamples("strafe", samples);

  assert.equal(result.classification, "tracking_lag");
  assert.ok(result.recommendations.some((item) => item.includes("feed-forward")));
});

test("monitor analysis identifies reacquire failures after large jumps", () => {
  const samples = Array.from({ length: 60 }, (_, index) => ({
    time: index / 20,
    errorPx: index < 20 ? 460 - index * 8 : 110,
    targetSizePx: 70,
    detectionJumpPx: index === 1 ? 440 : 0,
    controllerStepPx: 4,
    score: 0
  }));

  const result = analyzeSamples("jump", samples);

  assert.equal(result.classification, "reacquire_slow");
  assert.ok(result.recommendations.some((item) => item.includes("reacquire")));
});
