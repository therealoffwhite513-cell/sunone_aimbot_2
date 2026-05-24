import test from "node:test";
import assert from "node:assert/strict";

import { formatIssue, rankConvergenceIssues } from "../src/diagnostic_analysis.js";

test("diagnostic ranking reports no issues for stable convergence", () => {
  const samples = Array.from({ length: 80 }, (_, index) => ({
    time: index / 60,
    fps: 60,
    errorPx: 2,
    targetSizePx: 80,
    detectionJumpPx: 0,
    controllerStepPx: 0.5,
    targetAgeMs: 16,
    score: 95,
    overshootCount: 0
  }));

  assert.deepEqual(rankConvergenceIssues(samples), []);
});

test("diagnostic ranking identifies detection instability and reacquire delay", () => {
  const samples = Array.from({ length: 90 }, (_, index) => ({
    time: index / 60,
    fps: 60,
    errorPx: index < 20 ? 150 : 85,
    targetSizePx: 55,
    detectionJumpPx: index === 4 ? 260 : index % 17 === 0 ? 80 : 4,
    controllerStepPx: 4,
    targetAgeMs: index % 19 === 0 ? 260 : 32,
    score: 18,
    overshootCount: 0
  }));

  const issues = rankConvergenceIssues(samples);
  const ids = issues.map((issue) => issue.id);

  assert.ok(ids.includes("detection_instability"));
  assert.ok(ids.includes("reacquire_delay"));
  assert.ok(issues[0].score >= issues.at(-1).score);
});

test("diagnostic ranking identifies multi-module interactions", () => {
  const samples = Array.from({ length: 100 }, (_, index) => ({
    time: index / 60,
    fps: index % 8 === 0 ? 32 : 60,
    errorPx: 92 + Math.sin(index) * 8,
    targetSizePx: 60,
    detectionJumpPx: index % 13 === 0 ? 150 : 12,
    controllerStepPx: index % 5 === 0 ? 58 : 34,
    targetAgeMs: index % 9 === 0 ? 210 : 24,
    score: 12,
    overshootCount: Math.floor(index / 8)
  }));

  const issues = rankConvergenceIssues(samples);
  const interaction = issues.find((issue) => issue.id === "multi_module_interaction");

  assert.ok(interaction);
  assert.ok(interaction.modules.includes("controller"));
  assert.match(formatIssue(interaction), /Multi-module interaction/);
});
