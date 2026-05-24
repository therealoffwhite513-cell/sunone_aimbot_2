import tempfile
import unittest
from pathlib import Path

from training.pid_governor.dataset import PidConfig, load_pid_config


REPO_ROOT = Path(__file__).resolve().parents[2]


class PidDefaultValuesContractTests(unittest.TestCase):
    def read(self, relative_path):
        return (REPO_ROOT / relative_path).read_text(encoding="utf-8")

    def test_source_config_defaults_match_working_dml_pid_values(self):
        config_cpp = self.read("sunone_aimbot_2/config/config.cpp")
        overlay_cpp = self.read("sunone_aimbot_2/overlay/draw_mouse.cpp")
        neural_cpp = self.read("sunone_aimbot_2/overlay/draw_neural.cpp")
        mouse_h = self.read("sunone_aimbot_2/mouse/PidMouseController.h")
        mouse_cpp = self.read("sunone_aimbot_2/mouse/PidMouseController.cpp")

        for source in (config_cpp, overlay_cpp):
            self.assertIn("pid_actuator_hz = 2000", source)
            self.assertIn("pid_kp = 0.0200f", source)
            self.assertIn("pid_ki = 0.0003f", source)
            self.assertIn("pid_kd = 0.0001f", source)
            self.assertIn("pid_deadzone_px = 10.0f", source)
            self.assertIn("pid_max_pixel_step = 0.80f", source)
            self.assertIn("pid_output_scale = 0.10f", source)
            self.assertIn("pid_min_output_scale = 0.05f", source)
            self.assertIn("pid_max_output_scale = 0.075f", source)
            self.assertIn("pid_size_reference_px = 640.0f", source)
            self.assertIn("pid_bullseye_min_radius_px = 4.0f", source)
            self.assertIn("pid_bullseye_hold_feedforward = 0.0f", source)
            self.assertIn("pid_bullseye_hold_damping = 1.0f", source)

        self.assertIn('input_method = "RAZER"', config_cpp)
        self.assertIn("pid_governor_enabled = true", config_cpp)
        self.assertIn("PID Governor", neural_cpp)
        self.assertIn("pid_governor_enabled", neural_cpp)
        self.assertIn("pid_governor_model_path", neural_cpp)
        self.assertIn("pid_governor_blend", neural_cpp)
        self.assertIn("pid_governor_max_speed_multiple", neural_cpp)
        self.assertIn("double kp = 0.0200", mouse_h)
        self.assertIn("double ki = 0.0003", mouse_h)
        self.assertIn("double kd = 0.0001", mouse_h)
        self.assertIn("int actuatorHz = 2000", mouse_h)
        self.assertIn("0.0200", mouse_cpp)
        self.assertIn("0.0003", mouse_cpp)
        self.assertIn("0.0001", mouse_cpp)
        self.assertIn("0.0", mouse_cpp)
        self.assertIn("1.0", mouse_cpp)

    def test_project_actuator_hz_cap_is_raised_to_2000(self):
        config_cpp = self.read("sunone_aimbot_2/config/config.cpp")
        mouse_cpp = self.read("sunone_aimbot_2/mouse/mouse.cpp")
        pid_cpp = self.read("sunone_aimbot_2/mouse/PidMouseController.cpp")
        overlay_cpp = self.read("sunone_aimbot_2/overlay/draw_mouse.cpp")

        self.assertIn("pid_actuator_hz > 2000", config_cpp)
        self.assertIn("30.0, 2000.0", mouse_cpp)
        self.assertIn("30.0, 2000.0", pid_cpp)
        self.assertIn('ImGui::SliderInt("Actuator Hz", &config.pid_actuator_hz, 30, 2000)', overlay_cpp)
        self.assertIn('ImGui::SliderFloat("Size reference (px)", &config.pid_size_reference_px, 1.0f, 640.0f', overlay_cpp)

    def test_dataset_defaults_match_working_dml_dataset_values(self):
        default_pid = PidConfig()
        self.assertEqual(default_pid.actuator_hz, 2000)
        self.assertAlmostEqual(default_pid.kp, 0.0200)
        self.assertAlmostEqual(default_pid.ki, 0.0003)
        self.assertAlmostEqual(default_pid.kd, 0.0001)
        self.assertAlmostEqual(default_pid.max_pixel_step, 0.80)
        self.assertAlmostEqual(default_pid.output_scale, 0.10)
        self.assertAlmostEqual(default_pid.size_reference_px, 640.0)

        with tempfile.TemporaryDirectory() as tmp:
            missing = Path(tmp) / "missing.ini"
            loaded = load_pid_config(missing)

        self.assertEqual(loaded.actuator_hz, 2000)
        self.assertAlmostEqual(loaded.kp, 0.0200)
        self.assertAlmostEqual(loaded.ki, 0.0003)
        self.assertAlmostEqual(loaded.kd, 0.0001)

        dataset_py = self.read("training/pid_governor/dataset.py")
        self.assertIn("target_size * 0.085", dataset_py)
        self.assertIn("_clamp(args.max_speed_multiple, 1.0, 100.0)", dataset_py)

        mirrored_dataset_paths = [
            "training_non_cuda/pid_governor/dataset.py",
            "non_cuda/x64/DML/training/pid_governor/dataset.py",
            "x64/cuda_onnx/training/pid_governor/dataset.py",
            "x64/DML/training/pid_governor/dataset.py",
            "x64/DML/training/training/pid_governor/dataset.py",
            "x64/good/DML/training/pid_governor/dataset.py",
            "x64/good/DML/training/training/pid_governor/dataset.py",
        ]
        for path in mirrored_dataset_paths:
            dataset_copy = self.read(path)
            self.assertIn("actuator_hz: int = 2000", dataset_copy)
            self.assertIn("kp: float = 0.0200", dataset_copy)
            self.assertIn("ki: float = 0.0003", dataset_copy)
            self.assertIn("kd: float = 0.0001", dataset_copy)
            self.assertIn("size_reference_px: float = 640.0", dataset_copy)
            self.assertIn("_clamp(args.max_speed_multiple, 1.0, 100.0)", dataset_copy)

    def test_source_config_defaults_match_working_dml_aim_and_tracker_values(self):
        config_cpp = self.read("sunone_aimbot_2/config/config.cpp")

        for token in [
            "body_y_offset = 0.08f",
            "head_y_offset = 0.55f",
            "aim_region_min_px = 10.0f",
            "aim_region_max_px = 49.5f",
            "nanokeep_track_high_thresh = 0.01f",
            "nanokeep_track_low_thresh = 0.01f",
            "nanokeep_track_buffer = 1",
            "nanokeep_fuse_score = false",
        ]:
            self.assertIn(token, config_cpp)


if __name__ == "__main__":
    unittest.main()
