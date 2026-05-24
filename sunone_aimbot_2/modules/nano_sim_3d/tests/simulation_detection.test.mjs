import test from "node:test";
import assert from "node:assert/strict";

import {
  SCENARIOS,
  createSimulationState,
  maybeUpdateDetection,
  updateTarget
} from "../src/simulation.js";

const poseKeys = ["x", "y", "z", "a", "b", "c"];

test("simulation target state carries XYZ ABC pose fields", () => {
  const state = createSimulationState();
  for (const key of poseKeys) {
    assert.equal(Number.isFinite(state.target[key]), true);
    assert.equal(Number.isFinite(state.previousTarget[key]), true);
  }
});

test("every scenario emits finite XYZ ABC target pose", () => {
  for (const scenario of SCENARIOS) {
    const state = createSimulationState();
    const target = updateTarget(state, 1 / 60, scenario.id, {
      targetSpeed: 1.2,
      depthRange: 4.0,
      verticalRange: 0.8,
      rotationSpeed: 1.1
    });

    for (const key of poseKeys) {
      assert.equal(Number.isFinite(target[key]), true, `${scenario.id}.${key}`);
    }
  }
});

test("sixdof scenario moves all XYZ ABC channels", () => {
  const state = createSimulationState();
  const settings = {
    targetSpeed: 1.25,
    depthRange: 5.0,
    verticalRange: 0.9,
    rotationSpeed: 1.35
  };
  const first = { ...updateTarget(state, 1 / 60, "sixdof", settings) };
  for (let i = 0; i < 180; i += 1) {
    updateTarget(state, 1 / 60, "sixdof", settings);
  }
  const later = state.target;

  for (const key of poseKeys) {
    assert.ok(Math.abs(later[key] - first[key]) > 0.001, key);
  }
});

test("default target motion stays close to center for diagnostics", () => {
  for (const scenario of SCENARIOS) {
    const state = createSimulationState();
    const settings = {
      targetSpeed: 1.0,
      depthRange: 4.0,
      verticalRange: 0.7,
      rotationSpeed: 1.0
    };
    let maxAbsX = 0;
    let maxVerticalOffset = 0;

    for (let i = 0; i < 360; i += 1) {
      const target = updateTarget(state, 1 / 60, scenario.id, settings);
      maxAbsX = Math.max(maxAbsX, Math.abs(target.x));
      maxVerticalOffset = Math.max(maxVerticalOffset, Math.abs(target.y - 1.25));
    }

    assert.ok(maxAbsX <= 1.45, `${scenario.id} x offset ${maxAbsX}`);
    assert.ok(maxVerticalOffset <= 0.35, `${scenario.id} y offset ${maxVerticalOffset}`);
  }
});

test("detection keeps aim point separate from visual box center", () => {
  const state = createSimulationState();
  state.time = 1;

  const detection = maybeUpdateDetection(state, {
    aim: { x: 320, y: 240 },
    box: { x: 320, y: 330, width: 120, height: 220 },
    visible: true
  }, {
    detectionFps: 60,
    dropout: 0,
    noisePx: 0
  });

  assert.equal(detection.aimX, 320);
  assert.equal(detection.aimY, 240);
  assert.equal(detection.x, 320);
  assert.equal(detection.y, 240);
  assert.equal(detection.boxX, 320);
  assert.equal(detection.boxY, 330);
  assert.equal(detection.boxWidth, 120);
  assert.equal(detection.boxHeight, 220);
});

test("detection carries current target pose and projected anchors", () => {
  const state = createSimulationState();
  state.time = 1;
  const pose = { x: 1.2, y: 1.4, z: -2.6, a: 0.11, b: -0.22, c: 0.33 };
  const anchors = {
    front: {
      className: "sim_front",
      classId: 1,
      x: 300,
      y: 220,
      z: 0.2,
      box: { x: 300, y: 220, width: 20, height: 22 },
      world: { x: 1.2, y: 1.4, z: -2.1 }
    }
  };

  const detection = maybeUpdateDetection(state, {
    aim: { x: 320, y: 240 },
    box: { x: 320, y: 330, width: 120, height: 220 },
    visible: true,
    pose,
    anchors
  }, {
    detectionFps: 60,
    dropout: 0,
    noisePx: 0
  });

  assert.deepEqual(detection.targetPose, pose);
  assert.deepEqual(detection.anchors.front.box, anchors.front.box);
  assert.deepEqual(state.targetPose, pose);
  assert.deepEqual(state.projectedAnchors.front.world, anchors.front.world);
});

test("detection dropout still refreshes target pose and anchors", () => {
  const state = createSimulationState();
  state.time = 1;
  const pose = { x: -0.5, y: 1.1, z: -3.2, a: -0.1, b: 0.2, c: -0.3 };
  const anchors = {
    top: {
      className: "sim_top",
      classId: 2,
      x: 310,
      y: 190,
      z: 0.1,
      box: { x: 310, y: 190, width: 18, height: 16 },
      world: { x: -0.5, y: 2.0, z: -3.2 }
    }
  };

  const detection = maybeUpdateDetection(state, {
    aim: { x: 320, y: 240 },
    box: { x: 320, y: 330, width: 120, height: 220 },
    visible: true,
    pose,
    anchors
  }, {
    detectionFps: 60,
    dropout: 1,
    noisePx: 0
  });

  assert.equal(detection, null);
  assert.deepEqual(state.targetPose, pose);
  assert.deepEqual(state.projectedAnchors.top.box, anchors.top.box);
});
