import test from "node:test";
import assert from "node:assert/strict";

import {
  createSpeedControlsState,
  toggleSpeedControlsVisibility
} from "../src/ui_state.js";

test("speed controls start visible and toggle hidden/visible", () => {
  const state = createSpeedControlsState();

  assert.equal(state.hidden, false);
  assert.equal(state.buttonLabel, "Hide Speed Controls");

  toggleSpeedControlsVisibility(state);

  assert.equal(state.hidden, true);
  assert.equal(state.buttonLabel, "Show Speed Controls");

  toggleSpeedControlsVisibility(state);

  assert.equal(state.hidden, false);
  assert.equal(state.buttonLabel, "Hide Speed Controls");
});
