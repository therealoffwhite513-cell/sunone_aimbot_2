import re
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


class PredictionSmoothingContractTest(unittest.TestCase):
    def read(self, relative_path):
        return (REPO_ROOT / relative_path).read_text(encoding="utf-8")

    def test_tracker_exposes_prediction_tick_for_detection_gaps(self):
        target_h = self.read("sunone_aimbot_2/mouse/AimbotTarget.h")
        target_cpp = self.read("sunone_aimbot_2/mouse/AimbotTarget.cpp")

        self.assertIn("void predict(", target_h)
        self.assertIn("advancePredictedTrack", target_h)
        self.assertIn("MultiTargetTracker::predict(", target_cpp)
        self.assertIn("advancePredictedTrack(", target_cpp)

    def test_mouse_loop_publishes_predicted_locked_target_between_detections(self):
        loop = self.read("sunone_aimbot_2/runtime/mouse_thread_loop.cpp")

        self.assertRegex(
            loop,
            re.compile(r"if\s*\(!hasNewDetection[\s\S]*targetTracker\.predict\(", re.DOTALL),
        )
        self.assertRegex(
            loop,
            re.compile(r"targetTracker\.getLockedTarget\(lockInfo\)[\s\S]*hasAimObservation\s*=\s*true", re.DOTALL),
        )
        self.assertIn("mouseThread.moveMouse(*activeTarget)", loop)
        self.assertIn("activeTarget->timestamp", loop)

    def test_tracker_smooths_reacquired_locked_tracks(self):
        target_h = self.read("sunone_aimbot_2/mouse/AimbotTarget.h")
        target_cpp = self.read("sunone_aimbot_2/mouse/AimbotTarget.cpp")

        for token in (
            "reacquisitionSmoothingFramesRemaining",
            "reacquisitionSmoothingFramesTotal",
            "reacquisitionStartBox",
            "reacquisitionTargetBox",
        ):
            self.assertIn(token, target_h)

        self.assertIn("beginReacquisitionSmoothing", target_cpp)
        self.assertIn("applyReacquisitionSmoothing", target_cpp)
        self.assertIn("const int missedBeforeUpdate = t.missed", target_cpp)


if __name__ == "__main__":
    unittest.main()
