import re
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


class TimestampPropagationContractTest(unittest.TestCase):
    def read(self, relative_path):
        return (REPO_ROOT / relative_path).read_text(encoding="utf-8")

    def test_detection_buffer_get_can_return_detection_timestamp(self):
        buffer_h = self.read("sunone_aimbot_2/detector/detection_buffer.h")

        self.assertIn("outTimestamp", buffer_h)
        self.assertIn("*outTimestamp = timestamp", buffer_h)

    def test_mouse_loop_propagates_detection_timestamp_to_tracker_and_pid(self):
        loop = self.read("sunone_aimbot_2/runtime/mouse_thread_loop.cpp")

        self.assertIn("detectionTimestamp = detectionBuffer.timestamp", loop)
        self.assertRegex(
            loop,
            re.compile(r"targetTracker\.update\([\s\S]*detectionTimestamp[\s\S]*\);"),
        )
        self.assertIn("lastTrackerUpdate = detectionTimestamp", loop)
        self.assertIn("activeTarget->timestamp", loop)

    def test_tracker_and_target_carry_update_timestamp(self):
        target_h = self.read("sunone_aimbot_2/mouse/AimbotTarget.h")
        target_cpp = self.read("sunone_aimbot_2/mouse/AimbotTarget.cpp")

        self.assertIn("std::chrono::steady_clock::time_point timestamp", target_h)
        self.assertIn("updateTimestamp", target_h)
        self.assertIn("updateTimestamp.time_since_epoch().count()", target_cpp)
        self.assertIn("t.lastUpdate", target_cpp)
        self.assertIn("t.lastUpdate", target_cpp)

    def test_pid_observation_uses_supplied_detection_timestamp(self):
        mouse_h = self.read("sunone_aimbot_2/mouse/mouse.h")
        mouse_cpp = self.read("sunone_aimbot_2/mouse/mouse.cpp")

        self.assertIn("observationTimestamp", mouse_h)
        self.assertIn("observationTimestamp", mouse_cpp)
        self.assertIn("observation.timestamp = observationTimestamp", mouse_cpp)
        self.assertNotIn("observation.timestamp = std::chrono::steady_clock::now()", mouse_cpp)


if __name__ == "__main__":
    unittest.main()
