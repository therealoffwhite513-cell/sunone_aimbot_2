import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("debug harness UI mirrors main project tabs and hides standalone controls", () => {
  const html = readFileSync(join(root, "index.html"), "utf8");
  const app = readFileSync(join(root, "src", "app.js"), "utf8");

  assert.match(html, /Main GUI Mirror/);
  assert.match(html, /id="mainGuiTabs"/);
  for (const panel of [
    "Capture",
    "Target",
    "Mouse",
    "AI",
    "Neural",
    "Buttons",
    "Overlay",
    "Game Overlay",
    "Stats",
    "Debug"
  ]) {
    assert.match(html, new RegExp(`data-panel="${panel}"`));
  }

  assert.match(html, /Model Selector/);
  assert.match(html, /id="runtimeBackendValue"/);
  assert.match(html, /id="modelSelector"/);
  assert.match(html, /id="autoAimToggle"/);
  assert.match(html, /id="aimModeValue"/);
  assert.match(html, /id="confidenceThreshold"/);
  assert.match(html, /id="nmsThreshold"/);
  assert.match(html, /id="pidGovernorSpeed"/);
  assert.match(html, /id="pidGovernorBlend"/);
  assert.match(html, /id="pidGovernorLead"/);
  assert.match(html, /id="circleFovRadius"/);
  assert.match(html, /id="simDefaults"[^>]*hidden/);

  assert.doesNotMatch(html, />Controller Diagnostics</);
  assert.doesNotMatch(html, />Trainer Monitor</);
  assert.doesNotMatch(html, />Internal Controller Steers</);
  assert.doesNotMatch(html, />Simulation Movement Sink</);
  assert.doesNotMatch(html, />Kp</);
  assert.doesNotMatch(html, />Ki</);
  assert.doesNotMatch(html, />Kd</);
  assert.doesNotMatch(html, />Adaptive Trainer</);
  assert.doesNotMatch(html, />Converge Boost</);

  assert.match(app, /createCartoonTargetRig/);
  assert.match(app, /animateCartoonTargetRig/);
});
