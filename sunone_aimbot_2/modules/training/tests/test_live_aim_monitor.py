import importlib.util
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPO_ROOT / "monitor_aim_realtime.py"


def load_script_module():
    spec = importlib.util.spec_from_file_location("monitor_aim_realtime", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class LiveAimMonitorTests(unittest.TestCase):
    def test_script_exists_at_repo_root(self):
        self.assertTrue(SCRIPT_PATH.exists())

    def test_event_classifier_explains_reacquire_and_low_iou(self):
        module = load_script_module()

        jump = module.classify_event(
            {
                "event_reason": "large_pivot_jump",
                "missed_frames": "6",
                "pivot_jump": "155.4",
                "association_iou": "0.008",
                "association_distance": "34.5",
            },
            jump_threshold=18.0,
        )
        self.assertEqual(jump.kind, "JUMP")
        self.assertIn("low IoU", jump.message)
        self.assertIn("reacquire", jump.message)

    def test_event_classifier_no_longer_handles_legacy_head_projection(self):
        module = load_script_module()
        source = SCRIPT_PATH.read_text(encoding="utf-8", errors="replace")

        self.assertNotIn("head_to_player_projection", source)
        self.assertNotIn("head_projection_recentered", source)
        self.assertNotIn("HEAD_FALLBACK", source)
        self.assertNotIn("HEAD_GUARD", source)

    def test_full_sample_classifier_flags_error_output_and_divergence(self):
        module = load_script_module()
        previous = {"track_id": "2", "active": "1", "error_distance": "24.0"}
        current = {
            "timestamp_ms": "1002",
            "track_id": "2",
            "active": "1",
            "observed": "1",
            "error_distance": "36.0",
            "mouse_dx": "5",
            "mouse_dy": "0",
            "target_aim_width": "28",
            "target_aim_height": "35",
            "confidence": "0.7",
        }

        alerts = module.classify_full_sample(
            current,
            previous_by_track={"2": previous},
            error_threshold=30.0,
            output_threshold=4,
        )
        messages = " ".join(alert.message for alert in alerts)

        self.assertIn("error=36.0", messages)
        self.assertIn("output spike", messages)
        self.assertIn("not converging", messages)

    def test_once_mode_reads_csvs_and_emits_alerts(self):
        module = load_script_module()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            events = root / "events.csv"
            full = root / "full.csv"
            events.write_text(
                "\n".join(
                    [
                        "timestamp_ms,source,event_reason,track_id,class_id,head_aim,missed_frames,confidence,box_x,box_y,box_w,box_h,aim_x,aim_y,aim_w,aim_h,old_pivot_x,old_pivot_y,new_pivot_x,new_pivot_y,pivot_jump,association_score,association_distance,association_iou",
                        "10,aim_diag_event,large_pivot_jump,2,0,1,5,0.2,0,0,100,180,40,20,28,35,100,100,160,30,92.1,0.6,40,0.01",
                    ]
                )
                + "\n",
                encoding="utf-8",
            )
            full.write_text(
                "\n".join(
                    [
                        "timestamp_ms,source,track_id,class_id,observed,active,error_x,error_y,error_distance,target_outer_width,target_outer_height,target_aim_width,target_aim_height,target_metric_width,target_metric_height,target_size,normalized_bullseye_error,bullseye_radius_px,bullseye_hold,confidence,target_vx,target_vy,target_ax,target_ay,pid_p_x,pid_p_y,pid_i_x,pid_i_y,pid_d_x,pid_d_y,output_scale,governor_kp_scale,governor_ki_scale,governor_kd_scale,governor_speed_scale,governor_active,pixel_dx,pixel_dy,mouse_dx,mouse_dy,closing_rate,overshoot_risk,dt",
                        "11,aim_diag_full,2,0,1,1,35,0,35,100,180,28,35,28,35,31,1.0,1.0,0,0.7,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,0,5,0,5,0,-10,0,0.002",
                    ]
                )
                + "\n",
                encoding="utf-8",
            )

            alerts = module.collect_once(events, full, jump_threshold=18.0, error_threshold=30.0, output_threshold=4)

        messages = "\n".join(alert.message for alert in alerts)
        self.assertIn("large pivot jump", messages)
        self.assertIn("error=35.0", messages)

    def test_cpp_diagnostics_flush_after_each_row(self):
        target_cpp = (REPO_ROOT / "sunone_aimbot_2/mouse/AimbotTarget.cpp").read_text(
            encoding="utf-8", errors="replace"
        )
        mouse_cpp = (REPO_ROOT / "sunone_aimbot_2/mouse/mouse.cpp").read_text(
            encoding="utf-8", errors="replace"
        )

        self.assertIn("file.flush();", target_cpp)
        self.assertIn("file.flush();", mouse_cpp)


if __name__ == "__main__":
    unittest.main()
