import test from "node:test";
import assert from "node:assert/strict";

import {
  converge_boost,
  createControllerState,
  updateController,
  updateManualObserver
} from "../src/controller.js";

test("converge_boost stays inactive inside the deadzone", () => {
  const boost = converge_boost({
    error: { x: 2, y: -1 },
    previousError: { x: 3, y: -1 },
    dt: 1 / 240,
    deadzonePx: 4,
    minClosingRatePxS: 80,
    gain: 0.5,
    maxBoostPxS: 120
  });

  assert.equal(boost.active, false);
  assert.deepEqual(boost.velocity, { x: 0, y: 0 });
});

test("converge_boost pushes toward center when convergence is stalled", () => {
  const boost = converge_boost({
    error: { x: 40, y: 0 },
    previousError: { x: 40.2, y: 0 },
    dt: 1 / 120,
    deadzonePx: 4,
    minClosingRatePxS: 120,
    gain: 0.5,
    maxBoostPxS: 80
  });

  assert.equal(boost.active, true);
  assert.ok(boost.velocity.x > 0);
  assert.equal(boost.velocity.y, 0);
  assert.ok(boost.closingRatePxS < 120);
});

test("converge_boost stays inactive when convergence is already catching up", () => {
  const boost = converge_boost({
    error: { x: 38, y: 0 },
    previousError: { x: 52, y: 0 },
    dt: 1 / 120,
    deadzonePx: 4,
    minClosingRatePxS: 120,
    gain: 0.5,
    maxBoostPxS: 80
  });

  assert.equal(boost.active, false);
  assert.deepEqual(boost.velocity, { x: 0, y: 0 });
});

test("controller output moves toward the target when no manual disturbance is present", () => {
  const state = createControllerState();
  const result = updateController(state, {
    error: { x: 120, y: -60 },
    dt: 1 / 240,
    targetSizePx: 80,
    manual: updateManualObserver(state.manual, { x: 0, y: 0 }, 1 / 240),
    settings: {
      kp: 4.0,
      ki: 0.2,
      kd: 0.1,
      maxSpeed: 900,
      maxAccel: 4000,
      manualThreshold: 2,
      manualAuthority: 0.15,
      manualHoldMs: 140,
      manualFadeMs: 220,
      sizeReferencePx: 80
    }
  });

  assert.ok(result.output.x > 0);
  assert.ok(result.output.y < 0);
  assert.equal(result.mode, "track");
});

test("manual disturbance reduces authority and bleeds integral state", () => {
  const baseline = createControllerState();
  baseline.integral.x = 80;
  baseline.integral.y = -40;

  const disturbed = createControllerState();
  disturbed.integral.x = 80;
  disturbed.integral.y = -40;

  const settings = {
    kp: 4.0,
    ki: 0.2,
    kd: 0.1,
    maxSpeed: 900,
    maxAccel: 4000,
    manualThreshold: 2,
    manualAuthority: 0.15,
    manualHoldMs: 140,
    manualFadeMs: 220,
    sizeReferencePx: 80
  };

  const noManual = updateController(baseline, {
    error: { x: 100, y: 0 },
    dt: 1 / 240,
    targetSizePx: 80,
    manual: updateManualObserver(baseline.manual, { x: 0, y: 0 }, 1 / 240),
    settings
  });

  const withManual = updateController(disturbed, {
    error: { x: 100, y: 0 },
    dt: 1 / 240,
    targetSizePx: 80,
    manual: updateManualObserver(disturbed.manual, { x: 14, y: 0 }, 1 / 240),
    settings
  });

  assert.equal(withManual.mode, "manual");
  assert.ok(Math.abs(withManual.output.x) < Math.abs(noManual.output.x));
  assert.ok(Math.abs(disturbed.integral.x) < Math.abs(baseline.integral.x));
});

test("controller authority fades back after manual movement stops", () => {
  const state = createControllerState();
  const settings = {
    kp: 4.0,
    ki: 0.2,
    kd: 0.1,
    maxSpeed: 900,
    maxAccel: 4000,
    manualThreshold: 2,
    manualAuthority: 0.15,
    manualHoldMs: 80,
    manualFadeMs: 120,
    sizeReferencePx: 80
  };

  updateController(state, {
    error: { x: 100, y: 0 },
    dt: 1 / 240,
    targetSizePx: 80,
    manual: updateManualObserver(state.manual, { x: 16, y: 0 }, 1 / 240),
    settings
  });

  const manualAuthority = state.authority;

  for (let i = 0; i < 80; i += 1) {
    updateController(state, {
      error: { x: 100, y: 0 },
      dt: 1 / 240,
      targetSizePx: 80,
      manual: updateManualObserver(state.manual, { x: 0, y: 0 }, 1 / 240),
      settings
    });
  }

  assert.ok(manualAuthority < 0.5);
  assert.ok(state.authority > manualAuthority);
  assert.ok(state.authority > 0.9);
});

test("adaptive velocity matching reduces lag on moving targets", () => {
  const settings = {
    kp: 2.0,
    ki: 0,
    kd: 0,
    maxSpeed: 900,
    maxAccel: 9000,
    manualThreshold: 2,
    manualAuthority: 0.15,
    manualHoldMs: 140,
    manualFadeMs: 220,
    sizeReferencePx: 80
  };
  const withoutMatch = createControllerState();
  const withMatch = createControllerState();
  let errorWithout = 8;
  let errorWith = 8;
  const dt = 1 / 240;
  const targetVelocity = { x: 120, y: 0 };

  for (let i = 0; i < 160; i += 1) {
    const manualWithout = updateManualObserver(withoutMatch.manual, { x: 0, y: 0 }, dt, settings);
    const outWithout = updateController(withoutMatch, {
      error: { x: errorWithout, y: 0 },
      dt,
      targetSizePx: 80,
      manual: manualWithout,
      targetVelocity,
      settings
    });
    errorWithout += targetVelocity.x * dt - outWithout.output.x;

    const manualWith = updateManualObserver(withMatch.manual, { x: 0, y: 0 }, dt, settings);
    const outWith = updateController(withMatch, {
      error: { x: errorWith, y: 0 },
      dt,
      targetSizePx: 80,
      manual: manualWith,
      targetVelocity,
      settings: {
        ...settings,
        velocityMatchGain: 1.0,
        velocityPositionGain: 0.08
      }
    });
    errorWith += targetVelocity.x * dt - outWith.output.x;
  }

  assert.ok(Math.abs(errorWith) < Math.abs(errorWithout));
  assert.ok(Math.abs(errorWith) < 4);
});

test("target lead percent adds adjustable feed-forward outside the deadzone", () => {
  const state = createControllerState();
  const dt = 1 / 240;
  const result = updateController(state, {
    error: { x: 40, y: 0 },
    dt,
    targetSizePx: 80,
    manual: updateManualObserver(state.manual, { x: 0, y: 0 }, dt),
    targetVelocity: { x: 100, y: 0 },
    settings: {
      kp: 0,
      ki: 0,
      kd: 0,
      maxSpeed: 900,
      maxAccel: 100000,
      manualThreshold: 2,
      manualAuthority: 0.15,
      manualHoldMs: 140,
      manualFadeMs: 220,
      sizeReferencePx: 80,
      velocityLeadPercent: 10,
      velocityLeadDeadzonePx: 4
    }
  });

  assert.ok(Math.abs(result.velocity.x - 110) < 0.001);
  assert.equal(result.velocity.y, 0);
});

test("adaptive brake scale limits near-center overshoot", () => {
  const baseSettings = {
    kp: 8.0,
    ki: 0,
    kd: 0,
    maxSpeed: 1600,
    maxAccel: 16000,
    manualThreshold: 2,
    manualAuthority: 0.15,
    manualHoldMs: 140,
    manualFadeMs: 220,
    sizeReferencePx: 80
  };
  const raw = createControllerState();
  const braked = createControllerState();
  const dt = 1 / 120;

  const rawOut = updateController(raw, {
    error: { x: 3, y: 0 },
    dt,
    targetSizePx: 80,
    manual: updateManualObserver(raw.manual, { x: 0, y: 0 }, dt, baseSettings),
    settings: baseSettings
  });
  const brakedOut = updateController(braked, {
    error: { x: 3, y: 0 },
    dt,
    targetSizePx: 80,
    manual: updateManualObserver(braked.manual, { x: 0, y: 0 }, dt, baseSettings),
    settings: {
      ...baseSettings,
      brakeScale: 0.35
    }
  });

  assert.ok(Math.abs(brakedOut.output.x) < Math.abs(rawOut.output.x));
  assert.ok(Math.abs(brakedOut.output.x) < 3);
});

test("controller applies converge_boost when enabled and error is not closing", () => {
  const baseSettings = {
    kp: 0.3,
    ki: 0,
    kd: 0,
    maxSpeed: 900,
    maxAccel: 24000,
    manualThreshold: 2,
    manualAuthority: 0.15,
    manualHoldMs: 140,
    manualFadeMs: 220,
    sizeReferencePx: 80
  };
  const normal = createControllerState();
  const boosted = createControllerState();
  const dt = 1 / 120;

  updateController(normal, {
    error: { x: 60, y: 0 },
    dt,
    targetSizePx: 80,
    manual: updateManualObserver(normal.manual, { x: 0, y: 0 }, dt, baseSettings),
    settings: baseSettings
  });
  updateController(boosted, {
    error: { x: 60, y: 0 },
    dt,
    targetSizePx: 80,
    manual: updateManualObserver(boosted.manual, { x: 0, y: 0 }, dt, baseSettings),
    settings: {
      ...baseSettings,
      convergeBoostEnabled: true,
      convergeBoostDeadzonePx: 4,
      convergeBoostMinClosingRate: 120,
      convergeBoostGain: 0.8,
      convergeBoostMaxVelocity: 180
    }
  });

  const normalOut = updateController(normal, {
    error: { x: 60, y: 0 },
    dt,
    targetSizePx: 80,
    manual: updateManualObserver(normal.manual, { x: 0, y: 0 }, dt, baseSettings),
    settings: baseSettings
  });
  const boostedOut = updateController(boosted, {
    error: { x: 60, y: 0 },
    dt,
    targetSizePx: 80,
    manual: updateManualObserver(boosted.manual, { x: 0, y: 0 }, dt, baseSettings),
    settings: {
      ...baseSettings,
      convergeBoostEnabled: true,
      convergeBoostDeadzonePx: 4,
      convergeBoostMinClosingRate: 120,
      convergeBoostGain: 0.8,
      convergeBoostMaxVelocity: 180
    }
  });

  assert.equal(boostedOut.convergeBoost.active, true);
  assert.ok(boostedOut.output.x > normalOut.output.x);
});
