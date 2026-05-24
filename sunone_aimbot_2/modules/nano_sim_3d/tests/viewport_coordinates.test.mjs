import test from "node:test";
import assert from "node:assert/strict";

import { browserCenterToCanvas } from "../src/viewport_coordinates.js";

test("browser center maps into canvas coordinates when a side panel shifts viewport center", () => {
  const point = browserCenterToCanvas({
    rect: { left: 0, top: 0, width: 940, height: 800 },
    canvasWidth: 1410,
    canvasHeight: 1200,
    windowWidth: 1280,
    windowHeight: 800
  });

  assert.equal(point.x, 960);
  assert.equal(point.y, 600);
});

test("browser center accounts for canvas offset from the window", () => {
  const point = browserCenterToCanvas({
    rect: { left: 20, top: 10, width: 960, height: 540 },
    canvasWidth: 960,
    canvasHeight: 540,
    windowWidth: 1000,
    windowHeight: 600
  });

  assert.equal(point.x, 480);
  assert.equal(point.y, 290);
});
