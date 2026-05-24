import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


class AiTrainingRollbackContractTests(unittest.TestCase):
    def read(self, relative: str) -> str:
        return (REPO_ROOT / relative).read_text(encoding="utf-8", errors="replace")

    def test_ai_training_tab_and_runtime_config_are_removed(self):
        checked_files = [
            "sunone_aimbot_2/config/config.h",
            "sunone_aimbot_2/config/config.cpp",
            "sunone_aimbot_2/mouse/mouse.cpp",
            "sunone_aimbot_2/overlay/draw_settings.h",
            "sunone_aimbot_2/overlay/overlay.cpp",
            "sunone_aimbot_2/sunone_aimbot_2.vcxproj",
            "sunone_aimbot_2/sunone_aimbot_2.vcxproj.filters",
        ]

        for relative in checked_files:
            with self.subTest(file=relative):
                source = self.read(relative)
                self.assertNotIn("ai_training_", source)
                self.assertNotIn("AI_Training", source)
                self.assertNotIn("draw_ai_training", source)

        self.assertFalse((REPO_ROOT / "sunone_aimbot_2/overlay/draw_ai_training.cpp").exists())

    def test_diagnostic_logging_controls_remain_available(self):
        config_h = self.read("sunone_aimbot_2/config/config.h")
        config_cpp = self.read("sunone_aimbot_2/config/config.cpp")
        debug_ui = self.read("sunone_aimbot_2/overlay/draw_debug.cpp")
        mouse_cpp = self.read("sunone_aimbot_2/mouse/mouse.cpp")
        target_cpp = self.read("sunone_aimbot_2/mouse/AimbotTarget.cpp")

        for field in [
            "aim_diagnostics_full_log_enabled",
            "aim_diagnostics_event_log_enabled",
            "aim_diagnostics_full_log_path",
            "aim_diagnostics_event_log_path",
            "aim_diagnostics_full_sample_stride",
            "aim_diagnostics_jump_threshold_px",
        ]:
            self.assertIn(field, config_h)
            self.assertIn(field, config_cpp)

        self.assertIn("Aim Diagnostics", debug_ui)
        self.assertIn("appendAimDiagnosticsFullSample", mouse_cpp)
        self.assertIn("appendAimDiagnosticsEvent", target_cpp)
        self.assertIn("file.flush();", mouse_cpp)
        self.assertIn("file.flush();", target_cpp)

    def test_head_only_switch_remains_and_legacy_projection_is_removed(self):
        config_h = self.read("sunone_aimbot_2/config/config.h")
        target_ui = self.read("sunone_aimbot_2/overlay/draw_target.cpp")
        aimbot_target = self.read("sunone_aimbot_2/mouse/AimbotTarget.cpp")

        self.assertIn("disable_headshot", config_h)
        self.assertIn("aim_head_only_enabled", config_h)
        self.assertIn("Aim head only", target_ui)
        self.assertIn("config.aim_head_only_enabled && !disableHeadshot", aimbot_target)
        self.assertIn("cls != config.class_head", aimbot_target)
        self.assertIn("!disableHeadshot", aimbot_target)
        self.assertNotIn("aim_project_player_to_head_enabled", config_h + target_ui + aimbot_target)
        self.assertNotIn("Project player-only to head", target_ui)


if __name__ == "__main__":
    unittest.main()
