import test from "node:test";
import assert from "node:assert/strict";

import {
  SIM_POSE_ANCHORS,
  SIM_YOLO_CLASS_NAMES,
  clampBox,
  createPoseSidecar,
  splitName,
  toYoloLabel,
  toYoloLabelText,
  toYoloLabels
} from "../src/yolo_dataset.js";

test("YOLO labels normalize box center and size", () => {
  assert.equal(
    toYoloLabel({ x: 320, y: 240, width: 160, height: 120 }, 640, 480),
    "0 0.500000 0.500000 0.250000 0.250000"
  );
});

test("boxes are clamped to the image before YOLO conversion", () => {
  const box = clampBox({ x: 20, y: 20, width: 100, height: 80 }, 640, 480);
  assert.deepEqual(box, { x: 35, y: 30, width: 70, height: 60 });
});

test("split selection is deterministic", () => {
  assert.equal(splitName(0, 1000, 0.8), "train");
  assert.equal(splitName(799, 1000, 0.8), "train");
  assert.equal(splitName(800, 1000, 0.8), "val");
});

test("split selection creates validation rows for smaller datasets", () => {
  assert.equal(splitName(703, 800, 0.88), "train");
  assert.equal(splitName(704, 800, 0.88), "val");
});

test("YOLO class names include body target and pose anchors", () => {
  assert.deepEqual(SIM_YOLO_CLASS_NAMES, [
    "sim_target",
    "sim_front",
    "sim_top",
    "sim_left",
    "sim_right"
  ]);
  assert.deepEqual(SIM_POSE_ANCHORS.map((anchor) => anchor.name), [
    "front",
    "top",
    "left",
    "right"
  ]);
});

test("multi-label helper emits target plus pose anchor labels", () => {
  const sample = {
    box: { x: 50, y: 50, width: 20, height: 10 },
    anchors: {
      front: { box: { x: 10, y: 20, width: 8, height: 6 } },
      top: { box: { x: 30, y: 40, width: 10, height: 8 } },
      left: { box: { x: 45, y: 55, width: 12, height: 14 } },
      right: { box: { x: 80, y: 70, width: 16, height: 18 } }
    }
  };

  assert.deepEqual(toYoloLabels(sample, 100, 100), [
    "0 0.500000 0.500000 0.200000 0.100000",
    "1 0.100000 0.200000 0.080000 0.060000",
    "2 0.300000 0.400000 0.100000 0.080000",
    "3 0.450000 0.550000 0.120000 0.140000",
    "4 0.800000 0.700000 0.160000 0.180000"
  ]);
  assert.equal(toYoloLabelText(sample, 100, 100).endsWith("\n"), true);
});

test("pose sidecar preserves six degree pose and anchor metadata", () => {
  const sample = {
    world: { x: 1.25, y: 2.5, z: -3.75, a: 0.1, b: -0.2, c: 0.3, scale: 1.1 },
    anchors: {
      front: {
        className: "sim_front",
        classId: 1,
        x: 12,
        y: 24,
        z: 0.42,
        box: { x: 12, y: 24, width: 6, height: 8 },
        world: { x: 0.1, y: 1.2, z: -0.3 }
      }
    }
  };

  const sidecar = createPoseSidecar(sample);

  assert.deepEqual(sidecar.pose, { x: 1.25, y: 2.5, z: -3.75, a: 0.1, b: -0.2, c: 0.3 });
  assert.deepEqual(sidecar.world, sample.world);
  assert.equal(sidecar.anchors.front.className, "sim_front");
  assert.equal(sidecar.anchors.front.classId, 1);
  assert.deepEqual(sidecar.anchors.front.box, sample.anchors.front.box);
  assert.deepEqual(sidecar.anchors.front.world, sample.anchors.front.world);
});
