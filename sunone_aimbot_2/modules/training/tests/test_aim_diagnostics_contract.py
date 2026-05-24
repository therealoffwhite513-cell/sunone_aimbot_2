import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


class AimDiagnosticsContractTests(unittest.TestCase):
    def read(self, relative: str) -> str:
        return (REPO_ROOT / relative).read_text(encoding="utf-8", errors="replace")

    def test_config_exposes_aim_diagnostics_controls(self):
        header = self.read("sunone_aimbot_2/config/config.h")
        source = self.read("sunone_aimbot_2/config/config.cpp")

        for field in [
            "aim_diagnostics_full_log_enabled",
            "aim_diagnostics_event_log_enabled",
            "aim_diagnostics_full_log_path",
            "aim_diagnostics_event_log_path",
            "aim_diagnostics_full_sample_stride",
            "aim_diagnostics_jump_threshold_px",
        ]:
            self.assertIn(field, header)
            self.assertIn(field, source)

        self.assertIn("aim_diagnostics_full_log_enabled = false", source)
        self.assertIn("aim_diagnostics_event_log_enabled = false", source)
        self.assertIn('"training/logs/aim_diagnostics_full.csv"', source)
        self.assertIn('"training/logs/aim_diagnostics_events.csv"', source)

    def test_debug_gui_surfaces_aim_diagnostics(self):
        debug = self.read("sunone_aimbot_2/overlay/draw_debug.cpp")

        self.assertIn('OverlayUI::BeginSection("Aim Diagnostics"', debug)
        self.assertIn('ImGui::Checkbox("Full aim CSV"', debug)
        self.assertIn('ImGui::Checkbox("Event CSV"', debug)
        self.assertIn('ImGui::InputText("Full log"', debug)
        self.assertIn('ImGui::InputText("Event log"', debug)
        self.assertIn('ImGui::SliderInt("Full sample stride"', debug)
        self.assertIn('ImGui::SliderFloat("Jump threshold px"', debug)

    def test_pid_observation_carries_target_metadata_to_full_log(self):
        pid_header = self.read("sunone_aimbot_2/mouse/PidMouseController.h")
        mouse_header = self.read("sunone_aimbot_2/mouse/mouse.h")
        mouse_cpp = self.read("sunone_aimbot_2/mouse/mouse.cpp")
        loop = self.read("sunone_aimbot_2/runtime/mouse_thread_loop.cpp")

        for token in [
            "trackId",
            "classId",
            "outerWidth",
            "outerHeight",
            "aimWidth",
            "aimHeight",
        ]:
            self.assertIn(token, pid_header + mouse_header + mouse_cpp)

        self.assertIn("appendAimDiagnosticsFullSample", mouse_cpp)
        self.assertIn("aim_diag_full", mouse_cpp)
        self.assertIn("track_id,class_id", mouse_cpp)
        self.assertIn("target_aim_width,target_aim_height", mouse_cpp)
        self.assertIn("mouseThread.moveMouse(*activeTarget)", loop)

    def test_tracker_event_log_labels_suspicious_transitions(self):
        target_cpp = self.read("sunone_aimbot_2/mouse/AimbotTarget.cpp")

        self.assertIn("appendAimDiagnosticsEvent", target_cpp)
        for reason in [
            "reacquire_smoothing",
            "large_pivot_jump",
            "missed_prediction",
            "locked_track_changed",
        ]:
            self.assertIn(reason, target_cpp)

        self.assertNotIn("head_to_player_projection", target_cpp)
        self.assertNotIn("head_projection_recentered", target_cpp)
        self.assertIn("aim_diag_event", target_cpp)
        self.assertIn("event_reason", target_cpp)
        self.assertIn("config.aim_diagnostics_event_log_enabled", target_cpp)


if __name__ == "__main__":
    unittest.main()
