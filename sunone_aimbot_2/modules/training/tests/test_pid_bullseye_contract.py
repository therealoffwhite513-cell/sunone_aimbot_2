import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


class PidBullseyeContractTests(unittest.TestCase):
    def read(self, relative: str) -> str:
        return (REPO_ROOT / relative).read_text(encoding="utf-8", errors="replace")

    def test_config_exposes_normalized_bullseye_settings(self):
        header = self.read("sunone_aimbot_2/config/config.h")
        source = self.read("sunone_aimbot_2/config/config.cpp")

        for field in [
            "pid_bullseye_radius_scale",
            "pid_bullseye_min_radius_px",
            "pid_bullseye_exit_scale",
            "pid_bullseye_hold_feedforward",
            "pid_bullseye_hold_damping",
        ]:
            self.assertIn(field, header)
            self.assertIn(field, source)

        self.assertIn("pid_bullseye_radius_scale = 0.010f", source)
        self.assertIn("pid_bullseye_min_radius_px = 4.0f", source)
        self.assertIn("pid_bullseye_exit_scale = 1.80f", source)
        self.assertIn("pid_bullseye_hold_feedforward = 0.0f", source)
        self.assertIn("pid_bullseye_hold_damping = 1.0f", source)

    def test_pid_controller_tracks_bullseye_hold_and_velocity_feedforward(self):
        header = self.read("sunone_aimbot_2/mouse/PidMouseController.h")
        source = self.read("sunone_aimbot_2/mouse/PidMouseController.cpp")

        for token in [
            "bullseyeRadiusScale",
            "bullseyeMinRadiusPx",
            "bullseyeExitScale",
            "bullseyeHoldFeedforward",
            "bullseyeHoldDamping",
            "normalizedBullseyeError",
            "bullseyeRadiusPx",
            "bullseyeHold",
            "bullseyeHoldMode",
        ]:
            self.assertIn(token, header + source)

        self.assertIn("targetVx * dtSeconds * settings.bullseyeHoldFeedforward", source)
        self.assertIn("targetVy * dtSeconds * settings.bullseyeHoldFeedforward", source)
        self.assertIn("outX *= settings.bullseyeHoldDamping", source)
        self.assertIn("outY *= settings.bullseyeHoldDamping", source)

    def test_gui_and_training_log_surface_bullseye_metrics(self):
        overlay = self.read("sunone_aimbot_2/overlay/draw_mouse.cpp")
        mouse = self.read("sunone_aimbot_2/mouse/mouse.cpp")

        self.assertIn('ImGui::SliderFloat("Bullseye / size"', overlay)
        self.assertIn('ImGui::SliderFloat("Bullseye min px"', overlay)
        self.assertIn('ImGui::SliderFloat("Bullseye exit scale"', overlay)
        self.assertIn('ImGui::SliderFloat("Hold feedforward"', overlay)
        self.assertIn('ImGui::SliderFloat("Hold damping"', overlay)

        self.assertIn("normalized_bullseye_error", mouse)
        self.assertIn("bullseye_radius_px", mouse)
        self.assertIn("bullseye_hold", mouse)

    def test_pid_aim_size_scale_shrinks_convergence_metrics(self):
        header = self.read("sunone_aimbot_2/config/config.h")
        source = self.read("sunone_aimbot_2/config/config.cpp")
        overlay = self.read("sunone_aimbot_2/overlay/draw_mouse.cpp")
        mouse = self.read("sunone_aimbot_2/mouse/mouse.cpp")

        self.assertIn("pid_aim_size_scale", header)
        self.assertIn("pid_aim_size_scale = 0.50f", source)
        self.assertIn('ImGui::SliderFloat("Aim size scale"', overlay)
        self.assertIn("const double aimSizeScale", mouse)
        self.assertIn("observation.width = aimWidth * aimSizeScale", mouse)
        self.assertIn("observation.height = aimHeight * aimSizeScale", mouse)


if __name__ == "__main__":
    unittest.main()
