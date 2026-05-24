import test from "node:test";
import assert from "node:assert/strict";

import {
  createAimRuntime,
  handleAutoAimHotkey,
  shouldApplySimulationAim
} from "../src/debug_settings.js";

test("F3 toggles simulation auto aim without reacting to key repeat", () => {
  const runtime = createAimRuntime({ autoAimEnabled: false });

  const first = handleAutoAimHotkey(runtime, { code: "F3", repeat: false });
  assert.equal(first, true);
  assert.equal(runtime.autoAimEnabled, true);

  const repeated = handleAutoAimHotkey(runtime, { code: "F3", repeat: true });
  assert.equal(repeated, false);
  assert.equal(runtime.autoAimEnabled, true);

  const second = handleAutoAimHotkey(runtime, { code: "F3", repeat: false });
  assert.equal(second, true);
  assert.equal(runtime.autoAimEnabled, false);
});

test("simulation aim applies only when auto aim is enabled and movement is internal", () => {
  assert.equal(shouldApplySimulationAim({
    autoAimEnabled: true,
    externalMovement: false
  }), true);

  assert.equal(shouldApplySimulationAim({
    autoAimEnabled: false,
    externalMovement: false
  }), false);

  assert.equal(shouldApplySimulationAim({
    autoAimEnabled: true,
    externalMovement: true
  }), false);
});
