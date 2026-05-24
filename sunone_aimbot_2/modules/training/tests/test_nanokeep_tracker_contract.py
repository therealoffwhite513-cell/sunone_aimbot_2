import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


class NanoKeepTrackerContractTests(unittest.TestCase):
    def read(self, relative: str) -> str:
        return (REPO_ROOT / relative).read_text(encoding="utf-8", errors="replace")

    def test_nanokeep_tracker_files_define_botsort_lite_backend(self):
        header = self.read("sunone_aimbot_2/mouse/NanoKeepTracker.h")
        source = self.read("sunone_aimbot_2/mouse/NanoKeepTracker.cpp")

        self.assertIn("class NanoKeepTracker", header)
        self.assertIn("struct NanoKeepConfig", header)
        self.assertIn("enum class NanoKeepTrackState", header)
        self.assertIn("update(", header)
        self.assertIn("predict(", header)
        self.assertIn("getLockedTarget", header)

        for token in [
            "tracked_",
            "lost_",
            "removed_",
            "trackHighThresh",
            "trackLowThresh",
            "newTrackThresh",
            "matchThresh",
            "fuseScore",
            "linearAssignment",
            "KalmanXYWH",
            "state.mean[4]",
            "state.mean[5]",
        ]:
            self.assertIn(token, source)

    def test_project_builds_nanokeep_files(self):
        project = self.read("sunone_aimbot_2/sunone_aimbot_2.vcxproj")
        filters = self.read("sunone_aimbot_2/sunone_aimbot_2.vcxproj.filters")

        self.assertIn('ClCompile Include="mouse\\NanoKeepTracker.cpp"', project)
        self.assertIn('ClInclude Include="mouse\\NanoKeepTracker.h"', project)
        self.assertIn('ClCompile Include="mouse\\NanoKeepTracker.cpp"', filters)
        self.assertIn('ClInclude Include="mouse\\NanoKeepTracker.h"', filters)

    def test_config_and_gui_expose_nanokeep_switch_and_thresholds(self):
        config_h = self.read("sunone_aimbot_2/config/config.h")
        config_cpp = self.read("sunone_aimbot_2/config/config.cpp")
        neural_ui = self.read("sunone_aimbot_2/overlay/draw_neural.cpp")

        for field in [
            "nanokeep_enabled",
            "nanokeep_track_high_thresh",
            "nanokeep_track_low_thresh",
            "nanokeep_new_track_thresh",
            "nanokeep_match_thresh",
            "nanokeep_track_buffer",
            "nanokeep_fuse_score",
            "nanokeep_position_smoothing",
            "nanokeep_velocity_smoothing",
        ]:
            self.assertIn(field, config_h)
            self.assertIn(field, config_cpp)

        self.assertIn("NanoKeep", neural_ui)
        self.assertIn("Enable NanoKeep tracker", neural_ui)
        self.assertIn("High threshold", neural_ui)
        self.assertIn("Match threshold", neural_ui)

    def test_runtime_can_switch_between_nanokeep_and_existing_tracker(self):
        runtime = self.read("sunone_aimbot_2/runtime/mouse_thread_loop.cpp")

        self.assertIn('#include "NanoKeepTracker.h"', runtime)
        self.assertIn("NanoKeepTracker nanoKeepTracker", runtime)
        self.assertIn("config.nanokeep_enabled", runtime)
        self.assertIn("nanoKeepTracker.update", runtime)
        self.assertIn("targetTracker.update", runtime)
        self.assertIn("nanoKeepTracker.getLockedTarget", runtime)

    def test_pid_uses_self_motion_corrected_target_velocity(self):
        header = self.read("sunone_aimbot_2/mouse/PidMouseController.h")
        source = self.read("sunone_aimbot_2/mouse/PidMouseController.cpp")

        self.assertIn("selfMotionSinceObservationX", header)
        self.assertIn("selfMotionSinceObservationY", header)
        self.assertIn("latestErrorX", header)
        self.assertIn("latestErrorY", header)
        self.assertIn("selfMotionSinceObservationX += outX", source)
        self.assertIn("selfMotionSinceObservationY += outY", source)
        self.assertIn("correctedDeltaX", source)
        self.assertIn("correctedDeltaY", source)


if __name__ == "__main__":
    unittest.main()
