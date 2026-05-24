import test from "node:test";
import assert from "node:assert/strict";

import {
  applyControllerPixelsToPov,
  applyMouseLook,
  createPovState,
  getForwardVector,
  movePov
} from "../src/pov_controls.js";

test("mouse look uses inverted vertical movement and clamps pitch", () => {
  const pov = createPovState();
  applyMouseLook(pov, { movementX: 100, movementY: 10000 }, { sensitivity: 0.002 });

  assert.equal(Number(pov.yaw.toFixed(3)), -0.2);
  assert.ok(pov.pitch > -1.57);
  assert.ok(pov.pitch < -1.3);
});

test("forward movement follows yaw on the horizontal plane", () => {
  const pov = createPovState();
  pov.yaw = Math.PI / 2;
  movePov(pov, {
    keys: new Set(["KeyW"]),
    dt: 1,
    moveSpeed: 3,
    sprintMultiplier: 1
  });

  assert.ok(pov.position.x < -2.99);
  assert.ok(Math.abs(pov.position.z - 8) < 0.001);
});

test("controller pixel correction can steer the POV", () => {
  const pov = createPovState();
  applyControllerPixelsToPov(pov, { x: 20, y: -10 }, { sensitivity: 0.0008 });

  assert.ok(pov.yaw < 0);
  assert.ok(pov.pitch > 0);
});

test("forward vector points down negative z by default", () => {
  const pov = createPovState();
  const forward = getForwardVector(pov);

  assert.equal(Number(forward.x.toFixed(3)), 0);
  assert.equal(Number(forward.z.toFixed(3)), -1);
});
