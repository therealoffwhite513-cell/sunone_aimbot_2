export function createCsvLogger() {
  const rows = [];
  const columns = [
    "time_s",
    "scenario",
    "target_x",
    "target_y",
    "target_z",
    "target_a",
    "target_b",
    "target_c",
    "pose_x",
    "pose_y",
    "pose_z",
    "pose_a",
    "pose_b",
    "pose_c",
    "anchor_front_x",
    "anchor_front_y",
    "anchor_front_z",
    "anchor_front_box_x",
    "anchor_front_box_y",
    "anchor_front_box_width",
    "anchor_front_box_height",
    "anchor_front_world_x",
    "anchor_front_world_y",
    "anchor_front_world_z",
    "anchor_top_x",
    "anchor_top_y",
    "anchor_top_z",
    "anchor_top_box_x",
    "anchor_top_box_y",
    "anchor_top_box_width",
    "anchor_top_box_height",
    "anchor_top_world_x",
    "anchor_top_world_y",
    "anchor_top_world_z",
    "anchor_left_x",
    "anchor_left_y",
    "anchor_left_z",
    "anchor_left_box_x",
    "anchor_left_box_y",
    "anchor_left_box_width",
    "anchor_left_box_height",
    "anchor_left_world_x",
    "anchor_left_world_y",
    "anchor_left_world_z",
    "anchor_right_x",
    "anchor_right_y",
    "anchor_right_z",
    "anchor_right_box_x",
    "anchor_right_box_y",
    "anchor_right_box_width",
    "anchor_right_box_height",
    "anchor_right_world_x",
    "anchor_right_world_y",
    "anchor_right_world_z",
    "detection_x",
    "detection_y",
    "aim_x",
    "aim_y",
    "box_center_x",
    "box_center_y",
    "box_width",
    "box_height",
    "crosshair_x",
    "crosshair_y",
    "error_x",
    "error_y",
    "error_px",
    "target_size_px",
    "controller_dx",
    "controller_dy",
    "manual_dx",
    "manual_dy",
    "authority",
    "manual_speed",
    "camera_x",
    "camera_y",
    "camera_z",
    "camera_yaw",
    "camera_pitch",
    "pov_locked",
    "input_mode",
    "fps",
    "mode",
    "convergence_score",
    "target_vx_px_s",
    "target_vy_px_s",
    "target_ax_px_s2",
    "target_ay_px_s2",
    "pid_governor_enabled",
    "pid_governor_lead_percent",
    "adaptive_enabled",
    "adaptive_status",
    "adaptive_trial",
    "adaptive_scenario",
    "adaptive_score",
    "adaptive_classification",
    "adaptive_kp",
    "adaptive_ki",
    "adaptive_kd",
    "adaptive_max_speed",
    "adaptive_max_accel",
    "adaptive_speed_scale",
    "adaptive_brake_scale",
    "adaptive_velocity_match_gain",
    "adaptive_velocity_position_gain",
    "adaptive_converge_boost_enabled",
    "adaptive_converge_boost_deadzone_px",
    "adaptive_converge_boost_min_closing_rate",
    "adaptive_converge_boost_gain",
    "adaptive_converge_boost_max_velocity",
    "converge_boost_active",
    "converge_boost_vx_px_s",
    "converge_boost_vy_px_s",
    "converge_boost_closing_rate_px_s",
    "converge_boost_distance_px",
    "converge_boost_reason",
    "disturbance_kind",
    "disturbance_alignment",
    "disturbance_manual_speed"
  ];

  return {
    rows,
    columns,
    add(row) {
      rows.push(row);
    },
    clear() {
      rows.length = 0;
    },
    toCsv() {
      const lines = [columns.join(",")];
      for (const row of rows) {
        lines.push(columns.map((column) => serialize(row[column])).join(","));
      }
      return lines.join("\n");
    },
    download(filename = "nano_sim_3d_log.csv") {
      const blob = new Blob([this.toCsv()], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };
}

function serialize(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toFixed(5) : "";
  }
  if (value === undefined || value === null) {
    return "";
  }
  return String(value).replaceAll(",", " ");
}
