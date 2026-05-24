import test from "node:test";
import assert from "node:assert/strict";

import { createCsvLogger } from "../src/logger.js";

test("csv logger includes adaptive convergence fields", () => {
  const logger = createCsvLogger();

  logger.add({
    time_s: 0,
    scenario: "stationary",
    target_x: 0.25,
    target_y: 1.5,
    target_z: -2.25,
    target_a: 0.1,
    target_b: -0.2,
    target_c: 0.3,
    pose_x: 0.25,
    pose_y: 1.5,
    pose_z: -2.25,
    pose_a: 0.1,
    pose_b: -0.2,
    pose_c: 0.3,
    anchor_front_x: 321,
    anchor_front_y: 222,
    anchor_front_z: 0.2,
    anchor_front_box_x: 321,
    anchor_front_box_y: 222,
    anchor_front_box_width: 18,
    anchor_front_box_height: 20,
    anchor_front_world_x: 0.2,
    anchor_front_world_y: 1.5,
    anchor_front_world_z: -1.8,
    adaptive_enabled: 1,
    adaptive_status: "collecting",
    adaptive_score: 88.5,
    adaptive_classification: "clean",
    disturbance_kind: "none",
    adaptive_kp: 4.2,
    adaptive_ki: 0.12,
    adaptive_kd: 0.09,
    adaptive_velocity_match_gain: 0.3,
    pid_governor_enabled: 1,
    pid_governor_lead_percent: 10,
    adaptive_converge_boost_enabled: 1,
    converge_boost_active: 1,
    converge_boost_closing_rate_px_s: 18,
    target_vx_px_s: 12,
    target_vy_px_s: -4
  });

  const csv = logger.toCsv();

  assert.match(csv, /adaptive_enabled/);
  assert.match(csv, /adaptive_velocity_match_gain/);
  assert.match(csv, /pid_governor_lead_percent/);
  assert.match(csv, /converge_boost_active/);
  assert.match(csv, /target_x,target_y,target_z,target_a,target_b,target_c/);
  assert.match(csv, /pose_x,pose_y,pose_z,pose_a,pose_b,pose_c/);
  assert.match(csv, /anchor_front_x/);
  assert.match(csv, /anchor_front_world_z/);
  assert.match(csv, /target_vx_px_s/);
  assert.match(csv, /collecting/);
});
